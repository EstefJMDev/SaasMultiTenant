from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.config import settings
from app.domains.invoices.models import Invoice, NotificationLog, NotificationType
from app.models.tenant import Tenant
from app.models.user import User
from app.workers.tasks import invoices as invoices_tasks


def test_send_invoice_created_notification_sends_email_and_logs(
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    tenant = Tenant(name="Tenant Test", subdomain="tenant-test")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    user = User(
        email="creator@example.com",
        full_name="Creator",
        hashed_password="hashed",
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        role_id=None,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    invoice = Invoice(
        tenant_id=tenant.id,
        created_by_id=user.id,
        file_path="test.pdf",
        original_filename="test.pdf",
        created_at=datetime.now(timezone.utc),
    )
    db_session_fixture.add(invoice)
    db_session_fixture.commit()
    db_session_fixture.refresh(invoice)

    captured = {}

    def _fake_send(to_emails, _invoice) -> None:
        captured["recipients"] = list(to_emails)
        captured["invoice_id"] = _invoice.id

    settings.invoice_created_extra_recipients = ["extra@example.com"]
    monkeypatch.setattr(invoices_tasks, "engine", db_session_fixture.get_bind())
    monkeypatch.setattr(invoices_tasks, "send_invoice_created_email", _fake_send)

    invoices_tasks.send_invoice_created_notification(invoice.id)

    assert sorted(captured["recipients"]) == sorted(
        ["creator@example.com", "extra@example.com"]
    )
    assert captured["invoice_id"] == invoice.id

    log_entry = db_session_fixture.exec(
        select(NotificationLog).where(
            NotificationLog.invoice_id == invoice.id,
            NotificationLog.notification_type == NotificationType.CREATED,
        )
    ).one_or_none()
    assert log_entry is not None
