from __future__ import annotations

from dataclasses import dataclass
import base64
from datetime import datetime, timezone
import os
from typing import Any

import httpx


@dataclass
class TimestampResult:
    used: bool
    authority: str | None
    response_b64: str | None
    token_b64: str | None = None
    gen_time: str | None = None
    error: str | None = None


class TimestampService:
    """
    Cliente TSA RFC3161 simplificado.
    """

    def request_timestamp(
        self,
        *,
        tsa_url: str | None,
        digest: bytes,
        username: str | None = None,
        password: str | None = None,
        timeout_seconds: int = 15,
    ) -> TimestampResult:
        if not tsa_url:
            return TimestampResult(used=False, authority=None, response_b64=None, error="TSA no configurada.")

        headers = {"Content-Type": "application/timestamp-query"}
        auth = (username, password) if username and password else None
        nonce = int.from_bytes(os.urandom(8), "big")
        payload = digest
        parser_available = False
        try:
            from asn1crypto import algos, core, tsp

            req = tsp.TimeStampReq(
                {
                    "version": "v1",
                    "message_imprint": {
                        "hash_algorithm": algos.DigestAlgorithm({"algorithm": "sha256"}),
                        "hashed_message": digest,
                    },
                    "nonce": core.Integer(nonce),
                    "cert_req": True,
                }
            )
            payload = req.dump()
            parser_available = True
        except Exception:
            parser_available = False
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                resp = client.post(tsa_url, content=payload, headers=headers, auth=auth)
                resp.raise_for_status()
            token_b64 = None
            gen_time = None
            if parser_available:
                try:
                    from asn1crypto import tsp

                    parsed = tsp.TimeStampResp.load(resp.content)
                    token = parsed.get("time_stamp_token")
                    if token is not None:
                        token_b64 = base64.b64encode(token.dump()).decode("ascii")
                        tst_info = token["content"]["encap_content_info"]["content"].parsed
                        gen_time = str(tst_info["gen_time"].native)
                except Exception:
                    pass
            return TimestampResult(
                used=True,
                authority=tsa_url,
                response_b64=base64.b64encode(resp.content).decode("ascii"),
                token_b64=token_b64,
                gen_time=gen_time,
                error=None,
            )
        except Exception as exc:
            return TimestampResult(
                used=False,
                authority=tsa_url,
                response_b64=None,
                token_b64=None,
                gen_time=None,
                error=f"{type(exc).__name__}: {exc}",
            )

    @staticmethod
    def build_evidence_fragment(result: TimestampResult) -> dict[str, Any]:
        return {
            "timestamp_used": result.used,
            "timestamp_authority": result.authority,
            "timestamp_response_b64": result.response_b64,
            "timestamp_token_b64": result.token_b64,
            "timestamp_time": result.gen_time,
            "timestamp_error": result.error,
            "timestamp_checked_at": datetime.now(timezone.utc).isoformat(),
        }
