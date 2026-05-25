import logging


logger = logging.getLogger(__name__)


def mark_legacy_route(
    route_name: str,
    user_id: int | None,
    tenant_id: int | None,
) -> None:
    logger.warning(
        "legacy_route_used",
        extra={"route": route_name, "user": user_id, "tenant": tenant_id},
    )
