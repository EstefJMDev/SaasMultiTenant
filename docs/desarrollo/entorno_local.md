# Entorno Local

## Requisitos

- Docker y Docker Compose
- Node.js (para frontend fuera de Docker)
- Python 3.11+ (para backend fuera de Docker)

## Arranque recomendado con Docker

```bash
cd infra
docker compose up -d --build
```

## Backend fuera de Docker (opcional)

```bash
cd backend-fastapi
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend fuera de Docker (opcional)

```bash
cd frontend-react
npm install
npm run dev
```

## Seed RBAC

```bash
cd backend-fastapi
python -m app.core.seed_rbac
```
