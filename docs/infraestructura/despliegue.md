# Despliegue

## Entorno Docker Compose

Archivos:

- Desarrollo: `infra/docker-compose.yml`
- Override produccion: `infra/docker-compose.prod.yml`

## Servicios desplegados

- `db` (PostgreSQL 16)
- `redis` (Redis 7)
- `backend-fastapi`
- `frontend-react`
- `celery-worker`
- `celery-beat`

## Ejecucion desarrollo

```bash
cd infra
docker compose up -d --build
```

## Ejecucion produccion (compose + override)

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Consideraciones implementadas

- En produccion se vacian puertos host de `db`, `redis`, `backend-fastapi`, `frontend-react`.
- Volumenes de datos para facturas/contratos en `infra/data/`.
