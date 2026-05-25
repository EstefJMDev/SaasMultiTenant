from typing import Generator
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool

# Aseguramos que el paquete `app` es importable añadiendo la raíz
# de backend-fastapi al PYTHONPATH cuando se ejecutan los tests.
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Variables mínimas para que Settings de Pydantic se inicialice.
TEST_DATABASE_URL = "sqlite://"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ALLOW_BOOTSTRAP_SUPERADMIN"] = "true"
os.environ["SUPERADMIN_EMAIL"] = "dios@cortecelestial.god"
os.environ["SUPERADMIN_PASSWORD"] = "temporal"
os.environ["MFA_ENABLED"] = "true"
# Evita rate limit en tests (entorno local).
os.environ["RATE_LIMIT_SKIP_IN_LOCAL"] = "true"
os.environ["PERMISSIONS_CACHE_USE_REDIS"] = "false"
os.environ["USER_ME_CACHE_USE_REDIS"] = "false"
# Fuerza un valor booleano válido para evitar conflictos
# con variables de entorno existentes (por ejemplo DEBUG=WARN).
os.environ["DEBUG"] = "false"
# Limpia env vars de desarrollo local que pueden colisionar con Settings(extra=forbid).
for _stray in ("AI_HELP_LLM_ENABLED", "OLLAMA_HELP_MODEL", "OLLAMA_HELP_TIMEOUT_SECONDS"):
    os.environ.pop(_stray, None)

from app.main import app  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.core import db_session as core_db_session  # noqa: E402
from app.db import base as _models  # noqa: F401, E402  # asegura que se registren los modelos
from app.core.seed_rbac import run_seed  # noqa: E402


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(_type, _compiler, **_kw):
    """
    SQLite no soporta JSONB de PostgreSQL.
    En tests con sqlite:// lo degradamos a JSON.
    """

    return "JSON"


# Creamos un engine de pruebas y lo inyectamos en el módulo de sesión.
test_engine = create_engine(
    TEST_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
db_session.engine = test_engine
core_db_session.engine = test_engine

# Creamos las tablas en la base de datos de pruebas.
SQLModel.metadata.create_all(test_engine)


def override_get_session() -> Generator[Session, None, None]:
    """
    Dependencia de sesión de pruebas que usa el engine SQLite.
    """

    with Session(test_engine) as session:
        yield session


# Inyectamos la dependencia override en la aplicación FastAPI.
app.dependency_overrides[db_session.get_session] = override_get_session


# Ejecutamos el seed de RBAC y Super Admin sobre la base de datos de pruebas.
run_seed()


@pytest.fixture()
def db_session_fixture() -> Generator[Session, None, None]:
    """
    Fixture que proporciona una sesión de BD para cada test.
    """

    with Session(test_engine) as session:
        yield session


@pytest.fixture()
def client() -> TestClient:
    """
    Fixture que proporciona un cliente HTTP de pruebas.
    """

    return TestClient(app)


@pytest.fixture(autouse=True)
def mock_mfa_email_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    En tests no dependemos de SMTP real para el paso 1 de MFA.
    Forzamos envío exitoso para mantener tests deterministas.
    """

    monkeypatch.setattr(
        "app.services.auth_service.send_mfa_email_code",
        lambda to_email, code: True,
    )
