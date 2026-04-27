from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

if "postgresql" in settings.get_database_url():
    engine = create_engine(
        settings.get_database_url(),
        pool_pre_ping=True,
        echo=False,
        connect_args={
            "connect_timeout": 10,
            "options": "-c client_encoding=UTF8"
        }
    )
else:
    engine = create_engine(
        settings.get_database_url(),
        connect_args={"check_same_thread": False},
        echo=False,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()