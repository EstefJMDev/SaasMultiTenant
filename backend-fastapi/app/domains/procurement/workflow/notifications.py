from __future__ import annotations

import logging

from app.platform.contracts_core.models import ContractNotificationEvent
from app.workers.tasks.contracts import send_contract_notification

logger = logging.getLogger("app.platform.contracts_core")


def _enqueue_contract_notification(event: ContractNotificationEvent, contract_id: int) -> None:
    try:
        send_contract_notification.delay(
            event=event,
            contract_id=contract_id,
        )
    except Exception as exc:
        logger.warning(
            "No se pudo encolar notificacion de contrato event=%s contract_id=%s: %s",
            event,
            contract_id,
            exc,
        )

