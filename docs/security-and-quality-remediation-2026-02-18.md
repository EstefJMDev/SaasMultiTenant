# Security and Quality Remediation (2026-02-18)

This document records the hardening work applied to contracts/signatures/auth flows.

## 1) Signaturit webhook hardening

### What changed
- File: `backend-fastapi/app/signatures/router.py`
- Added mandatory webhook secret validation for `POST /public/signaturit/events`.
- Accepted secret sources:
  - query param `token`
  - header `X-Webhook-Token`
- Added constant-time comparison (`hmac.compare_digest`).
- Added explicit `400` for invalid JSON payload.

### Why
- Prevent forged webhook requests and event spoofing.

### Required config
- `SIGNATURIT_WEBHOOK_TOKEN` must be set in backend env.

## 2) Webhook URL generation now injects secret token

### What changed
- File: `backend-fastapi/app/signatures/service.py`
- `_events_url()` now appends `?token=<SIGNATURIT_WEBHOOK_TOKEN>` (or `&token=` when query already exists).

### Why
- Ensures provider callback URL includes shared secret automatically.

## 3) Removed public static exposure of contract files

### What changed
- File: `backend-fastapi/app/main.py`
- Removed public mount `app.mount("/static/contracts", ...)`.
- Contract files remain on disk but are no longer world-readable via static path.

### Why
- Prevent direct URL access to sensitive contract/signed PDFs.

## 4) CSRF protection for cookie-authenticated API calls

### What changed
- Files:
  - `backend-fastapi/app/main.py`
  - `backend-fastapi/app/api/v1/routes/auth.py`
  - `backend-fastapi/app/core/config.py`
  - `frontend-react/src/api/client.ts`
- Added `CSRFMiddleware`:
  - Enforced on state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`)
  - Scope: `/api/v1/*`
  - Exemptions: login bootstrap endpoints
  - Applied only when auth cookie is present and no Bearer header is used
- Added CSRF cookie issuance on login/MFA verify.
- Added CSRF cookie deletion on logout.
- Frontend Axios now sends `X-CSRF-Token` from `csrf_token` cookie for mutating requests.

### Why
- Protects cookie-based sessions from cross-site request forgery.

### New config keys
- `CSRF_COOKIE_NAME` (default: `csrf_token`)
- `CSRF_HEADER_NAME` (default: `X-CSRF-Token`)
- `CSRF_ENABLED` (default: `true`)

## 5) Cookie security behavior improved

### What changed
- File: `backend-fastapi/app/api/v1/routes/auth.py`
- Added `_cookie_secure()` helper:
  - `secure=True` automatically when `ENV != local`
  - Still supports explicit local override via existing `AUTH_COOKIE_SECURE`

### Why
- Avoid insecure cookie transport in non-local environments.

## 6) CORS tightened by environment

### What changed
- File: `backend-fastapi/app/main.py`
- Localhost/LAN regex now only enabled for `env=local`.
- Production relies on explicit `frontend_cors_origins` (+ optional `frontend_base_url`).

### Why
- Reduces over-broad origin trust in production.

## 7) RBAC enforcement for signatures/workflow endpoints

### What changed
- Files:
  - `backend-fastapi/app/signatures/router.py`
  - `backend-fastapi/app/contracts/router.py`
- Added explicit permission dependencies:
  - Signatures create/sync: `contracts:approve`
  - Signatures read/list: `contracts:read`
  - Contracts workflow read: `contracts:read`
  - Contracts workflow update: `contracts:approve`

### Why
- Prevents authenticated-but-unauthorized users from managing signatures/workflows.

## 8) Rate limiting improved for distributed deployments

### What changed
- Files:
  - `backend-fastapi/app/core/rate_limit.py`
  - `backend-fastapi/app/core/config.py`
- Added Redis-backed rate limiting (`INCR` + `EXPIRE`) with in-memory fallback.
- Removed hardcoded local bypass; now configurable.

### New config keys
- `RATE_LIMIT_USE_REDIS` (default: `true`)
- `RATE_LIMIT_SKIP_IN_LOCAL` (default: `false`)

### Why
- In-memory-only limiting is weak in multi-instance deployments.

## 9) File upload path traversal hardening

### What changed
- File: `backend-fastapi/app/storage/local.py`
- `save_signed_contract_upload()` now sanitizes filename using `Path(...).name`.

### Why
- Prevents path traversal via malicious upload filenames.

## 10) Frontend workflow query guard

### What changed
- File: `frontend-react/src/components/erp/contracts/ContractsModule.tsx`
- Contract detail workflow query now requires `resolvedTenantId` before fetch.

### Why
- Avoids invalid workflow calls when tenant context is missing.

## 11) Container runtime hardening

### What changed
- File: `backend-fastapi/Dockerfile`
- Added non-root runtime user (`appuser`) and switched container execution user.

### Why
- Reduces blast radius if application process is compromised.

## Verification executed

- `pytest -q backend-fastapi/tests/test_signaturit_integration.py` -> passed
- `pytest -q backend-fastapi/tests/test_contracts_workflow_permissions.py` -> passed
- `npm --prefix frontend-react run build` -> passed

## Remaining quality plan (large files)

Two files are still oversized and should be split in phased refactors:
- `backend-fastapi/app/contracts/service.py`
- `frontend-react/src/components/erp/contracts/ContractsModule.tsx`

Recommended phased split:
1. Extract workflow-related logic into dedicated service modules.
2. Extract signature integration orchestration into a separate domain service.
3. Split React module into route-level page shell + per-tab feature components.
4. Keep API adapters/types isolated from visual components.
5. Add focused unit tests per extracted module before deleting legacy sections.

## Deployment checklist

1. Set `SIGNATURIT_WEBHOOK_TOKEN` in backend environment.
2. Ensure Signaturit callback URL uses your API public URL (HTTPS).
3. Confirm frontend sends cookies with `withCredentials=true` (already set).
4. Validate CORS origins for production explicitly in `FRONTEND_CORS_ORIGINS`.
5. Ensure Redis is available if `RATE_LIMIT_USE_REDIS=true`.
