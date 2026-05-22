# Migraciones

## Estado actual

Alembic no es el sistema oficial de creacion de base de datos en este momento.

La referencia operativa vigente es:

- [base_datos.md](./base_datos.md)

Hoy el esquema se crea desde los modelos Python y el bootstrap del backend:

- `backend-fastapi/app/main.py`
- `backend-fastapi/app/core/db_bootstrap/runner.py`
- `backend-fastapi/app/db/base.py`

## Situacion de Alembic

Se conserva solo como material historico/tecnico mientras se decide el sistema definitivo de migraciones.

- No debe considerarse fuente canonica del esquema.
- No debe usarse como mecanismo principal de bootstrap para entornos nuevos.
- Si en el futuro se reactiva, habra que reconstruir una baseline valida desde el esquema real actual.

## Regla temporal del repositorio

Mientras esta situacion siga vigente:

- no anadir SQL numerado nuevo en `db/`
- no usar Alembic para bootstrap limpio
- documentar cualquier cambio estructural en los modelos Python y en `docs/infraestructura/base_datos.md`
