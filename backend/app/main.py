from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import main

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Sistema de Facturación de Energía - Portales del Paraíso",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(main.router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "message": "Sistema de Facturación - Portales del Paraíso",
        "version": "1.0.0",
        "docs": f"{settings.API_V1_STR}/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}