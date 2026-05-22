from __future__ import annotations

from decimal import Decimal
import uuid

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.seed_rbac import run_seed
from app.core.security import hash_password
from app.models.mfa_email_code import MFAEmailCode
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User


def _create_tenant_and_admin(db: Session) -> tuple[int, str, str]:
    run_seed()

    tenant = Tenant(
        name=f"Tenant HR {uuid.uuid4().hex[:6]}",
        subdomain=f"tenant-hr-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    admin_email = f"admin.hr+{uuid.uuid4().hex[:8]}@example.com"
    admin = User(
        email=admin_email,
        full_name="Admin HR",
        hashed_password=hash_password("hr-pass"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    tenant_admin_role = db.exec(select(Role).where(Role.name == "tenant_admin")).one()
    admin.role_id = tenant_admin_role.id
    db.add(admin)
    db.commit()

    return tenant.id, admin_email, "hr-pass"


def _ensure_org_tool(db: Session, tenant_id: int, enabled: bool = True) -> None:
    tool = db.exec(select(Tool).where(Tool.slug == "org")).one_or_none()
    if not tool:
        tool = Tool(
            name="Org",
            slug="org",
            base_url="https://example.local/org",
            description="Org",
        )
        db.add(tool)
        db.commit()
        db.refresh(tool)

    tenant_tool = db.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool.id,
        )
    ).one_or_none()
    if not tenant_tool:
        db.add(TenantTool(tenant_id=tenant_id, tool_id=tool.id, is_enabled=enabled))
    else:
        tenant_tool.is_enabled = enabled
        db.add(tenant_tool)
    db.commit()


def _login_with_mfa(
    client: TestClient,
    email: str,
    password: str,
    db: Session,
) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["mfa_required"] is True

    user = db.exec(select(User).where(User.email == email)).one()
    mfa_record = db.exec(select(MFAEmailCode).where(MFAEmailCode.user_id == user.id)).one()

    code = "654321"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db.add(mfa_record)
    db.commit()

    resp_mfa = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": email, "mfa_code": code},
    )
    assert resp_mfa.status_code == status.HTTP_200_OK
    token_body = resp_mfa.json()
    assert token_body["mfa_required"] is False
    return token_body["access_token"]


def _auth_headers_for_new_tenant(
    client: TestClient,
    db: Session,
) -> tuple[int, dict[str, str]]:
    tenant_id, admin_email, admin_password = _create_tenant_and_admin(db)
    _ensure_org_tool(db, tenant_id, enabled=True)
    token = _login_with_mfa(client, admin_email, admin_password, db)
    return tenant_id, {"Authorization": f"Bearer {token}"}


def _create_employee(
    client: TestClient,
    headers: dict[str, str],
    *,
    available_hours: Decimal,
    availability_percentage: Decimal,
    full_name: str = "Empleado Prueba",
) -> dict:
    payload = {
        "full_name": full_name,
        "employment_type": "permanent",
        "is_active": True,
        "available_hours": float(available_hours),
        "availability_percentage": float(availability_percentage),
    }
    response = client.post("/api/v1/hr/employees", json=payload, headers=headers)
    assert response.status_code == status.HTTP_201_CREATED
    return response.json()


