from typing import List
from pydantic_settings import BaseSettings
from functools import lru_cache
from urllib.parse import quote_plus

class Settings(BaseSettings):
    PROJECT_NAME: str = "Portales del Paraíso - Facturación"
    API_V1_STR: str = "/api/v1"
    
    DATABASE_URL: str = "sqlite:///./portales_facturacion.db"
    USE_POSTGRES: bool = False
    
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "Junio.2021"
    POSTGRES_DB: str = "portales_facturacion"
    
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    SECRET_KEY: str = "super-secret-key-change-in-production-2024"
    
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        case_sensitive = True
        env_file = ".env"
    
    def get_database_url(self) -> str:
        if self.USE_POSTGRES:
            password = quote_plus(self.POSTGRES_PASSWORD)
            return f"postgresql://{self.POSTGRES_USER}:{password}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        return self.DATABASE_URL

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()