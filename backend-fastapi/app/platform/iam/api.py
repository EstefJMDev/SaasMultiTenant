from fastapi import APIRouter

from app.platform.iam import invitations as legacy_invitations
from app.platform.iam import users as legacy_users


router = APIRouter()
router.include_router(legacy_users.router, prefix="/users", tags=["users"])
router.include_router(
    legacy_invitations.router,
    prefix="/invitations",
    tags=["invitations"],
)
