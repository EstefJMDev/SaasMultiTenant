from app.domains.signatures._core.factory import SignatureProviderFactory
from app.domains.signatures._core.models import SignatureProviderType
from app.domains.signatures._core.providers.autofirma import AutofirmaProvider
from app.domains.signatures._core.providers.signaturit import SignaturitProvider
from app.domains.signatures._core.validation.validator import SignatureValidator


def test_signature_provider_factory_resolves_signaturit():
    provider = SignatureProviderFactory(session=None).get(SignatureProviderType.SIGNATURIT)  # type: ignore[arg-type]
    assert isinstance(provider, SignaturitProvider)


def test_signature_provider_factory_resolves_autofirma():
    provider = SignatureProviderFactory(session=None).get(SignatureProviderType.AUTOFIRMA)  # type: ignore[arg-type]
    assert isinstance(provider, AutofirmaProvider)


def test_validator_returns_etsi_like_report(monkeypatch):
    class FakeTSLManager:
        def get_or_refresh(self):
            from datetime import datetime, timezone
            from app.domains.signatures._core.tsl.manager import TSLMetadata

            return (
                "<TSL />",
                TSLMetadata(
                    source_url="https://example.test/tsl.xml",
                    sequence_number="123",
                    next_update=None,
                    refreshed_at=datetime.now(timezone.utc),
                ),
            )

    validator = SignatureValidator()
    validator.tsl_manager = FakeTSLManager()  # type: ignore[assignment]
    result = validator.validate(
        original_pdf=b"%PDF-1.7 original",
        signed_pdf=b"%PDF-1.7 signed",
        signature_container=b"cms",
        cert_chain_b64=["AAA="],
        tsa_used=False,
    )
    assert result.conclusion in {"TOTAL_PASSED", "INDETERMINATE", "TOTAL_FAILED"}
    assert result.report["standard"].startswith("ETSI")


def test_validator_fails_when_no_signature(monkeypatch):
    class FakeTSLManager:
        def get_or_refresh(self):
            from datetime import datetime, timezone
            from app.domains.signatures._core.tsl.manager import TSLMetadata

            return (
                "<TSL />",
                TSLMetadata(
                    source_url="https://example.test/tsl.xml",
                    sequence_number="123",
                    next_update=None,
                    refreshed_at=datetime.now(timezone.utc),
                ),
            )

    validator = SignatureValidator()
    validator.tsl_manager = FakeTSLManager()  # type: ignore[assignment]
    validator._pyhanko_available = False  # type: ignore[attr-defined]
    result = validator.validate(
        original_pdf=b"%PDF-1.7 original",
        signed_pdf=b"%PDF-1.7 signed",
        signature_container=None,
        cert_chain_b64=[],
        tsa_used=False,
    )
    assert result.conclusion == "TOTAL_FAILED"
