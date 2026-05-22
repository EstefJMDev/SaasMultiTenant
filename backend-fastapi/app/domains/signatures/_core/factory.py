from __future__ import annotations

from sqlmodel import Session

from app.domains.signatures._core.models import SignatureProviderType
from app.domains.signatures._core.providers.autofirma import AutofirmaProvider
from app.domains.signatures._core.providers.base import SignatureProvider
from app.domains.signatures._core.providers.signaturit import SignaturitProvider


class SignatureProviderFactory:
    def __init__(self, *, session: Session) -> None:
        self.session = session

    def get(self, provider: SignatureProviderType) -> SignatureProvider:
        if provider == SignatureProviderType.AUTOFIRMA:
            return AutofirmaProvider(session=self.session)
        return SignaturitProvider(session=self.session)

