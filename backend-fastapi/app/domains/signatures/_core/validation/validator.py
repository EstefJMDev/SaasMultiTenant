from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from io import BytesIO
from typing import Any

import httpx
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.x509 import ocsp
from cryptography.x509.oid import AuthorityInformationAccessOID, ExtensionOID

from app.domains.signatures._core.tsl.manager import TSLManager


@dataclass
class ValidationResult:
    conclusion: str
    reason: str
    report: dict[str, Any]


class SignatureValidator:
    """
    Validador ETSI-like.
    Nota: en esta version se entrega el esqueleto productivo con controles
    de integridad + evidencia de cadena/revocacion marcada como observada/no disponible.
    """

    def __init__(self) -> None:
        self.tsl_manager = TSLManager()
        self._pyhanko_available = True
        try:
            import pyhanko  # noqa: F401
        except Exception:
            self._pyhanko_available = False

    def _parse_certificate_chain(self, cert_chain_b64: list[str] | None) -> dict[str, Any]:
        chain = cert_chain_b64 or []
        if not chain:
            return {"chain_present": False}
        try:
            raw = base64.b64decode(str(chain[0]).encode("ascii"), validate=False)
            cert = x509.load_der_x509_certificate(raw)
            issuer_obj = None
            if len(chain) > 1:
                try:
                    issuer_raw = base64.b64decode(str(chain[1]).encode("ascii"), validate=False)
                    issuer_obj = x509.load_der_x509_certificate(issuer_raw)
                except Exception:
                    issuer_obj = None
            return {
                "chain_present": True,
                "subject_dn": cert.subject.rfc4514_string(),
                "issuer_dn": cert.issuer.rfc4514_string(),
                "serial": format(cert.serial_number, "x"),
                "sha256": cert.fingerprint(hashes.SHA256()).hex(),
                "not_before": cert.not_valid_before_utc.isoformat(),
                "not_after": cert.not_valid_after_utc.isoformat(),
                "_cert_obj": cert,
                "_issuer_obj": issuer_obj,
            }
        except Exception:
            return {"chain_present": True, "parse_error": True}

    def _validate_with_pyhanko(self, signed_pdf: bytes) -> tuple[bool, str]:
        if not self._pyhanko_available:
            return False, "pyhanko_not_available"
        try:
            from pyhanko.pdf_utils.reader import PdfFileReader
            from pyhanko.sign.validation import validate_pdf_signature

            reader = PdfFileReader(BytesIO(signed_pdf))
            embedded = list(getattr(reader, "embedded_signatures", []) or [])
            if not embedded:
                return False, "no_embedded_signatures"
            status = validate_pdf_signature(embedded[0])
            bottom_line = bool(getattr(status, "bottom_line", False))
            if bottom_line:
                return True, "pyhanko_ok"
            return False, "pyhanko_not_trusted"
        except Exception as exc:
            return False, f"pyhanko_error:{type(exc).__name__}"

    def _check_algorithm_policy(self, cert_info: dict[str, Any]) -> dict[str, Any]:
        if not cert_info.get("chain_present"):
            return {"ok": False, "reason": "missing_signer_certificate"}
        cert_obj = cert_info.get("_cert_obj")
        if cert_obj is None:
            return {"ok": False, "reason": "certificate_parse_error"}
        key = cert_obj.public_key()
        if isinstance(key, rsa.RSAPublicKey):
            key_bits = key.key_size
            return {"ok": key_bits >= 2048, "key_type": "RSA", "key_bits": key_bits}
        if isinstance(key, ec.EllipticCurvePublicKey):
            key_bits = key.key_size
            return {"ok": key_bits >= 256, "key_type": "EC", "key_bits": key_bits}
        return {"ok": False, "reason": f"unsupported_key_type:{type(key).__name__}"}

    def _check_revocation(self, cert_info: dict[str, Any]) -> dict[str, Any]:
        cert = cert_info.get("_cert_obj")
        issuer = cert_info.get("_issuer_obj")
        if cert is None or issuer is None:
            return {
                "method": "NONE",
                "status": "UNKNOWN",
                "detail": "issuer_or_cert_missing",
            }
        try:
            aia = cert.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_INFORMATION_ACCESS).value
            ocsp_urls = [
                item.access_location.value
                for item in aia
                if item.access_method == AuthorityInformationAccessOID.OCSP
            ]
        except Exception:
            ocsp_urls = []
        for ocsp_url in ocsp_urls:
            try:
                builder = ocsp.OCSPRequestBuilder().add_certificate(cert, issuer, hashes.SHA1())
                req = builder.build()
                resp = httpx.post(
                    ocsp_url,
                    content=req.public_bytes(),
                    headers={"Content-Type": "application/ocsp-request"},
                    timeout=10.0,
                )
                resp.raise_for_status()
                ocsp_resp = ocsp.load_der_ocsp_response(resp.content)
                if ocsp_resp.response_status != ocsp.OCSPResponseStatus.SUCCESSFUL:
                    continue
                status_obj = ocsp_resp.certificate_status
                if status_obj == ocsp.OCSPCertStatus.GOOD:
                    return {
                        "method": "OCSP",
                        "status": "GOOD",
                        "ocsp_response_b64": base64.b64encode(resp.content).decode("ascii"),
                    }
                if status_obj == ocsp.OCSPCertStatus.REVOKED:
                    return {
                        "method": "OCSP",
                        "status": "REVOKED",
                        "ocsp_response_b64": base64.b64encode(resp.content).decode("ascii"),
                    }
                return {
                    "method": "OCSP",
                    "status": "UNKNOWN",
                    "ocsp_response_b64": base64.b64encode(resp.content).decode("ascii"),
                }
            except Exception:
                continue
        try:
            crl_ext = cert.extensions.get_extension_for_oid(ExtensionOID.CRL_DISTRIBUTION_POINTS).value
            crl_urls: list[str] = []
            for point in crl_ext:
                if point.full_name:
                    for name in point.full_name:
                        value = getattr(name, "value", None)
                        if isinstance(value, str) and value.lower().startswith("http"):
                            crl_urls.append(value)
            for crl_url in crl_urls:
                try:
                    resp = httpx.get(crl_url, timeout=12.0)
                    resp.raise_for_status()
                    crl = x509.load_der_x509_crl(resp.content)
                    revoked = crl.get_revoked_certificate_by_serial_number(cert.serial_number)
                    return {
                        "method": "CRL",
                        "status": "REVOKED" if revoked else "GOOD",
                        "crl_url_used": crl_url,
                    }
                except Exception:
                    continue
        except Exception:
            pass
        return {"method": "NONE", "status": "UNKNOWN"}

    def validate(
        self,
        *,
        original_pdf: bytes,
        signed_pdf: bytes,
        signature_container: bytes | None,
        cert_chain_b64: list[str] | None,
        tsa_used: bool,
        require_strict_revocation: bool = False,
    ) -> ValidationResult:
        tsl_xml, meta = self.tsl_manager.get_or_refresh()
        has_signature = bool(signature_container)
        cert_info = self._parse_certificate_chain(cert_chain_b64)
        cert_info_public = {k: v for k, v in cert_info.items() if not k.startswith("_")}
        algorithm_policy = self._check_algorithm_policy(cert_info)
        revocation = self._check_revocation(cert_info)
        has_certs = bool(cert_info.get("chain_present"))
        signed_hash = hashlib.sha256(signed_pdf).hexdigest()
        original_hash = hashlib.sha256(original_pdf).hexdigest()
        pyhanko_ok, pyhanko_reason = self._validate_with_pyhanko(signed_pdf)

        if has_signature and pyhanko_ok and algorithm_policy.get("ok", False):
            conclusion = "TOTAL_PASSED"
            reason = "Firma PAdES validada con pyhanko."
        elif has_signature and revocation.get("status") == "REVOKED":
            conclusion = "TOTAL_FAILED"
            reason = "Certificado revocado."
        elif has_signature and has_certs:
            if require_strict_revocation and revocation.get("status") not in {"GOOD", "REVOKED"}:
                conclusion = "TOTAL_FAILED"
                reason = "No se pudo validar revocacion en modo estricto."
            else:
                conclusion = "INDETERMINATE"
                reason = "Firma presente, pero sin validacion criptografica concluyente."
        else:
            conclusion = "TOTAL_FAILED"
            reason = "No hay firma valida para procesar."

        report = {
            "standard": "ETSI EN 319 102-1 (ETSI-like)",
            "conclusion": conclusion,
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "integrity": {
                "original_sha256": original_hash,
                "signed_sha256": signed_hash,
                "signed_differs_from_original": original_hash != signed_hash,
            },
            "ades": {
                "profile": "PAdES-B-B",
                "upgraded_to_lt": False,
                "upgraded_to_lta": False,
                "tsa_used": tsa_used,
            },
            "certificate_validation": {
                "chain_present": has_certs,
                "trust_chain_ok": pyhanko_ok if has_certs else False,
                "revocation_ok": revocation.get("status") == "GOOD",
                "revocation_method": revocation.get("method"),
                "revocation_status": revocation.get("status"),
                "ocsp_response_b64": revocation.get("ocsp_response_b64"),
                "crl_url_used": revocation.get("crl_url_used"),
                "qualified_signature_observed": None,
                "qscd_observed": None,
                "certificate": cert_info_public,
                "algorithm_policy": algorithm_policy,
            },
            "pades_validation": {
                "engine": "pyhanko" if self._pyhanko_available else "fallback",
                "result": pyhanko_ok,
                "reason": pyhanko_reason,
            },
            "tsl": {
                "source": meta.source_url,
                "sequence_number": meta.sequence_number,
                "next_update": meta.next_update.isoformat() if meta.next_update else None,
                "xml_cached_bytes": len(tsl_xml.encode("utf-8")) if tsl_xml else 0,
            },
        }
        return ValidationResult(conclusion=conclusion, reason=reason, report=report)

