from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings


class SignaturitClient:
    def __init__(self) -> None:
        self.base_url = settings.signaturit_base_url.rstrip("/")
        self.api_token = settings.signaturit_api_token
        self.timeout = settings.signaturit_timeout_seconds

    def _headers(self) -> dict[str, str]:
        if not self.api_token:
            return {}
        return {"Authorization": f"Bearer {self.api_token}"}

    def create_signature(
        self,
        *,
        file_path: Path,
        signer_name: str,
        signer_email: str,
        events_url: str | None,
        delivery_type: str = "url",
        signature_mode: str = "biometric",
        digital_certificate_name: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, str] = {
            "recipients[0][name]": signer_name,
            "recipients[0][email]": signer_email,
            "delivery_type": delivery_type,
        }
        if signature_mode == "certificate":
            # Signaturit option: require recipient signature with uploaded digital certificate file.
            data["recipients[0][sign_with_digital_certificate_file]"] = "true"
            if digital_certificate_name:
                data["recipients[0][digital_certificate_name]"] = digital_certificate_name
        if events_url:
            data["events_url"] = events_url
        for key, value in (metadata or {}).items():
            data[f"data[{key}]"] = str(value)

        with file_path.open("rb") as f:
            files = [
                ("files[0]", (file_path.name, f, "application/pdf")),
            ]
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/signatures.json",
                    headers=self._headers(),
                    data=data,
                    files=files,
                )
                response.raise_for_status()
                return response.json()

    def get_signature(self, signature_id: str) -> dict[str, Any]:
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get(
                f"{self.base_url}/signatures/{signature_id}.json",
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()

    def download_signed(self, *, signature_id: str, document_id: str) -> bytes:
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get(
                f"{self.base_url}/signatures/{signature_id}/documents/{document_id}/download/signed",
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.content

    def generate_audit_trail(self, signature_id: str) -> dict[str, Any]:
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                f"{self.base_url}/signatures/{signature_id}/generate/audit_trail",
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()

    def download_audit_trail(self, *, signature_id: str, document_id: str) -> bytes:
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get(
                f"{self.base_url}/signatures/{signature_id}/documents/{document_id}/download/audit_trail",
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.content