def test_year_availability_fallback_to_profile_values(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    _, headers = _auth_headers_for_new_tenant(client, db_session_fixture)
    employee = _create_employee(
        client,
        headers,
        available_hours=Decimal("700"),
        availability_percentage=Decimal("50"),
    )

    response = client.get("/api/v1/hr/employees", params={"year": 2024}, headers=headers)
    assert response.status_code == status.HTTP_200_OK
    rows = response.json()
    row = next(e for e in rows if e["id"] == employee["id"])
    assert Decimal(str(row["available_hours"])) == Decimal("700")
    assert Decimal(str(row["availability_percentage"])) == Decimal("50")


def test_year_availability_uses_annual_record_when_present(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    _, headers = _auth_headers_for_new_tenant(client, db_session_fixture)
    employee = _create_employee(
        client,
        headers,
        available_hours=Decimal("1000"),
        availability_percentage=Decimal("80"),
    )

    put_resp = client.put(
        f"/api/v1/hr/employees/{employee['id']}/availability/2024",
        headers=headers,
        json={
            "year": 2024,
            "available_hours": 1400,
            "availability_percentage": 25,
        },
    )
    assert put_resp.status_code == status.HTTP_200_OK

    response = client.get("/api/v1/hr/employees", params={"year": 2024}, headers=headers)
    assert response.status_code == status.HTTP_200_OK
    rows = response.json()
    row = next(e for e in rows if e["id"] == employee["id"])
    assert Decimal(str(row["available_hours"])) == Decimal("1400")
    assert Decimal(str(row["availability_percentage"])) == Decimal("25")


def test_allocations_capacity_validation_create_uses_year_limit(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, headers = _auth_headers_for_new_tenant(client, db_session_fixture)
    employee = _create_employee(
        client,
        headers,
        available_hours=Decimal("100"),
        availability_percentage=Decimal("100"),
    )

    over_limit = client.post(
        "/api/v1/hr/allocations",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "employee_id": employee["id"],
            "year": 2025,
            "allocated_hours": 101,
        },
    )
    assert over_limit.status_code == status.HTTP_400_BAD_REQUEST

    within_limit = client.post(
        "/api/v1/hr/allocations",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "employee_id": employee["id"],
            "year": 2025,
            "allocated_hours": 100,
        },
    )
    assert within_limit.status_code == status.HTTP_201_CREATED


def test_allocations_update_excludes_current_row_from_sum(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, headers = _auth_headers_for_new_tenant(client, db_session_fixture)
    employee = _create_employee(
        client,
        headers,
        available_hours=Decimal("100"),
        availability_percentage=Decimal("100"),
    )

    create_resp = client.post(
        "/api/v1/hr/allocations",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "employee_id": employee["id"],
            "year": 2025,
            "allocated_hours": 60,
        },
    )
    assert create_resp.status_code == status.HTTP_201_CREATED
    allocation_id = create_resp.json()["id"]

    update_resp = client.patch(
        f"/api/v1/hr/allocations/{allocation_id}",
        headers=headers,
        json={"allocated_hours": 70},
    )
    assert update_resp.status_code == status.HTTP_200_OK
    assert Decimal(str(update_resp.json()["allocated_hours"])) == Decimal("70")


def test_multi_tenant_isolation_for_year_availability_and_allocations(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a_id, headers_a = _auth_headers_for_new_tenant(client, db_session_fixture)
    tenant_b_id, headers_b = _auth_headers_for_new_tenant(client, db_session_fixture)

    employee_a = _create_employee(
        client,
        headers_a,
        available_hours=Decimal("100"),
        availability_percentage=Decimal("100"),
        full_name="Empleado A",
    )
    employee_b = _create_employee(
        client,
        headers_b,
        available_hours=Decimal("100"),
        availability_percentage=Decimal("100"),
        full_name="Empleado B",
    )

    put_b = client.put(
        f"/api/v1/hr/employees/{employee_b['id']}/availability/2024",
        headers=headers_b,
        json={"year": 2024, "available_hours": 1000, "availability_percentage": 100},
    )
    assert put_b.status_code == status.HTTP_200_OK

    list_a = client.get("/api/v1/hr/employees", params={"year": 2024}, headers=headers_a)
    assert list_a.status_code == status.HTTP_200_OK
    rows_a = list_a.json()
    assert any(row["id"] == employee_a["id"] for row in rows_a)
    assert all(row["id"] != employee_b["id"] for row in rows_a)

    cross_tenant_alloc = client.post(
        "/api/v1/hr/allocations",
        headers=headers_a,
        json={
            "tenant_id": tenant_a_id,
            "employee_id": employee_b["id"],
            "year": 2025,
            "allocated_hours": 10,
        },
    )
    assert cross_tenant_alloc.status_code == status.HTTP_400_BAD_REQUEST

    cross_tenant_get = client.get(
        f"/api/v1/hr/employees/{employee_b['id']}/availability",
        headers=headers_a,
    )
    assert cross_tenant_get.status_code == status.HTTP_403_FORBIDDEN

    # Sanity: tenant B can still operate its own employee availability.
    own_get = client.get(
        f"/api/v1/hr/employees/{employee_b['id']}/availability",
        headers=headers_b,
    )
    assert own_get.status_code == status.HTTP_200_OK
    assert any(item["year"] == 2024 for item in own_get.json())
    assert tenant_b_id != tenant_a_id


def test_year_availability_endpoints_get_put_and_basic_validation(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    _, headers = _auth_headers_for_new_tenant(client, db_session_fixture)
    employee = _create_employee(
        client,
        headers,
        available_hours=Decimal("1760"),
        availability_percentage=Decimal("100"),
    )

    put_resp = client.put(
        f"/api/v1/hr/employees/{employee['id']}/availability/2025",
        headers=headers,
        json={"year": 2025, "available_hours": 1760, "availability_percentage": 80},
    )
    assert put_resp.status_code == status.HTTP_200_OK
    data = put_resp.json()
    assert data["employee_id"] == employee["id"]
    assert data["year"] == 2025
    assert Decimal(str(data["availability_percentage"])) == Decimal("80")

    get_resp = client.get(
        f"/api/v1/hr/employees/{employee['id']}/availability",
        headers=headers,
    )
    assert get_resp.status_code == status.HTTP_200_OK
    rows = get_resp.json()
    assert any(item["year"] == 2025 for item in rows)

    invalid_year = client.put(
        f"/api/v1/hr/employees/{employee['id']}/availability/2025",
        headers=headers,
        json={"year": 2024, "available_hours": 1000, "availability_percentage": 70},
    )
    assert invalid_year.status_code == status.HTTP_400_BAD_REQUEST


def test_department_justifiable_percentage_rule_is_applied_in_backend(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, headers = _auth_headers_for_new_tenant(client, db_session_fixture)

    dept_jefes = client.post(
        "/api/v1/hr/departments",
        headers=headers,
        json={"name": "Jefes de obra", "project_allocation_percentage": 90},
    )
    assert dept_jefes.status_code == status.HTTP_201_CREATED
    dept_jefes_id = dept_jefes.json()["id"]

    dept_especiales = client.post(
        "/api/v1/hr/departments",
        headers=headers,
        json={"name": "Especiales", "project_allocation_percentage": 40},
    )
    assert dept_especiales.status_code == status.HTTP_201_CREATED
    dept_especiales_id = dept_especiales.json()["id"]

    employee_jefes_resp = client.post(
        "/api/v1/hr/employees",
        headers=headers,
        json={
            "full_name": "Empleado Jefes",
            "employment_type": "permanent",
            "is_active": True,
            "available_hours": 100,
            "availability_percentage": 100,
            "primary_department_id": dept_jefes_id,
        },
    )
    assert employee_jefes_resp.status_code == status.HTTP_201_CREATED
    employee_jefes_id = employee_jefes_resp.json()["id"]

    over_jefes = client.post(
        "/api/v1/hr/allocations",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "employee_id": employee_jefes_id,
            "department_id": dept_jefes_id,
            "year": 2025,
            "allocated_hours": 31,
        },
    )
    assert over_jefes.status_code == status.HTTP_400_BAD_REQUEST

    ok_jefes = client.post(
        "/api/v1/hr/allocations",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "employee_id": employee_jefes_id,
            "department_id": dept_jefes_id,
            "year": 2025,
            "allocated_hours": 30,
        },
    )
    assert ok_jefes.status_code == status.HTTP_201_CREATED
    jefes_allocation_id = ok_jefes.json()["id"]

    update_over_jefes = client.patch(
        f"/api/v1/hr/allocations/{jefes_allocation_id}",
        headers=headers,
        json={"allocated_hours": 31},
    )
    assert update_over_jefes.status_code == status.HTTP_400_BAD_REQUEST

    update_over_jefes_authorized = client.patch(
        f"/api/v1/hr/allocations/{jefes_allocation_id}",
        headers=headers,
        json={"allocated_hours": 31, "override_limit_authorized": True},
    )
    assert update_over_jefes_authorized.status_code == status.HTTP_200_OK

    employee_esp_resp = client.post(
        "/api/v1/hr/employees",
        headers=headers,
        json={
            "full_name": "Empleado Especiales",
            "employment_type": "permanent",
            "is_active": True,
            "available_hours": 100,
            "availability_percentage": 100,
            "primary_department_id": dept_especiales_id,
        },
    )
    assert employee_esp_resp.status_code == status.HTTP_201_CREATED
    employee_esp_id = employee_esp_resp.json()["id"]

    over_especiales = client.post(
        "/api/v1/hr/allocations",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "employee_id": employee_esp_id,
            "department_id": dept_especiales_id,
            "year": 2025,
            "allocated_hours": 41,
        },
    )
    assert over_especiales.status_code == status.HTTP_400_BAD_REQUEST

    ok_especiales = client.post(
        "/api/v1/hr/allocations",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "employee_id": employee_esp_id,
            "department_id": dept_especiales_id,
            "year": 2025,
            "allocated_hours": 40,
        },
    )
    assert ok_especiales.status_code == status.HTTP_201_CREATED


def test_delete_allocation_returns_404_when_not_exists(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    _, headers = _auth_headers_for_new_tenant(client, db_session_fixture)

    response = client.delete("/api/v1/hr/allocations/999999999", headers=headers)
    assert response.status_code == status.HTTP_404_NOT_FOUND
