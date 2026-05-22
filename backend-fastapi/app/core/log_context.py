from __future__ import annotations

import contextvars


_tenant_id_ctx: contextvars.ContextVar[int | None] = contextvars.ContextVar(
    "log_tenant_id",
    default=None,
)
_user_id_ctx: contextvars.ContextVar[int | None] = contextvars.ContextVar(
    "log_user_id",
    default=None,
)


def set_log_tenant_id(tenant_id: int | None) -> contextvars.Token:
    return _tenant_id_ctx.set(tenant_id)


def reset_log_tenant_id(token: contextvars.Token) -> None:
    _tenant_id_ctx.reset(token)


def get_log_tenant_id() -> int | None:
    return _tenant_id_ctx.get()


def set_log_user_id(user_id: int | None) -> contextvars.Token:
    return _user_id_ctx.set(user_id)


def reset_log_user_id(token: contextvars.Token) -> None:
    _user_id_ctx.reset(token)


def get_log_user_id() -> int | None:
    return _user_id_ctx.get()

