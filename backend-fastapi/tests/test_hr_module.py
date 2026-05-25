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


def _login_superadmin(client: TestClient) -> str:
    data = {
        "username": "dios@cortecelestial.god",
        "password": "temporal",
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _create_tenant_and_admin(db: Session) -> tuple[int, str, str]:
    """
    Crea un tenant y un admin de tenant para pruebas de RRHH.
    """

    run_seed()

    import uuid

    tenant = Tenant(
        name="Tenant HR",
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

    # Asignamos el rol tenant_admin para que tenga permisos HR.
    tenant_admin_role = db.exec(
        select(Role).where(Role.name == "tenant_admin"),
    ).one()
    admin.role_id = tenant_admin_role.id
    db.add(admin)
    db.commit()
    db.refresh(admin)

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
        if tenant_tool.is_enabled != enabled:
            tenant_tool.is_enabled = enabled
            db.add(tenant_tool)
    db.commit()


def _login_with_mfa(
    client: TestClient,
    email: str,
    password: str,
    db: Session,
) -> str:
    """
    Realiza el flujo completo de login con MFA por email para un usuario.
    """

    # Paso 1: login con usuario/contraseña.
    data = {
        "username": email,
        "password": password,
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["mfa_required"] is True
    assert body.get("access_token") is None

    # Paso 2: fijamos un código conocido en el registro MFA y lo verificamos.
    user = db.exec(select(User).where(User.email == email)).one()
    mfa_record = db.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()

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


def test_hr_basic_flow_for_tenant_admin(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Smoke test del módulo de RRHH:
    - Tenant admin crea un departamento.
    - Tenant admin crea un perfil de empleado para sí mismo.
    - Se lista headcount por departamento.
    """

    # Preparamos tenant y admin
    tenant_id, admin_email, admin_password = _create_tenant_and_admin(
        db_session_fixture,
    )
    _ensure_org_tool(db_session_fixture, tenant_id)

    # Login del admin del tenant usando el flujo MFA real.
    admin_token = _login_with_mfa(
        client,
        admin_email,
        admin_password,
        db_session_fixture,
    )
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Crear departamento
    dept_payload = {
        "name": "Ingeniería",
        "description": "Departamento técnico",
        "manager_id": None,
        "is_active": True,
    }
    resp_dept = client.post(
        "/api/v1/hr/departments",
        json=dept_payload,
        headers=headers_admin,
    )
    assert resp_dept.status_code == status.HTTP_201_CREATED
    dept = resp_dept.json()
    assert dept["name"] == "Ingeniería"
    assert dept["tenant_id"] == tenant_id

    # Crear perfil de empleado para el admin del tenant
    admin_user = db_session_fixture.exec(
        select(User).where(User.email == admin_email),
    ).one()

    emp_payload = {
        "user_id": admin_user.id,
        "position": "Responsable de RRHH",
        "employment_type": "permanent",
        "primary_department_id": dept["id"],
        "is_active": True,
    }
    resp_emp = client.post(
        "/api/v1/hr/employees",
        json=emp_payload,
        headers=headers_admin,
    )
    assert resp_emp.status_code == status.HTTP_201_CREATED
    employee = resp_emp.json()
    assert employee["user_id"] == admin_user.id
    assert employee["primary_department_id"] == dept["id"]

    # Listado de empleados debe contener al menos ese perfil
    resp_emps = client.get("/api/v1/hr/employees", headers=headers_admin)
    assert resp_emps.status_code == status.HTTP_200_OK
    data = resp_emps.json()
    assert any(e["user_id"] == admin_user.id for e in data)

    # Headcount por departamento usando Super Admin
    super_token = _login_superadmin(client)
    headers_super = {"Authorization": f"Bearer {super_token}"}

    resp_headcount = client.get(
        "/api/v1/hr/reports/headcount",
        params={"tenant_id": tenant_id},
        headers=headers_super,
    )
    assert resp_headcount.status_code == status.HTTP_200_OK
    items = resp_headcount.json()
    assert any(item["department_id"] == dept["id"] for item in items)


def test_superadmin_requires_tenant_header_for_hr_endpoints(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, _, _ = _create_tenant_and_admin(db_session_fixture)
    _ensure_org_tool(db_session_fixture, tenant_id, enabled=True)

    super_token = _login_superadmin(client)
    headers_super = {"Authorization": f"Bearer {super_token}"}

    resp_missing = client.get("/api/v1/hr/departments", headers=headers_super)
    assert resp_missing.status_code == status.HTTP_400_BAD_REQUEST

    resp_with_header = client.get(
        "/api/v1/hr/departments",
        headers={**headers_super, "X-Tenant-Id": str(tenant_id)},
    )
    assert resp_with_header.status_code in (
        status.HTTP_200_OK,
        status.HTTP_403_FORBIDDEN,
    )


def test_hr_forbidden_when_tool_disabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, admin_email, admin_password = _create_tenant_and_admin(
        db_session_fixture,
    )
    _ensure_org_tool(db_session_fixture, tenant_id, enabled=False)

    admin_token = _login_with_mfa(
        client,
        admin_email,
        admin_password,
        db_session_fixture,
    )
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    resp = client.get("/api/v1/hr/departments", headers=headers_admin)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_hr_superadmin_tool_gating(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, _, _ = _create_tenant_and_admin(db_session_fixture)
    super_token = _login_superadmin(client)
    headers_super = {"Authorization": f"Bearer {super_token}", "X-Tenant-Id": str(tenant_id)}

    _ensure_org_tool(db_session_fixture, tenant_id, enabled=False)
    resp_disabled = client.get("/api/v1/hr/departments", headers=headers_super)
    assert resp_disabled.status_code == status.HTTP_403_FORBIDDEN

    _ensure_org_tool(db_session_fixture, tenant_id, enabled=True)
    resp_enabled = client.get("/api/v1/hr/departments", headers=headers_super)
    assert resp_enabled.status_code == status.HTTP_200_OK
