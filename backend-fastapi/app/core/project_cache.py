import json
import logging
import time
from typing import Any, Optional

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


logger = logging.getLogger("app.projects.cache")

_REDIS_CLIENT: Redis | None = None
_LOCAL_CACHE: dict[tuple[int, int], tuple[float, dict[str, Any]]] = {}
_LOCAL_MAX_ENTRIES = 2_000


def _cache_ttl_seconds() -> int:
    return max(int(settings.project_cache_ttl_seconds or 0), 1)


def _cache_key(project_id: int) -> str:
    return f"project:{project_id}"


def _prune_local_cache(now_ts: float) -> None:
    stale = [k for k, (expires_at, _) in _LOCAL_CACHE.items() if expires_at <= now_ts]
    for k in stale:
        _LOCAL_CACHE.pop(k, None)

    if len(_LOCAL_CACHE) <= _LOCAL_MAX_ENTRIES:
        return

    overflow = len(_LOCAL_CACHE) - _LOCAL_MAX_ENTRIES
    oldest_first = sorted(_LOCAL_CACHE.items(), key=lambda item: item[1][0])
    for k, _ in oldest_first[:overflow]:
        _LOCAL_CACHE.pop(k, None)


def _get_redis_client() -> Redis | None:
    global _REDIS_CLIENT
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    if not settings.project_cache_use_redis or not settings.redis_url:
        return None
    try:
        _REDIS_CLIENT = Redis.from_url(settings.redis_url, decode_responses=True)
        return _REDIS_CLIENT
    except Exception as exc:
        logger.warning("Project cache Redis no disponible (init): %s", exc)
        return None


def get_project_cache(
    project_id: int,
    tenant_id: Optional[int],
) -> dict[str, Any] | None:
    local_key = (project_id, tenant_id if tenant_id is not None else -1)
    now_ts = time.time()

    local_entry = _LOCAL_CACHE.get(local_key)
    if local_entry and local_entry[0] > now_ts:
        return dict(local_entry[1])
    if local_entry:
        _LOCAL_CACHE.pop(local_key, None)

    client = _get_redis_client()
    if client is None:
        return None
    try:
        payload = client.get(_cache_key(project_id))
        if payload is None:
            return None
        data: dict[str, Any] = json.loads(payload)
        # Verify tenant ownership before returning cached data.
        if tenant_id is not None and data.get("tenant_id") != tenant_id:
            return None
        _LOCAL_CACHE[local_key] = (now_ts + _cache_ttl_seconds(), data)
        return dict(data)
    except (RedisError, ValueError, TypeError) as exc:
        logger.warning("Project cache Redis read error: %s", exc)
        return None


def set_project_cache(project_id: int, tenant_id: Optional[int], data: dict[str, Any]) -> None:
    local_key = (project_id, tenant_id if tenant_id is not None else -1)
    ttl_seconds = _cache_ttl_seconds()
    now_ts = time.time()
    _LOCAL_CACHE[local_key] = (now_ts + ttl_seconds, data)
    _prune_local_cache(now_ts)

    client = _get_redis_client()
    if client is None:
        return
    try:
        client.setex(_cache_key(project_id), ttl_seconds, json.dumps(data, default=str))
    except RedisError as exc:
        logger.warning("Project cache Redis write error: %s", exc)


def invalidate_project_cache(project_id: int) -> None:
    # Remove all local entries for this project_id regardless of tenant.
    stale = [k for k in _LOCAL_CACHE if k[0] == project_id]
    for k in stale:
        _LOCAL_CACHE.pop(k, None)

    client = _get_redis_client()
    if client is None:
        return
    try:
        client.delete(_cache_key(project_id))
    except RedisError as exc:
        logger.warning("Project cache Redis delete error: %s", exc)
