from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.tool import Tool
from app.models.tenant_tool import TenantTool


def _login_superadmin(client: TestClient) -> str:
  """
  Helper para obtener un JWT de Super Admin.
  """

  data = {
      "username": "dios@cortecelestial.god",
      "password": "temporal",
  }
  response = client.post("/api/v1/auth/login", data=data)
  assert response.status_code == status.HTTP_200_OK
  body = response.json()
  return body["access_token"]


def test_tenant_crud_and_user_creation_and_tools_flow(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
  """
  Test de integración básico que cubre:
  - Creación de tenant con Super Admin.
  - Creación de usuario asignado al tenant.
  - Listado de usuarios por tenant.
  - Configuración de una herramienta para el tenant.
  - Listado de herramientas del tenant.
  - Lanzamiento SSO de la herramienta.
  """

  token = _login_superadmin(client)
  headers = {"Authorization": f"Bearer {token}"}

  # 1) Crear tenant
  tenant_payload = {
      "name": "Empresa ACME",
      "subdomain": "acme",
      "is_active": True,
  }
  resp_tenant = client.post("/api/v1/tenants/", json=tenant_payload, headers=headers)
  tenant_resp_body = resp_tenant.json()
  print("Tenant create response:", resp_tenant.status_code, tenant_resp_body)
  assert resp_tenant.status_code == status.HTTP_201_CREATED
  tenant_data = resp_tenant.json()
  tenant_id = tenant_data["id"]

  # 2) Crear usuario para ese tenant
  user_payload = {
          "email": "user@acme.example.com",
      "full_name": "User ACME",
      "password": "acme-pass",
      "tenant_id": tenant_id,
      "is_super_admin": False,
  }
  resp_user = client.post("/api/v1/users/", json=user_payload, headers=headers)
  user_resp_body = resp_user.json()
  print("User create response:", resp_user.status_code, user_resp_body)
  assert resp_user.status_code == status.HTTP_201_CREATED
  user_data = resp_user.json()
  assert user_data["tenant_id"] == tenant_id

  # 3) Listar usuarios por tenant
  resp_users_list = client.get(
      f"/api/v1/users/by-tenant/{tenant_id}",
      headers=headers,
  )
  assert resp_users_list.status_code == status.HTTP_200_OK
  users_list = resp_users_list.json()
  assert any(u["email"] == "user@acme.example.com" for u in users_list)

  # 4) Configurar herramienta para el tenant en la BD de pruebas
  _seed_tool_for_tenant(db_session_fixture, tenant_id)

  # 5) Listar herramientas por tenant
  resp_tools = client.get(
      "/api/v1/tools/by-tenant",
      headers={
          "Authorization": f"Bearer {token}",
          # Usamos X-Tenant-Id para simplificar resolución en entorno de test.
          "X-Tenant-Id": str(tenant_id),
      },
  )
  assert resp_tools.status_code == status.HTTP_200_OK
  tools_list = resp_tools.json()
  # Pueden existir herramientas preconfiguradas por el seed; comprobamos
  # que nuestra herramienta "moodle-demo" está entre las habilitadas.
  moodle_tool = next(
      t for t in tools_list if t["slug"] == "moodle-demo"
  )
  tool_id = moodle_tool["id"]

  # 6) Lanzar herramienta (SSO básico)
  resp_launch = client.post(
      f"/api/v1/tools/{tool_id}/launch",
      headers={
          "Authorization": f"Bearer {token}",
          "X-Tenant-Id": str(tenant_id),
      },
  )
  assert resp_launch.status_code == status.HTTP_200_OK
  launch_data = resp_launch.json()
  assert "launch_url" in launch_data
  assert f"{moodle_tool['base_url']}?sso_token=" in launch_data["launch_url"]


def _seed_tool_for_tenant(session: Session, tenant_id: int) -> None:
  """
  Crea una herramienta y la asigna al tenant indicado.
  """

  tool = Tool(
      name="Moodle Demo",
      slug="moodle-demo",
      base_url="https://moodle.mavico.shop",
      description="Instancia de Moodle de pruebas",
  )
  session.add(tool)
  session.commit()
  session.refresh(tool)

  tenant_tool = TenantTool(
      tenant_id=tenant_id,
      tool_id=tool.id,
      is_enabled=True,
  )
  session.add(tenant_tool)
  session.commit()
