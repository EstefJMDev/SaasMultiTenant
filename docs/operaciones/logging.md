# Logging

## Configuracion base

- Modulo: `backend-fastapi/app/core/logging.py`
- Formato: `%(asctime)s %(levelname)s %(name)s %(message)s`
- Nivel:
  - `DEBUG` si `settings.debug`
  - `INFO` en resto

## Donde se aplica

- Se ejecuta al crear app en `backend-fastapi/app/main.py` (`configure_logging()`).
- Workers usan loggers por dominio:
  - `app.domains.invoices`
  - `app.platform.contracts_core`

## Eventos de negocio

- Auditoria funcional en `backend-fastapi/app/core/audit.py`
- Ejemplos:
  - tickets (`ticket.create`, `ticket.update`, `ticket.comment`)
  - contratos (`contract.*` events)

## Operacion recomendada

- Centralizar stdout/stderr de contenedores (`docker logs`, stack de observabilidad).
- Mantener correlacion por `tenant_id`, `contract_id`, `ticket_id` en mensajes cuando aplique.
