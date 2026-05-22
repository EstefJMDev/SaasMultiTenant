import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _split_name(full_name: Optional[str]) -> tuple[str, str]:
    if not full_name:
        return ("", "")
    parts = full_name.strip().split()
    if not parts:
        return ("", "")
    first = parts[0]
    last = " ".join(parts[1:]) if len(parts) > 1 else ""
    return (first, last)


def sync_moodle_user(email: str, full_name: Optional[str], password: str) -> None:
    if not settings.moodle_base_url or not settings.moodle_token:
        logger.info("Moodle sync skipped: missing MOODLE_BASE_URL or MOODLE_TOKEN")
        return

    first_name, last_name = _split_name(full_name)
    if not first_name:
        first_name = email.split("@")[0]

    payload = {
        "wstoken": settings.moodle_token,
        "wsfunction": "core_user_create_users",
        "moodlewsrestformat": "json",
        "users[0][username]": email,
        "users[0][password]": password,
        "users[0][firstname]": first_name,
        "users[0][lastname]": last_name or ".",
        "users[0][email]": email,
        "users[0][auth]": "manual",
    }

    url = settings.moodle_base_url.rstrip("/") + "/webservice/rest/server.php"

    try:
        resp = httpx.post(url, data=payload, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and data.get("exception"):
            logger.error("Moodle sync failed for %s: %s", email, data)
    except Exception as exc:
        logger.exception("Moodle sync failed for %s: %s", email, exc)
