from typing import List
from pydantic_settings import BaseSettings
from functools import lru_cache
from urllib.parse import quote_plus
import secrets

class Settings(BaseSettings):
    PROJECT_NAME: str = "Portales del Paraíso - Facturación"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"  # "production" deshabilita /docs y endurece CORS

    # En desarrollo se permite SQLite; en producción DATABASE_URL es obligatorio.
    DATABASE_URL: str = "sqlite:///./portales_facturacion.db"
    USE_POSTGRES: bool = False

    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""  # vacío por seguridad; provee via env
    POSTGRES_DB: str = "portales_facturacion"
    POSTGRES_SSLMODE: str = "require"

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    # Si no se provee SECRET_KEY, generamos uno aleatorio en runtime.
    # OJO: esto invalida los tokens emitidos en reinicios. En prod siempre setearlo via env.
    SECRET_KEY: str = ""

    # CSV de orígenes permitidos. Vacío = no CORS extra (usa solo same-origin).
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8001"

    class Config:
        case_sensitive = True
        env_file = ".env"

    def get_database_url(self) -> str:
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL

        if self.USE_POSTGRES:
            if not self.POSTGRES_PASSWORD:
                raise RuntimeError(
                    "POSTGRES_PASSWORD no está configurado. Provee DATABASE_URL o POSTGRES_PASSWORD via .env"
                )
            password = quote_plus(self.POSTGRES_PASSWORD)
            return (
                f"postgresql://{self.POSTGRES_USER}:{password}"
                f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
                f"?sslmode={self.POSTGRES_SSLMODE}"
            )
        return self.DATABASE_URL

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    def get_secret_key(self) -> str:
        if self.SECRET_KEY:
            return self.SECRET_KEY
        if self.is_production:
            raise RuntimeError(
                "SECRET_KEY no está configurado en producción. Genera uno con "
                "`python -c \"import secrets; print(secrets.token_urlsafe(64))\"` "
                "y configúralo en las variables de entorno."
            )
        # Solo en desarrollo: generar uno aleatorio en memoria (invalida tokens al reiniciar).
        return secrets.token_urlsafe(64)


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    # Materializa SECRET_KEY para que sea estable durante el proceso.
    if not s.SECRET_KEY:
        s.SECRET_KEY = s.get_secret_key()
    return s

settings = get_settings()
