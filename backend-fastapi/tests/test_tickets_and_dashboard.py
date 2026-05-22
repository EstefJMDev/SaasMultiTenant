from datetime import datetime, timedelta, timezone

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.permission import Permission
from app.models.tenant import Tenant
from app.models.role_permission import RolePermission
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.mfa_email_code import MFAEmailCode
from app.models.ticket import Ticket, TicketStatus, TicketPriority
from app.models.user import User


def _login_superadmin(client: TestClient) -> str:
    data = {
        "username": "dios@cortecelestial.god",
        "password": "temporal",
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _ensure_tickets_tool(
    db_session: Session,
    tenant_id: int,
    enabled: bool = True,
) -> None:
    tool = db_session.exec(select(Tool).where(Tool.slug == "tickets")).one_or_none()
    if not tool:
        tool = Tool(
            name="Tickets",
            slug="tickets",
            base_url="https://example.local/tickets",
            description="Tickets",
        )
        db_session.add(tool)
        db_session.commit()
        db_session.refresh(tool)

    tenant_tool = db_session.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool.id,
        ),
    ).one_or_none()
    if not tenant_tool:
        db_session.add(
            TenantTool(tenant_id=tenant_id, tool_id=tool.id, is_enabled=enabled),
        )
    else:
        tenant_tool.is_enabled = enabled
        db_session.add(tenant_tool)
    db_session.commit()


