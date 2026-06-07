from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import main
from app.db.schema_maintenance import ensure_runtime_schema

# En producción: ocultar la documentación pública.
_docs_url = None if settings.is_production else f"{settings.API_V1_STR}/docs"
_redoc_url = None if settings.is_production else f"{settings.API_V1_STR}/redoc"
_openapi_url = None if settings.is_production else f"{settings.API_V1_STR}/openapi.json"

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Sistema de Facturación de Energía - Portales del Paraíso",
    openapi_url=_openapi_url,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
)

# CORS: en prod usa la lista explícita; en dev permite el wildcard común.
_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins else ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(main.router, prefix=settings.API_V1_STR)


@app.on_event("startup")
def startup_schema_maintenance():
    ensure_runtime_schema()


@app.get("/")
def root():
    return {
        "message": "Sistema de Facturación - Portales del Paraíso",
        "version": "1.0.0",
        "env": settings.ENV,
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
