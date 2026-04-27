from fastapi import APIRouter

from app.api.routes import main

router = APIRouter()

router.include_router(main.router, tags=["API"])