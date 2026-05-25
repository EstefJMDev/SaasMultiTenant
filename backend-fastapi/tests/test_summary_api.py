from fastapi import status
from fastapi.testclient import TestClient


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def test_summary_starts_empty(client: TestClient) -> None:
    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": "1"}

    response = client.get("/api/v1/erp/summary/2026", headers=headers)
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "projectJustify": {},
        "projectJustified": {},
        "summaryMilestones": {},
    }


def test_summary_put_and_get_roundtrip(client: TestClient) -> None:
    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": "1"}

    payload = {
        "projectJustify": {1: 120.5, 2: 80.0},
        "projectJustified": {1: 60.5},
        "summaryMilestones": {
            1: [{"label": "H1", "hours": 30.0}],
            2: [{"label": "H2", "hours": 10.0}],
        },
    }

    put_response = client.put(
        "/api/v1/erp/summary/2026",
        headers=headers,
        json=payload,
    )
    assert put_response.status_code == status.HTTP_200_OK
    body = put_response.json()
    assert body["projectJustify"]["1"] == 120.5
    assert body["projectJustified"]["1"] == 60.5
    assert body["summaryMilestones"]["1"][0]["label"] == "H1"

    fetch_response = client.get("/api/v1/erp/summary/2026", headers=headers)
    assert fetch_response.status_code == status.HTTP_200_OK
    stored = fetch_response.json()
    assert stored["projectJustify"]["2"] == 80.0
    assert stored["summaryMilestones"]["2"][0]["hours"] == 10.0

    second_payload = {
        "projectJustify": {1: 200.0},
        "projectJustified": {1: 70.0},
        "summaryMilestones": {1: [{"label": "H1", "hours": 50.0}]},
    }
    client.put("/api/v1/erp/summary/2026", headers=headers, json=second_payload)
    reloaded = client.get("/api/v1/erp/summary/2026", headers=headers).json()
    assert reloaded["projectJustify"]["1"] == 200.0
    assert reloaded["summaryMilestones"]["1"][0]["hours"] == 50.0
