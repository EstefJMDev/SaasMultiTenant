# Base de Datos

## Sistema oficial temporal

Mientras `db/` siga en retirada y Alembic no sea la fuente canonica, el esquema oficial de base de datos se crea desde el backend Python actual.

La inicializacion ocurre en el arranque de FastAPI:

1. `backend-fastapi/app/main.py` llama a `init_db()` en el evento `startup`.
2. `backend-fastapi/app/core/db_bootstrap/runner.py` importa `app.db.base` para registrar todos los modelos SQLModel.
3. `init_db()` ejecuta `SQLModel.metadata.create_all(bind=engine)`.
4. Despues aplica pasos de bootstrap y compatibilidad:
   - enums auxiliares
   - columnas legacy que aun necesita la app
   - sincronizacion de secuencias
   - workflow de contratos
   - departamentos por defecto
   - posiciones por defecto
   - plantillas universales de contratos

Este es el unico mecanismo soportado temporalmente para levantar una base limpia dentro del repo.

## Que crea cada pieza

- Esquema principal: `backend-fastapi/app/db/base.py`
- Engine y sesiones: `backend-fastapi/app/core/db_session.py`
- Bootstrap de esquema: `backend-fastapi/app/core/db_bootstrap/runner.py`
- Seed RBAC y tenant/superadmin: `backend-fastapi/app/core/seed_rbac.py`

Importante:

- `init_db()` crea tablas y algunos datos base tecnicos.
- El seed de RBAC no se ejecuta automaticamente en startup.
- `db/` ya no debe considerarse fuente oficial del esquema.

## Arranque local con Docker Compose

Desde `repo/deploy/compose/`:

```bash
docker compose --env-file ../env/compose.local.env up -d --build
```

El backend arrancara y ejecutara `init_db()` automaticamente.

## Reset completo de base de datos local

Este reset elimina el volumen de PostgreSQL del entorno Docker local.

Desde `repo/deploy/compose/`:

```bash
docker compose --env-file ../env/compose.local.env down -v
docker compose --env-file ../env/compose.local.env up -d --build
```

Si solo quieres recrear backend y dependencias:

```bash
docker compose --env-file ../env/compose.local.env up -d --build db redis backend-fastapi
```

## Ver tablas, columnas, FKs e indices

El script oficial de inspeccion es:

```bash
cd backend-fastapi
python scripts/inspect_db.py
```

Para una tabla concreta:

```bash
python scripts/inspect_db.py --table supplier
python scripts/inspect_db.py --table public.contract
```

Salida JSON:

```bash
python scripts/inspect_db.py --json > schema_snapshot.json
```

## Seed inicial de seguridad y tenant

Tras crear el esquema, ejecuta el seed RBAC:

```bash
cd backend-fastapi
python -m app.core.seed_rbac
```

Este paso crea o sincroniza:

- permisos
- roles
- tenant por defecto
- herramientas base
- superadmin, si el entorno lo permite y existen `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD`

## Importacion de proveedores

La importacion oficial ya no debe depender de `db/internal/proveedores.sql` dentro del repo. En su lugar, se usa un CSV privado externo indicado por la variable de entorno `PROVEEDORES_SEED_PATH`.

Script:

```bash
cd backend-fastapi
set PROVEEDORES_SEED_PATH=C:\ruta\privada\proveedores.csv
python scripts/seed_proveedores.py --tenant-id 1
```

Opcionalmente:

```bash
python scripts/seed_proveedores.py --tenant-id 1 --created-by-id 1 --dry-run
```

Reglas del importador:

- Nunca incluye datos reales en Git.
- Hace upsert por `tenant_id + tax_id`.
- Normaliza el CIF/NIF antes de buscar o guardar.
- Solo pisa campos cuando el CSV trae valor no vacio.

Columnas CSV soportadas, basadas en el antiguo contrato de `proveedores.sql`:

- `tenant_id`
- `cif` o `tax_id`
- `razon_social`, `empresa` o `name`
- `email_contacto` o `email`
- `telefono_contacto` o `phone`
- `direccion_empresa` o `address`
- `city`
- `postal_code`
- `country`
- `nombre_gerente`, `contact_name` o `legal_rep_name`
- `nif_gerente`, `dni_gerente` o `legal_rep_dni`
- `iban` o `bank_iban`
- `bic` o `bank_bic`
- `tipo_escritura` o `deed_type`
- `fecha_escritura` o `deed_date`
- `nombre_notario` o `notary_name`
- `numero_protocolo`, `num_protocolo` o `notary_protocol`
- `status`

## Estado de `db/`

Dentro de `repo/`, no hay imports de runtime que dependan de `db/` para arrancar el backend, el frontend o Docker Compose.

Por tanto:

- `db/` puede archivarse fuera del repo como material legacy
- antes de borrarlo conviene conservar copia externa
- cualquier workflow manual que hoy use SQL numerado debe migrarse a scripts Python o a operaciones documentadas aqui

## Politica temporal

Hasta que exista un sistema de migraciones canonico nuevo:

- la fuente oficial del esquema son los modelos Python actuales
- el bootstrap oficial es `init_db()`
- el seed oficial de permisos y tenant es `python -m app.core.seed_rbac`
- los imports de datos internos deben vivir fuera del repo y entrar por scripts controlados
