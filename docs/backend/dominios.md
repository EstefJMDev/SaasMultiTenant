# Dominios Backend

## Router de dominios

- Punto unico: `backend-fastapi/app/domains/router.py`
- Dominios incluidos:
  - `org`
  - `projects`
  - `work`
  - `time`
  - `procurement`
  - `invoices`
  - `signatures`
  - `tickets`
  - `analytics`

## Procurement y contratos

- Alias canonico y legacy:
  - `/procurement/contracts`
  - `/contracts` (deprecated)
- Definido en `backend-fastapi/app/domains/procurement/router.py`

## Facturas

- Prefijo: `/invoices`
- Implementacion: `backend-fastapi/app/domains/invoices/api.py` y `routers/router.py`

## Tickets

- Prefijo: `/tickets`
- Alias legacy `/tickets-legacy` con cabeceras de deprecacion
- Implementacion: `backend-fastapi/app/domains/tickets/api.py`

## Proyectos, trabajo y tiempo

- Proyectos: `backend-fastapi/app/domains/projects/api.py`
- Work management: `backend-fastapi/app/domains/work/api.py`
- Time tracking/reporting: `backend-fastapi/app/domains/time/api.py`

## Firmas

- Dominio: `backend-fastapi/app/domains/signatures/api.py`
- Incluye router privado `/api/v1/signatures` y router publico bajo `/public`
