import json
import logging
import time
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


logger = logging.getLogger("app.user_me.cache")

_REDIS_CLIENT: Redis | None = None
_LOCAL_CACHE: dict[int, tuple[float, dict[str, Any]]] = {}
_LOCAL_MAX_ENTRIES = 5_000


def _cache_ttl_seconds() -> int:
    return max(int(settings.user_me_cache_ttl_seconds or 0), 1)


def _cache_key(user_id: int) -> str:
    return f"user_me:{user_id}"


def _prune_local_cache(now_ts: float) -> None:
    stale_user_ids = [user_id for user_id, (expires_at, _) in _LOCAL_CACHE.items() if expires_at <= now_ts]
    for user_id in stale_user_ids:
        _LOCAL_CACHE.pop(user_id, None)

    if len(_LOCAL_CACHE) <= _LOCAL_MAX_ENTRIES:
        return

    overflow = len(_LOCAL_CACHE) - _LOCAL_MAX_ENTRIES
    oldest_first = sorted(_LOCAL_CACHE.items(), key=lambda item: item[1][0])
    for user_id, _ in oldest_first[:overflow]:
        _LOCAL_CACHE.pop(user_id, None)


def _get_redis_client() -> Redis | None:
    global _REDIS_CLIENT
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    if not settings.user_me_cache_use_redis or not settings.redis_url:
        return None
    try:
        _REDIS_CLIENT = Redis.from_url(settings.redis_url, decode_responses=True)
        return _REDIS_CLIENT
    except Exception as exc:
        logger.warning("User me cache Redis no disponible (init): %s", exc)
        return None


def get_user_me_cache(user_id: int) -> dict[str, Any] | None:
    if user_id <= 0:
        return None

    now_ts = time.time()
    local_entry = _LOCAL_CACHE.get(user_id)
    if local_entry and local_entry[0] > now_ts:
        return dict(local_entry[1])
    if local_entry:
        _LOCAL_CACHE.pop(user_id, None)

    client = _get_redis_client()
    if client is None:
        return None
    try:
        payload = client.get(_cache_key(user_id))
        if payload is None:
            return None
        parsed = json.loads(payload)
        if not isinstance(parsed, dict):
            return None
        _LOCAL_CACHE[user_id] = (now_ts + _cache_ttl_seconds(), parsed)
        return dict(parsed)
    except (RedisError, ValueError, TypeError) as exc:
        logger.warning("User me cache Redis read error: %s", exc)
        return None


def set_user_me_cache(user_id: int, value: dict[str, Any]) -> None:
    if user_id <= 0:
        return

    ttl_seconds = _cache_ttl_seconds()
    now_ts = time.time()
    _LOCAL_CACHE[user_id] = (now_ts + ttl_seconds, dict(value))
    _prune_local_cache(now_ts)

    client = _get_redis_client()
    if client is None:
        return
    try:
        client.setex(_cache_key(user_id), ttl_seconds, json.dumps(value, ensure_ascii=False, default=str))
    except RedisError as exc:
        logger.warning("User me cache Redis write error: %s", exc)


def invalidate_user_me_cache(user_id: int | None) -> None:
    if not user_id or user_id <= 0:
        return

    _LOCAL_CACHE.pop(user_id, None)

    client = _get_redis_client()
    if client is None:
        return
    try:
        client.delete(_cache_key(user_id))
    except RedisError as exc:
        logger.warning("User me cache Redis delete error: %s", exc)

