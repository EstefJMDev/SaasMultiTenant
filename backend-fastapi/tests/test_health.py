from fastapi import status
from fastapi.testclient import TestClient


def test_health_check(client: TestClient) -> None:
    """
    Test básico del endpoint de health.

    Smoke test: la app arranca y responde 200 en /api/v1/health/.
    """

    response = client.get("/api/v1/health/")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "Strict-Transport-Security" not in response.headers
