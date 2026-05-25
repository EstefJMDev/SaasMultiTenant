from pathlib import Path
import hmac

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router as api_v1_router
from app.domains.procurement.contracts.routers.public_router import public_router as contracts_public_router
from app.core.audit import reset_audit_source, set_audit_source
from app.core.config import settings
from app.core.db import init_db
from app.core.errors import register_exception_handlers
from app.core.log_context import (
    reset_log_tenant_id,
    reset_log_user_id,
    set_log_tenant_id,
    set_log_user_id,
)
from app.core.logging import configure_logging
from app.core.rate_limit import check_rate_limit_backend_connectivity
from app.domains.signatures.routers.legacy import public_router as signatures_public_router

_ALLOWED_AUDIT_SOURCES = {"web", "mobile", "api"}


def create_app() -> FastAPI:
    """
    Crea y configura la instancia principal de FastAPI.
    """

    configure_logging()

    app = FastAPI(
        title="SaaS Multi-Tenant API",
        version="0.1.0",
        description="API principal de la plataforma SaaS multi-tenant.",
        debug=settings.debug,
        docs_url="/docs" if settings.env == "local" else None,
        redoc_url="/redoc" if settings.env == "local" else None,
        openapi_url="/openapi.json" if settings.env == "local" else None,
    )
    register_exception_handlers(app)

    cors_origins = [o for o in list(settings.allowed_origins or []) if o and o != "*"]
    if not cors_origins:
        cors_origins = [o for o in list(settings.frontend_cors_origins or []) if o and o != "*"]
    if settings.frontend_base_url and settings.frontend_base_url not in cors_origins:
        cors_origins.append(settings.frontend_base_url)

    allow_origins = cors_origins
    allow_origin_regex = None

    class AuditSourceMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            source = (request.headers.get("X-Source") or "web").strip().lower()
            if source not in _ALLOWED_AUDIT_SOURCES:
                source = "web"
            token = set_audit_source(source)
            try:
                response = await call_next(request)
            finally:
                reset_audit_source(token)
            return response

    class LogContextMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            raw_tenant = (request.headers.get("X-Tenant-Id") or "").strip()
            tenant_id: int | None = None
            if raw_tenant.isdigit():
                tenant_id = int(raw_tenant)
            tenant_token = set_log_tenant_id(tenant_id)
            user_token = set_log_user_id(None)
            try:
                response = await call_next(request)
            finally:
                reset_log_user_id(user_token)
                reset_log_tenant_id(tenant_token)
            return response

    class CSRFMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if not settings.csrf_enabled:
                return await call_next(request)

            method = request.method.upper()
            is_state_change = method in {"POST", "PUT", "PATCH", "DELETE"}
            is_api = request.url.path.startswith("/api/v1/") or request.url.path.startswith("/public/")
            is_auth_bootstrap = request.url.path in {
                "/api/v1/auth/login",
                "/api/v1/auth/mfa/verify",
                "/api/v1/invitations/accept",
            }
            has_auth_cookie = bool(request.cookies.get(settings.auth_cookie_name))
            has_bearer_header = str(request.headers.get("Authorization") or "").startswith("Bearer ")

            if is_state_change and is_api and not is_auth_bootstrap and has_auth_cookie and not has_bearer_header:
                cookie_token = request.cookies.get(settings.csrf_cookie_name)
                header_token = request.headers.get(settings.csrf_header_name) or request.headers.get("x-csrf-token")
                if not cookie_token or not header_token or not hmac.compare_digest(cookie_token, header_token):
                    from fastapi.responses import JSONResponse

                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF token invalido o ausente."},
                    )
            return await call_next(request)

    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            response = await call_next(request)
            is_contract_inline_preview = (
                request.url.path.startswith("/api/v1/contracts/")
                and request.url.path.endswith("/download")
                and str(request.query_params.get("inline", "")).lower() == "true"
            )
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "SAMEORIGIN" if is_contract_inline_preview else "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            if settings.env != "local":
                frame_ancestors = "'self'" if is_contract_inline_preview else "'none'"
                response.headers["Content-Security-Policy"] = (
                    "default-src 'self'; "
                    "base-uri 'self'; "
                    f"frame-ancestors {frame_ancestors}; "
                    "object-src 'none'; "
                    "form-action 'self'"
                )
                response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            return response

    app.add_middleware(AuditSourceMiddleware)
    app.add_middleware(LogContextMiddleware)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup() -> None:
        init_db()
        check_rate_limit_backend_connectivity(startup=True)

    app.include_router(api_v1_router, prefix="/api/v1")
    app.include_router(contracts_public_router, prefix="/public")
    app.include_router(signatures_public_router, prefix="/public")

    Path(settings.avatars_storage_path).mkdir(parents=True, exist_ok=True)
    Path(settings.logos_storage_path).mkdir(parents=True, exist_ok=True)
    Path(settings.project_docs_storage_path).mkdir(parents=True, exist_ok=True)

    # Contract files intentionally remain private and are served only
    # via explicit endpoints with permission checks.
    contracts_path = Path(settings.contracts_storage_path)
    contracts_path.mkdir(parents=True, exist_ok=True)

    return app


app = create_app()
