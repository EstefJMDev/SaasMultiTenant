from collections import defaultdict
from datetime import datetime, timedelta, timezone
import logging
from typing import DefaultDict, Tuple

from fastapi import HTTPException, Request, status
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


logger = logging.getLogger("app.rate_limit")

_BUCKETS: DefaultDict[Tuple[str, str], list[datetime]] = defaultdict(list)
_REDIS_CLIENT: Redis | None = None
_REDIS_FALLBACK_REASON: str | None = None
_FALLBACK_MAX_BUCKETS = 10_000
_FALLBACK_CLEANUP_INTERVAL = 100
_FALLBACK_OPS = 0


class RateLimitBackendUnavailable(RuntimeError):
    pass


def _prune_fallback_buckets(window_start: datetime) -> None:
    # Opportunistic global cleanup for inactive buckets.
    stale_ids: list[Tuple[str, str]] = []
    for bucket_id, timestamps in _BUCKETS.items():
        kept = [ts for ts in timestamps if ts >= window_start]
        if kept:
            _BUCKETS[bucket_id] = kept
        else:
            stale_ids.append(bucket_id)
    for bucket_id in stale_ids:
        _BUCKETS.pop(bucket_id, None)

    # Hard cap to avoid unbounded growth if many unique keys/hosts appear.
    if len(_BUCKETS) > _FALLBACK_MAX_BUCKETS:
        overflow = len(_BUCKETS) - _FALLBACK_MAX_BUCKETS
        oldest_first = sorted(
            _BUCKETS.items(),
            key=lambda item: item[1][-1] if item[1] else datetime.min.replace(tzinfo=timezone.utc),
        )
        for bucket_id, _ in oldest_first[:overflow]:
            _BUCKETS.pop(bucket_id, None)


def _get_redis_client() -> Redis | None:
    global _REDIS_CLIENT, _REDIS_FALLBACK_REASON
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    if not settings.rate_limit_use_redis or not settings.redis_url:
        if settings.env != "local":
            raise RateLimitBackendUnavailable("Rate limit requiere Redis fuera de local.")
        if _REDIS_FALLBACK_REASON != "disabled":
            _REDIS_FALLBACK_REASON = "disabled"
            logger.info("Rate limit Redis deshabilitado: usando fallback en memoria.")
        return None
    try:
        _REDIS_CLIENT = Redis.from_url(settings.redis_url, decode_responses=True)
        if _REDIS_FALLBACK_REASON is not None:
            logger.info("Rate limit Redis disponible de nuevo: usando backend Redis.")
            _REDIS_FALLBACK_REASON = None
        return _REDIS_CLIENT
    except Exception as exc:
        if settings.env != "local":
            raise RateLimitBackendUnavailable(f"Rate limit Redis no disponible (init): {exc}") from exc
        # Fallback to in-memory limiting if Redis cannot be initialized in local.
        if _REDIS_FALLBACK_REASON != "init_error":
            _REDIS_FALLBACK_REASON = "init_error"
            logger.warning(
                "Rate limit Redis no disponible (init): fallback en memoria activado. error=%s",
                exc,
            )
        return None


def _redis_enforce(bucket_key: str, limit: int, window_seconds: int) -> bool:
    global _REDIS_CLIENT, _REDIS_FALLBACK_REASON
    client = _get_redis_client()
    if client is None:
        return False
    try:
        with client.pipeline(transaction=True) as pipe:
            pipe.incr(bucket_key, 1)
            pipe.expire(bucket_key, window_seconds, nx=True)
            current, _ = pipe.execute()
        return int(current) > limit
    except RedisError as exc:
        if settings.env != "local":
            raise RateLimitBackendUnavailable(f"Rate limit Redis no disponible (runtime): {exc}") from exc
        # Local fallback when Redis is down.
        _REDIS_CLIENT = None
        if _REDIS_FALLBACK_REASON != "runtime_error":
            _REDIS_FALLBACK_REASON = "runtime_error"
            logger.warning(
                "Rate limit Redis no disponible (runtime): fallback en memoria activado. error=%s",
                exc,
            )
        return False


def check_rate_limit_backend_connectivity(*, startup: bool = False) -> bool:
    """
    Comprueba conectividad Redis para rate limit sin interrumpir la aplicación.
    """
    global _REDIS_CLIENT, _REDIS_FALLBACK_REASON

    try:
        client = _get_redis_client()
    except RateLimitBackendUnavailable as exc:
        if startup:
            logger.error("Rate limit backend obligatorio no disponible: %s", exc)
        return False
    if client is None:
        return False

    try:
        client.ping()
        if startup:
            logger.info("Rate limit Redis conectado correctamente (PING OK).")
        return True
    except RedisError as exc:
        _REDIS_CLIENT = None
        if settings.env != "local":
            if startup:
                logger.error("Rate limit Redis no responde a PING: %s", exc)
            return False
        if _REDIS_FALLBACK_REASON != "ping_error":
            _REDIS_FALLBACK_REASON = "ping_error"
            logger.warning(
                "Rate limit Redis no responde a PING: fallback en memoria activado. error=%s",
                exc,
            )
        return False


def enforce_rate_limit(request: Request, key: str, limit: int, window_seconds: int) -> None:
    """
    Simple rate limiting for sensitive endpoints (login, MFA).

    Uses Redis when available (distributed-safe). If Redis is unavailable,
    falls back to local in-memory buckets.
    """

    if settings.env == "local" and settings.rate_limit_skip_in_local:
        return

    client_host = request.client.host if request.client else "unknown"
    bucket_id = (key, client_host)
    bucket_key = f"rate-limit:{key}:{client_host}"

    try:
        using_redis = _get_redis_client() is not None
    except RateLimitBackendUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Rate limit backend unavailable: {exc}",
        ) from exc

    if using_redis:
        if _redis_enforce(bucket_key=bucket_key, limit=limit, window_seconds=window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos, intentalo de nuevo en unos instantes.",
            )
        return

    if settings.env != "local":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Rate limit backend unavailable: Redis required outside local.",
        )

    global _FALLBACK_OPS
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=window_seconds)
    _FALLBACK_OPS += 1

    if (
        len(_BUCKETS) > _FALLBACK_MAX_BUCKETS
        or _FALLBACK_OPS % _FALLBACK_CLEANUP_INTERVAL == 0
    ):
        _prune_fallback_buckets(window_start)

    # Local fallback window cleanup.
    timestamps = [ts for ts in _BUCKETS.get(bucket_id, []) if ts >= window_start]
    timestamps.append(now)
    _BUCKETS[bucket_id] = timestamps

    if len(timestamps) > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos, intentalo de nuevo en unos instantes.",
        )
