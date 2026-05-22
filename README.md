# Plataforma URDECON

Aplicacion SaaS multi-tenant con:

- Backend `FastAPI + SQLModel + PostgreSQL + Redis + Celery`
- Frontend `React + TypeScript + Chakra UI + TanStack Router`
- Infraestructura basada en Docker Compose

## Levantar Docker

```bash
cd deploy
docker compose --env-file deploy/env/compose.local.env -f deploy/compose/docker-compose.yml -f deploy/compose/docker-compose.local.yml up -d --build
```

## Seed inicial BBDD
```bash
docker compose --env-file deploy/env/compose.local.env -f deploy/compose/docker-compose.yml -f deploy/compose/docker-compose.local.yml exec backend-fastapi python -c "from app.platform.rbac_seed.runner import run_seed; run_seed()"
```

## Seed proveedores.sql
Para este seed necesitas disponer de la carpeta `/backups` en la que se encuentra el script SQL necesario. Se ejecuta desde la raíz del repo:

```powershell
cmd /c "docker exec -i plataforma-local-db-1 psql -U dios -d plataforma_urdecon < ..\backups\proveedores.sql"
```

Servicios:

- API: `http://localhost:8000/api/v1/health/`
- Frontend: `http://localhost:5173/`

## Documentacion tecnica

La documentacion completa esta en:

- `docs/README.md`