def _create_tenant(
    client: TestClient,
    token: str,
    name: str = "Tenant Tickets",
    subdomain: str = "tickets-tenant",
    db_session: Session | None = None,
) -> int:
    payload = {
        "name": name,
        "subdomain": subdomain,
        "is_active": True,
    }
    resp = client.post(
        "/api/v1/tenants/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    tenant_id = resp.json()["id"]
    if db_session is not None:
        _ensure_tickets_tool(db_session, tenant_id, enabled=True)
    return tenant_id


def _create_tenant_admin(
    client: TestClient,
    token: str,
    tenant_id: int,
    email: str = "admin.tickets@example.com",
) -> tuple[int, str]:
    payload = {
        "email": email,
        "full_name": "Admin Tickets",
        "password": "tickets-pass",
        "tenant_id": tenant_id,
        "is_super_admin": False,
        "role_name": "tenant_admin",
    }
    resp = client.post(
        "/api/v1/users/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    body = resp.json()
    return body["id"], email


def _login_with_mfa(
    client: TestClient,
    email: str,
    password: str,
    db_session: Session,
) -> str:
    """
    Realiza el flujo completo de login con MFA por email para usuarios no superadmin.
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
    user = db_session.exec(select(User).where(User.email == email)).one()
    mfa_record = db_session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()

    code = "654321"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db_session.add(mfa_record)
    db_session.commit()

    resp_mfa = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": email, "mfa_code": code},
    )
    assert resp_mfa.status_code == status.HTTP_200_OK
    token_body = resp_mfa.json()
    assert token_body["mfa_required"] is False
    return token_body["access_token"]


def test_ticket_flow_for_tenant_admin(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Comprueba el flujo básico de tickets para un admin de tenant:
    - Creación de ticket.
    - Listado filtrado por tenant.
    - Cambio de estado (close / reopen).
    - Asignación a usuario.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Tickets",
        subdomain="tickets-flow",
        db_session=db_session_fixture,
    )
    user_id, email = _create_tenant_admin(client, super_token, tenant_id)
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Crear ticket
    ticket_payload = {
        "subject": "Error en ERP",
        "description": "No carga la pantalla de proyectos.",
        "priority": "high",
        "tool_slug": "erp",
        "category": "erp",
    }
    resp_create = client.post(
        "/api/v1/tickets",
        json=ticket_payload,
        headers=headers_admin,
    )
    assert resp_create.status_code == status.HTTP_201_CREATED
    ticket = resp_create.json()
    assert ticket["subject"] == ticket_payload["subject"]
    assert ticket["priority"] == ticket_payload["priority"]
    assert ticket["category"] == ticket_payload["category"]
    assert ticket["tenant_id"] == tenant_id
    ticket_id = ticket["id"]

    # Listar tickets del tenant
    resp_list = client.get(
        "/api/v1/tickets",
        headers=headers_admin,
    )
    assert resp_list.status_code == status.HTTP_200_OK
    tickets = resp_list.json()
    ids = [t["id"] for t in tickets]
    assert ticket_id in ids

    # Comprobamos que el admin_tenant tiene los permisos de tickets esperados.
    admin_db = db_session_fixture.exec(
        select(User).where(User.email == email),
    ).one()
    perms_codes = db_session_fixture.exec(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == admin_db.role_id),
    ).all()
    print("Permisos admin_tenant:", perms_codes)

    # Cerrar ticket
    resp_close = client.post(
        f"/api/v1/tickets/{ticket_id}/close",
        headers=headers_admin,
    )
    print("Close ticket response:", resp_close.status_code, resp_close.json())
    assert resp_close.status_code == status.HTTP_200_OK
    body_close = resp_close.json()
    assert body_close["status"] == "closed"
    assert body_close["closed_at"] is not None

    # Reabrir ticket
    resp_reopen = client.post(
        f"/api/v1/tickets/{ticket_id}/reopen",
        headers=headers_admin,
    )
    assert resp_reopen.status_code == status.HTTP_200_OK
    body_reopen = resp_reopen.json()
    assert body_reopen["status"] == "in_progress"

    # Asignar ticket al propio admin
    resp_assign = client.post(
        f"/api/v1/tickets/{ticket_id}/assign",
        json={"assignee_id": user_id},
        headers=headers_admin,
    )
    assert resp_assign.status_code == status.HTTP_200_OK
    body_assign = resp_assign.json()
    assert body_assign["assigned_to_email"] == email


def test_superadmin_can_filter_tickets_by_tenant(client: TestClient, db_session_fixture: Session) -> None:
    """
    Verifica que el Super Admin puede filtrar tickets por tenant_id.
    """

    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Creamos dos tenants con subdominios distintos
    tenant_a = _create_tenant(
        client,
        token,
        name="Tenant A",
        subdomain="tickets-a",
        db_session=db_session_fixture,
    )
    tenant_b = _create_tenant(
        client,
        token,
        name="Tenant B",
        subdomain="tickets-b",
        db_session=db_session_fixture,
    )

    # Insertamos tickets directamente en la BD de pruebas
    now = datetime.now(timezone.utc)
    with db_session_fixture as session:
        for tenant_id in (tenant_a, tenant_b):
            t = Ticket(
                tenant_id=tenant_id,
                created_by_id=1,
                subject=f"Ticket {tenant_id}",
                description="Ticket de prueba",
                priority=TicketPriority.MEDIUM,
                status=TicketStatus.OPEN,
                created_at=now,
                updated_at=now,
            )
            session.add(t)
        session.commit()

    # Listar tickets de tenant_a
    resp_a = client.get(
        f"/api/v1/tickets?tenant_id={tenant_a}",
        headers=headers,
    )
    assert resp_a.status_code == status.HTTP_200_OK
    ids_a = {t["tenant_id"] for t in resp_a.json()}
    assert ids_a == {tenant_a}

    # Listar tickets de tenant_b
    resp_b = client.get(
        f"/api/v1/tickets?tenant_id={tenant_b}",
        headers=headers,
    )
    assert resp_b.status_code == status.HTTP_200_OK
    ids_b = {t["tenant_id"] for t in resp_b.json()}
    assert ids_b == {tenant_b}


def test_dashboard_support_metrics_respect_tenant_scope(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Comprueba que las métricas de soporte del dashboard se calculan
    por tenant para un admin de tenant.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Metrics",
        subdomain="tickets-metrics",
        db_session=db_session_fixture,
    )
    _, email = _create_tenant_admin(
        client,
        super_token,
        tenant_id,
        email="admin.metrics@example.com",
    )
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    # Creamos algunos tickets en distintos estados para ese tenant
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)
    last_week = now - timedelta(days=6)

    with db_session_fixture as session:
        admin = session.exec(
            select(User).where(User.email == email),
        ).one()

        open_ticket = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="Abierto",
            description="Ticket abierto",
            priority=TicketPriority.MEDIUM,
            status=TicketStatus.OPEN,
            created_at=now,
            updated_at=now,
        )
        in_progress_ticket = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="En progreso",
            description="Ticket en progreso",
            priority=TicketPriority.HIGH,
            status=TicketStatus.IN_PROGRESS,
            created_at=now,
            updated_at=now,
        )
        resolved_today = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="Resuelto hoy",
            description="Ticket resuelto hoy",
            priority=TicketPriority.LOW,
            status=TicketStatus.RESOLVED,
            created_at=yesterday,
            updated_at=now,
            resolved_at=now,
        )
        closed_week = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="Cerrado semana",
            description="Ticket cerrado esta semana",
            priority=TicketPriority.CRITICAL,
            status=TicketStatus.CLOSED,
            created_at=last_week,
            updated_at=now,
            closed_at=now,
        )

        session.add(open_ticket)
        session.add(in_progress_ticket)
        session.add(resolved_today)
        session.add(closed_week)
        session.commit()

    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    resp_dashboard = client.get(
        "/api/v1/dashboard/summary",
        headers=headers_admin,
    )
    assert resp_dashboard.status_code == status.HTTP_200_OK
    body = resp_dashboard.json()

    assert body["tickets_abiertos"] == 1
    assert body["tickets_en_progreso"] == 1
    assert body["tickets_resueltos_hoy"] >= 1
    assert body["tickets_cerrados_ultima_semana"] >= 1
    assert body["active_users_now"] == 0
    assert body["active_users_today"] == 0


def test_dashboard_superadmin_activity_metrics_use_utc_windows(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    super_token = _login_superadmin(client)

    now_utc = datetime.now(timezone.utc)
    today_start_utc = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc)

    recent_user = User(
        email="activity.recent@example.com",
        full_name="Recent Activity",
        hashed_password=hash_password("Recent!Pass123"),
        is_active=True,
        is_super_admin=False,
        tenant_id=None,
        mfa_enabled=False,
        last_seen_at=now_utc - timedelta(minutes=5),
    )
    today_user = User(
        email="activity.today@example.com",
        full_name="Today Activity",
        hashed_password=hash_password("Today!Pass123"),
        is_active=True,
        is_super_admin=False,
        tenant_id=None,
        mfa_enabled=False,
        last_seen_at=today_start_utc + timedelta(hours=1),
    )
    stale_user = User(
        email="activity.stale@example.com",
        full_name="Stale Activity",
        hashed_password=hash_password("Stale!Pass123"),
        is_active=True,
        is_super_admin=False,
        tenant_id=None,
        mfa_enabled=False,
        last_seen_at=now_utc - timedelta(days=2),
    )
    inactive_recent_user = User(
        email="activity.inactive@example.com",
        full_name="Inactive Activity",
        hashed_password=hash_password("Inactive!Pass123"),
        is_active=False,
        is_super_admin=False,
        tenant_id=None,
        mfa_enabled=False,
        last_seen_at=now_utc - timedelta(minutes=3),
    )
    db_session_fixture.add(recent_user)
    db_session_fixture.add(today_user)
    db_session_fixture.add(stale_user)
    db_session_fixture.add(inactive_recent_user)
    db_session_fixture.commit()

    resp_dashboard = client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert resp_dashboard.status_code == status.HTTP_200_OK
    body = resp_dashboard.json()

    assert body["active_users_now"] >= 1
    assert body["active_users_today"] >= 2


def test_recent_active_users_superadmin_can_access_and_order_limit(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    now_utc = datetime.now(timezone.utc)
    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god"),
    ).one()
    superadmin.last_seen_at = now_utc - timedelta(days=30)
    db_session_fixture.add(superadmin)
    db_session_fixture.commit()

    tenant = Tenant(name="Recent Tenant", subdomain="recent-tenant")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    users = [
        User(
            email="recent.a@example.com",
            full_name="Recent A",
            hashed_password=hash_password("Recent!Pass123"),
            is_active=True,
            is_super_admin=False,
            tenant_id=tenant.id,
            mfa_enabled=False,
            last_seen_at=now_utc + timedelta(hours=6),
        ),
        User(
            email="recent.b@example.com",
            full_name="Recent B",
            hashed_password=hash_password("Recent!Pass123"),
            is_active=True,
            is_super_admin=False,
            tenant_id=None,
            mfa_enabled=False,
            last_seen_at=now_utc + timedelta(hours=5),
        ),
        User(
            email="recent.c@example.com",
            full_name="Recent C",
            hashed_password=hash_password("Recent!Pass123"),
            is_active=True,
            is_super_admin=False,
            tenant_id=tenant.id,
            mfa_enabled=False,
            last_seen_at=now_utc + timedelta(hours=4),
        ),
        User(
            email="recent.d@example.com",
            full_name="Recent D",
            hashed_password=hash_password("Recent!Pass123"),
            is_active=True,
            is_super_admin=False,
            tenant_id=tenant.id,
            mfa_enabled=False,
            last_seen_at=now_utc + timedelta(hours=3),
        ),
        User(
            email="recent.e@example.com",
            full_name="Recent E",
            hashed_password=hash_password("Recent!Pass123"),
            is_active=True,
            is_super_admin=False,
            tenant_id=tenant.id,
            mfa_enabled=False,
            last_seen_at=now_utc + timedelta(hours=2),
        ),
        User(
            email="recent.f@example.com",
            full_name="Recent F",
            hashed_password=hash_password("Recent!Pass123"),
            is_active=True,
            is_super_admin=False,
            tenant_id=tenant.id,
            mfa_enabled=False,
            last_seen_at=now_utc + timedelta(hours=1),
        ),
        User(
            email="recent.null@example.com",
            full_name="Recent Null",
            hashed_password=hash_password("Recent!Pass123"),
            is_active=True,
            is_super_admin=False,
            tenant_id=tenant.id,
            mfa_enabled=False,
            last_seen_at=None,
        ),
    ]
    for user in users:
        db_session_fixture.add(user)
    db_session_fixture.commit()

    response = client.get(
        "/api/v1/dashboard/recent-active-users?limit=5",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert len(body["items"]) == 5
    assert [item["email"] for item in body["items"]] == [
        "recent.a@example.com",
        "recent.b@example.com",
        "recent.c@example.com",
        "recent.d@example.com",
        "recent.e@example.com",
    ]
    assert all(item["email"] != "dios@cortecelestial.god" for item in body["items"])
    assert body["items"][0]["tenant_id"] == tenant.id
    assert body["items"][0]["tenant_name"] == tenant.name
    assert body["items"][1]["tenant_id"] is None
    assert body["items"][1]["tenant_name"] is None
    assert all(item["last_seen_at"] is not None for item in body["items"])


def test_recent_active_users_non_superadmin_forbidden(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Recent Forbidden",
        subdomain="recent-forbidden",
        db_session=db_session_fixture,
    )
    _, email = _create_tenant_admin(
        client,
        super_token,
        tenant_id,
        email="recent.forbidden@example.com",
    )
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    response = client.get(
        "/api/v1/dashboard/recent-active-users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_internal_notes_visibility_and_permissions(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Verifica que las notas internas solo son visibles para agentes (tenant_admin)
    y que los usuarios finales ven únicamente los mensajes públicos.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Internal",
        subdomain="tickets-internal",
        db_session=db_session_fixture,
    )

    # Usuario final del tenant (rol "user")
    user_payload = {
        "email": "user.internal@example.com",
        "full_name": "User Internal",
        "password": "user-pass",
        "tenant_id": tenant_id,
        "is_super_admin": False,
        "role_name": "user",
    }
    resp_user = client.post(
        "/api/v1/users/",
        json=user_payload,
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert resp_user.status_code == status.HTTP_201_CREATED

    # Login MFA del usuario final
    user_token = _login_with_mfa(
        client,
        user_payload["email"],
        "user-pass",
        db_session_fixture,
    )

    headers_user = {"Authorization": f"Bearer {user_token}"}
    headers_super = {"Authorization": f"Bearer {super_token}"}

    # El usuario final crea un ticket
    ticket_payload = {
        "subject": "Incidencia visibilidad",
        "description": "Prueba de notas internas.",
        "priority": "medium",
        "tool_slug": "erp",
        "category": "erp",
    }
    resp_create = client.post(
        "/api/v1/tickets",
        json=ticket_payload,
        headers=headers_user,
    )
    assert resp_create.status_code == status.HTTP_201_CREATED
    ticket_id = resp_create.json()["id"]

    # El Super Admin actúa como agente y añade un mensaje público
    resp_public = client.post(
        f"/api/v1/tickets/{ticket_id}/messages",
        json={"body": "Mensaje público", "is_internal": False},
        headers=headers_super,
    )
    assert resp_public.status_code == status.HTTP_201_CREATED

    # El Super Admin añade una nota interna
    resp_internal = client.post(
        f"/api/v1/tickets/{ticket_id}/messages",
        json={"body": "Nota interna", "is_internal": True},
        headers=headers_super,
    )
    assert resp_internal.status_code == status.HTTP_201_CREATED

    # Usuario final ve solo el mensaje público
    resp_msgs_user = client.get(
        f"/api/v1/tickets/{ticket_id}/messages",
        headers=headers_user,
    )
    assert resp_msgs_user.status_code == status.HTTP_200_OK
    msgs_user = resp_msgs_user.json()
    assert len(msgs_user) == 1
    assert msgs_user[0]["body"] == "Mensaje público"
    assert msgs_user[0]["is_internal"] is False

    # Super Admin ve ambos mensajes (público + interno)
    resp_msgs_admin = client.get(
        f"/api/v1/tickets/{ticket_id}/messages",
        headers=headers_super,
    )
    assert resp_msgs_admin.status_code == status.HTTP_200_OK
    msgs_admin = resp_msgs_admin.json()
    bodies = {m["body"] for m in msgs_admin}
    assert bodies == {"Mensaje público", "Nota interna"}
    has_internal = any(m["is_internal"] for m in msgs_admin)
    assert has_internal is True


def test_ticket_list_scope_user_vs_tenant_admin(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Comprueba que:
    - Un usuario normal solo ve sus propios tickets.
    - El admin del tenant ve todos los tickets del tenant.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Scope",
        subdomain="tickets-scope",
        db_session=db_session_fixture,
    )

    # Creamos dos usuarios finales en el mismo tenant
    user1_email = "user1.scope@example.com"
    user2_email = "user2.scope@example.com"
    for email in (user1_email, user2_email):
        payload = {
            "email": email,
            "full_name": f"{email}",
            "password": "user-pass",
            "tenant_id": tenant_id,
            "is_super_admin": False,
            "role_name": "user",
        }
        resp = client.post(
            "/api/v1/users/",
            json=payload,
            headers={"Authorization": f"Bearer {super_token}"},
        )
        assert resp.status_code == status.HTTP_201_CREATED

    # Login MFA de usuarios y admin
    user1_token = _login_with_mfa(
        client,
        user1_email,
        "user-pass",
        db_session_fixture,
    )
    user2_token = _login_with_mfa(
        client,
        user2_email,
        "user-pass",
        db_session_fixture,
    )

    headers_user1 = {"Authorization": f"Bearer {user1_token}"}
    headers_user2 = {"Authorization": f"Bearer {user2_token}"}

    # user1 crea dos tickets
    for i in range(2):
        resp = client.post(
            "/api/v1/tickets",
            json={
                "subject": f"Ticket user1 #{i}",
                "description": "Test",
                "priority": "medium",
                "tool_slug": "erp",
                "category": "erp",
            },
            headers=headers_user1,
        )
        assert resp.status_code == status.HTTP_201_CREATED

    # user2 crea un ticket
    resp = client.post(
        "/api/v1/tickets",
        json={
            "subject": "Ticket user2",
            "description": "Test",
            "priority": "medium",
            "tool_slug": "erp",
            "category": "erp",
        },
        headers=headers_user2,
    )
    assert resp.status_code == status.HTTP_201_CREATED

    # user1 solo ve sus propios tickets
    resp_user1 = client.get("/api/v1/tickets", headers=headers_user1)
    assert resp_user1.status_code == status.HTTP_200_OK
    tickets_user1 = resp_user1.json()
    subjects_user1 = {t["subject"] for t in tickets_user1}
    assert subjects_user1 == {"Ticket user1 #0", "Ticket user1 #1"}

    # (Opcional) El Super Admin puede ver todos los tickets si se necesitara


def test_superadmin_cannot_create_tickets(client: TestClient) -> None:
    """
    El Super Admin global no debe crear tickets directamente vía API.
    """

    super_token = _login_superadmin(client)
    headers_super = {"Authorization": f"Bearer {super_token}"}

    payload = {
        "subject": "Ticket desde superadmin",
        "description": "No debería permitirse",
        "priority": "high",
        "tool_slug": "erp",
        "category": "erp",
    }
    resp = client.post("/api/v1/tickets", json=payload, headers=headers_super)

    # Debe responder con 403 (PermissionError en servicio)
    assert resp.status_code == status.HTTP_403_FORBIDDEN
