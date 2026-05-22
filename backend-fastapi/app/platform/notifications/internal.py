from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from app.core.config import settings
from app.db.session import get_session
from app.models.notification import NotificationType
from app.models.user import User
from app.services.notification_service import create_notification


router = APIRouter()


class InternalNotificationCreate(BaseModel):
    email: EmailStr
    title: str
    body: str
    reference: Optional[str] = None


@router.post("/notifications", status_code=status.HTTP_201_CREATED)
def api_create_notification(
    payload: InternalNotificationCreate,
    session: Session = Depends(get_session),
    api_key: Optional[str] = Header(default=None, alias="X-SAAS-API-KEY"),
) -> None:
    if not settings.saas_internal_api_key or api_key != settings.saas_internal_api_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    user = session.exec(select(User).where(User.email == payload.email)).one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no tenant",
        )

    create_notification(
        session=session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        type=NotificationType.GENERIC,
        title=payload.title,
        body=payload.body,
        reference=payload.reference,
    )
