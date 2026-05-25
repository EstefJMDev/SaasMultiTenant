import json
import logging
import time

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


logger = logging.getLogger("app.permissions.cache")

_REDIS_CLIENT: Redis | None = None
_LOCAL_CACHE: dict[int, tuple[float, set[str]]] = {}
_LOCAL_MAX_ENTRIES = 5_000


def _cache_ttl_seconds() -> int:
    return max(int(settings.permissions_cache_ttl_seconds or 0), 1)


def _cache_key(role_id: int) -> str:
    return f"role_permissions:{role_id}"


def _prune_local_cache(now_ts: float) -> None:
    stale_roles = [role_id for role_id, (expires_at, _) in _LOCAL_CACHE.items() if expires_at <= now_ts]
    for role_id in stale_roles:
        _LOCAL_CACHE.pop(role_id, None)

    if len(_LOCAL_CACHE) <= _LOCAL_MAX_ENTRIES:
        return

    overflow = len(_LOCAL_CACHE) - _LOCAL_MAX_ENTRIES
    oldest_first = sorted(_LOCAL_CACHE.items(), key=lambda item: item[1][0])
    for role_id, _ in oldest_first[:overflow]:
        _LOCAL_CACHE.pop(role_id, None)


def _get_redis_client() -> Redis | None:
    global _REDIS_CLIENT
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    if not settings.permissions_cache_use_redis or not settings.redis_url:
        return None
    try:
        _REDIS_CLIENT = Redis.from_url(settings.redis_url, decode_responses=True)
        return _REDIS_CLIENT
    except Exception as exc:
        logger.warning("Permission cache Redis no disponible (init): %s", exc)
        return None


def get_role_permissions_cache(role_id: int) -> set[str] | None:
    if role_id <= 0:
        return set()

    now_ts = time.time()
    local_entry = _LOCAL_CACHE.get(role_id)
    if local_entry and local_entry[0] > now_ts:
        return set(local_entry[1])
    if local_entry:
        _LOCAL_CACHE.pop(role_id, None)

    client = _get_redis_client()
    if client is None:
        return None
    try:
        payload = client.get(_cache_key(role_id))
        if payload is None:
            return None
        parsed = json.loads(payload)
        permissions = {str(item).strip() for item in parsed if isinstance(item, str) and item.strip()}
        _LOCAL_CACHE[role_id] = (now_ts + _cache_ttl_seconds(), permissions)
        return permissions
    except (RedisError, ValueError, TypeError) as exc:
        logger.warning("Permission cache Redis read error: %s", exc)
        return None


def set_role_permissions_cache(role_id: int, permissions: set[str]) -> None:
    if role_id <= 0:
        return

    normalized = {perm.strip() for perm in permissions if isinstance(perm, str) and perm.strip()}
    ttl_seconds = _cache_ttl_seconds()
    now_ts = time.time()
    _LOCAL_CACHE[role_id] = (now_ts + ttl_seconds, normalized)
    _prune_local_cache(now_ts)

    client = _get_redis_client()
    if client is None:
        return
    try:
        client.setex(_cache_key(role_id), ttl_seconds, json.dumps(sorted(normalized)))
    except RedisError as exc:
        logger.warning("Permission cache Redis write error: %s", exc)


def invalidate_role_permissions_cache(role_id: int) -> None:
    if role_id <= 0:
        return

    _LOCAL_CACHE.pop(role_id, None)

    client = _get_redis_client()
    if client is None:
        return
    try:
        client.delete(_cache_key(role_id))
    except RedisError as exc:
        logger.warning("Permission cache Redis delete error: %s", exc)

