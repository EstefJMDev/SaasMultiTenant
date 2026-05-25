from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import xml.etree.ElementTree as ET

import httpx
from redis import Redis

from app.core.config import settings


TSL_URL_ES = "https://sedediatid.mineco.gob.es/Prestadores/TSL/TSL.xml"


@dataclass
class TSLMetadata:
    source_url: str
    sequence_number: str | None
    next_update: datetime | None
    refreshed_at: datetime


class TSLManager:
    def __init__(self) -> None:
        self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
        self.cache_key = "signatures:tsl:es"
        self.meta_key = "signatures:tsl:es:meta"

    def _parse_metadata(self, xml_content: str) -> TSLMetadata:
        root = ET.fromstring(xml_content)
        ns = {
            "tsl": "http://uri.etsi.org/02231/v2#",
            "xsd": "http://www.w3.org/2001/XMLSchema",
        }
        seq = root.findtext(".//tsl:TSLSequenceNumber", namespaces=ns)
        next_update_text = root.findtext(".//tsl:NextUpdate/tsl:dateTime", namespaces=ns)
        next_update = None
        if next_update_text:
            try:
                next_update = datetime.fromisoformat(next_update_text.replace("Z", "+00:00"))
            except Exception:
                next_update = None
        return TSLMetadata(
            source_url=TSL_URL_ES,
            sequence_number=seq,
            next_update=next_update,
            refreshed_at=datetime.now(timezone.utc),
        )

    def refresh(self) -> TSLMetadata:
        with httpx.Client(timeout=20) as client:
            response = client.get(TSL_URL_ES)
            response.raise_for_status()
            xml_content = response.text
        meta = self._parse_metadata(xml_content)
        self.redis.set(self.cache_key, xml_content)
        self.redis.set(
            self.meta_key,
            json.dumps(
                {
                    "source_url": meta.source_url,
                    "sequence_number": meta.sequence_number,
                    "next_update": meta.next_update.isoformat() if meta.next_update else None,
                    "refreshed_at": meta.refreshed_at.isoformat(),
                }
            ),
        )
        return meta

    def get_or_refresh(self) -> tuple[str, TSLMetadata]:
        cached = self.redis.get(self.cache_key)
        meta_json = self.redis.get(self.meta_key)
        if cached and meta_json:
            parsed = json.loads(meta_json)
            next_update = parsed.get("next_update")
            next_update_dt = (
                datetime.fromisoformat(next_update) if isinstance(next_update, str) and next_update else None
            )
            now = datetime.now(timezone.utc)
            if next_update_dt is None or next_update_dt > now:
                return (
                    cached,
                    TSLMetadata(
                        source_url=parsed.get("source_url") or TSL_URL_ES,
                        sequence_number=parsed.get("sequence_number"),
                        next_update=next_update_dt,
                        refreshed_at=datetime.fromisoformat(parsed["refreshed_at"]),
                    ),
                )
        meta = self.refresh()
        return self.redis.get(self.cache_key) or "", meta
