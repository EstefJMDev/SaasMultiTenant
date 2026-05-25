from fastapi import status
from fastapi.testclient import TestClient


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def test_superadmin_requires_tenant_header_for_erp_summary(
    client: TestClient,
) -> None:
    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}"}

    missing = client.get("/api/v1/erp/summary/2026", headers=headers)
    assert missing.status_code == status.HTTP_400_BAD_REQUEST

    with_header = client.get(
        "/api/v1/erp/summary/2026",
        headers={**headers, "X-Tenant-Id": "1"},
    )
    assert with_header.status_code in (
        status.HTTP_200_OK,
        status.HTTP_403_FORBIDDEN,
    )
