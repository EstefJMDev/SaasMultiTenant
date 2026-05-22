from fastapi import APIRouter

from app.domains.router import router as domains_router
from app.platform.router import router as platform_router


api_router = APIRouter()
api_router.include_router(platform_router)
api_router.include_router(domains_router)
