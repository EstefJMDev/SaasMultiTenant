# Testing

## Backend

- Config pytest: `backend-fastapi/pytest.ini`
- Tests: `backend-fastapi/tests/`

Ejecucion:

```bash
cd backend-fastapi
pytest
```

## Frontend

- Test runner: Vitest
- Config: `frontend-react/vitest.config.ts`
- Tests: `frontend-react/src/test/`

Ejecucion:

```bash
cd frontend-react
npm test
```

## Casos clave multi-tenant en frontend

Tests dedicados:

- `frontend-react/src/test/tenantScope.test.ts`
- `frontend-react/src/test/tenantKeys.test.ts`
- `frontend-react/src/test/apiClientTenantGuard.test.ts`
- `frontend-react/src/test/tenantWriteGuard.test.tsx`
