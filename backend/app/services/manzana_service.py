from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.models import Manzana
from app.schemas.schemas import ManzanaCreate

class ManzanaService:
    @staticmethod
    def get_manzana(db: Session, manzana_id: int) -> Optional[Manzana]:
        return db.query(Manzana).filter(Manzana.id == manzana_id).first()
    
    @staticmethod
    def get_manzana_by_codigo(db: Session, codigo: str) -> Optional[Manzana]:
        return db.query(Manzana).filter(Manzana.codigo == codigo).first()
    
    @staticmethod
    def get_manzana_with_viviendas(db: Session, manzana_id: int) -> Optional[Manzana]:
        return db.query(Manzana).filter(Manzana.id == manzana_id).first()
    
    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Manzana]:
        return db.query(Manzana).offset(skip).limit(limit).all()
    
    @staticmethod
    def get_manzana(db: Session, manzana_id: int) -> Optional[Manzana]:
        return db.query(Manzana).filter(Manzana.id == manzana_id).first()
    
    @staticmethod
    def get_manzana_with_viviendas(db: Session, manzana_id: int) -> Optional[Manzana]:
        return db.query(Manzana).filter(Manzana.id == manzana_id).first()
    
    @staticmethod
    def get_manzana_by_codigo_with_viviendas(db: Session, codigo: str) -> Optional[Manzana]:
        return db.query(Manzana).filter(Manzana.codigo == codigo).first()
    
    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Manzana]:
        return db.query(Manzana).offset(skip).limit(limit).all()
    
    @staticmethod
    def create_manzana(db: Session, data: ManzanaCreate) -> Manzana:
        existing = db.query(Manzana).filter(Manzana.codigo == data.codigo).first()
        if existing:
            raise ValueError(f"La manzana con código {data.codigo} ya existe")
        
        db_manzana = Manzana(
            codigo=data.codigo,
            nombre=data.nombre,
            descripcion=data.descripcion
        )
        db.add(db_manzana)
        db.commit()
        db.refresh(db_manzana)
        return db_manzana
    
    @staticmethod
    def update_manzana(db: Session, manzana_id: int, data: dict) -> Optional[Manzana]:
        manzana = db.query(Manzana).filter(Manzana.id == manzana_id).first()
        if not manzana:
            return None
        
        for key, value in data.items():
            if value is not None:
                setattr(manzana, key, value)
        
        db.commit()
        db.refresh(manzana)
        return manzana
    
    @staticmethod
    def delete_manzana(db: Session, manzana_id: int) -> bool:
        manzana = db.query(Manzana).filter(Manzana.id == manzana_id).first()
        if not manzana:
            return False
        
        db.delete(manzana)
        db.commit()
        return True