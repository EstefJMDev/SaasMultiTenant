from datetime import datetime, timedelta, timezone

from fastapi import status
from fastapi.testclient import TestClient
from passlib.context import CryptContext
from pydantic import ValidationError
import uuid
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.mfa_email_code import MFAEmailCode
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.password import ChangePasswordRequest
from app.services.auth_service import change_password


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def test_superadmin_login_without_mfa(client: TestClient) -> None:
    """
    Comprueba que el Super Admin creado por el seed puede hacer login
    sin MFA y recibe un JWT válido.
    """

    data = {
        "username": "dios@cortecelestial.god",
        "password": "temporal",
    }
    response = client.post("/api/v1/auth/login", data=data)

    assert response.status_code == status.HTTP_200_OK

    body = response.json()
    assert body["mfa_required"] is False
    assert "access_token" in body and body["access_token"]
    assert body["token_type"] == "bearer"


def test_superadmin_login_sets_last_login_at(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK

    user = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god"),
    ).one()
    assert user.last_login_at is not None
    assert user.last_seen_at is not None


def _create_mfa_user(session: Session) -> User:
    """
    Crea un usuario normal para probar el flujo de MFA basado en código enviado por email.
    """

    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"Tenant Test MFA {suffix}", subdomain=f"mfa-test-{suffix}")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    user = User(
        email=f"usuario.mfa+{suffix}@example.com",
        full_name="Usuario MFA",
        hashed_password=hash_password("password-mfa"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return user


def test_mfa_login_flow(client: TestClient, db_session_fixture: Session) -> None:
    """
    Flujo completo de login con MFA por email:
    1) Login con email/contraseña → mfa_required=True y sin token.
    2) Verificar código correcto → JWT emitido.
    """

    # Preparamos un usuario con MFA habilitado.
    user = _create_mfa_user(db_session_fixture)

    # Paso 1: login con credenciales.
    data = {
        "username": user.email,
        "password": "password-mfa",
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK

    body = response.json()
    assert body["mfa_required"] is True
    assert body.get("access_token") is None

    # Paso 2: enviamos un código MFA correcto.
    # En producción el código llega por email; en tests lo fijamos manualmente.
    mfa_record = db_session_fixture.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()
    code = "123456"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db_session_fixture.add(mfa_record)
    db_session_fixture.commit()

    response_mfa = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": user.email, "mfa_code": code},
    )
    body_mfa = response_mfa.json()

    assert response_mfa.status_code == status.HTTP_200_OK
    assert body_mfa["mfa_required"] is False
    assert "access_token" in body_mfa and body_mfa["access_token"]
    assert body_mfa["token_type"] == "bearer"

    db_session_fixture.refresh(user)
    assert user.last_login_at is not None
    assert user.last_seen_at is not None


def test_get_current_user_updates_last_seen_at_when_missing(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    token = response.json()["access_token"]

    user = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god"),
    ).one()
    user.last_seen_at = None
    db_session_fixture.add(user)
    db_session_fixture.commit()

    me_response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == status.HTTP_200_OK

    db_session_fixture.refresh(user)
    assert user.last_seen_at is not None


def test_get_current_user_does_not_update_last_seen_when_recent(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    token = response.json()["access_token"]

    user = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god"),
    ).one()
    recent_seen_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    user.last_seen_at = recent_seen_at
    db_session_fixture.add(user)
    db_session_fixture.commit()

    me_response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == status.HTTP_200_OK

    db_session_fixture.refresh(user)
    assert _as_utc(user.last_seen_at) == recent_seen_at


def test_login_rehashes_legacy_pbkdf2_password(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = Tenant(name="Tenant Legacy Hash", subdomain="legacy-hash")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    legacy_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    user = User(
        email="legacy.hash@example.com",
        full_name="Legacy Hash User",
        hashed_password=legacy_context.hash("password-legacy"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=True,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    response = client.post(
        "/api/v1/auth/login",
        data={"username": user.email, "password": "password-legacy"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["mfa_required"] is True

    db_session_fixture.expire_all()
    refreshed = db_session_fixture.exec(
        select(User).where(User.id == user.id),
    ).one()
    assert refreshed.hashed_password.startswith("$argon2")


def test_change_password_requires_min_length_and_complexity(
    db_session_fixture: Session,
) -> None:
    tenant = Tenant(name="Tenant Change Password", subdomain="tenant-change-password")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    user = User(
        email="change.password@example.com",
        full_name="Change Password User",
        hashed_password=hash_password("Current!Pass123"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=False,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)
    try:
        ChangePasswordRequest(
            current_password="Current!Pass123",
            new_password="Short1!",
            new_password_confirm="Short1!",
        )
        assert False, "Se esperaba ValidationError por longitud minima de schema"
    except ValidationError as exc:
        assert "at least 12 characters" in str(exc)

    weak = ChangePasswordRequest(
        current_password="Current!Pass123",
        new_password="alllowercase123!",
        new_password_confirm="alllowercase123!",
    )
    try:
        change_password(db_session_fixture, user, weak)
        assert False, "Se esperaba ValueError por complejidad insuficiente"
    except ValueError as exc:
        assert "mayúsculas" in str(exc)


def test_change_password_accepts_strong_password(
    db_session_fixture: Session,
) -> None:
    tenant = Tenant(name="Tenant Strong Password", subdomain="tenant-strong-password")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    user = User(
        email="strong.password@example.com",
        full_name="Strong Password User",
        hashed_password=hash_password("Current!Pass123"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=False,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)
    previous_hash = user.hashed_password

    payload = ChangePasswordRequest(
        current_password="Current!Pass123",
        new_password="MyNew!Pass123",
        new_password_confirm="MyNew!Pass123",
    )
    change_password(db_session_fixture, user, payload)

    refreshed = db_session_fixture.exec(
        select(User).where(User.id == user.id),
    ).one()
    assert refreshed.hashed_password != previous_hash


def test_mfa_lockout_blocks_new_code_request_temporarily(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    user = _create_mfa_user(db_session_fixture)

    first_login = client.post(
        "/api/v1/auth/login",
        data={"username": user.email, "password": "password-mfa"},
    )
    assert first_login.status_code == status.HTTP_200_OK
    assert first_login.json()["mfa_required"] is True

    for _ in range(3):
        bad_verify = client.post(
            "/api/v1/auth/mfa/verify",
            json={"username": user.email, "mfa_code": "000000"},
        )
        assert bad_verify.status_code == status.HTTP_400_BAD_REQUEST

    locked_login = client.post(
        "/api/v1/auth/login",
        data={"username": user.email, "password": "password-mfa"},
    )
    assert locked_login.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert "retry-after" in {k.lower() for k in locked_login.headers.keys()}
