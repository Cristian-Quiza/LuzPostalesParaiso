from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.models import Vivienda
from app.schemas.schemas import ViviendaCreate

class ViviendaService:
    @staticmethod
    def get_viviendas(db: Session, skip: int = 0, limit: int = 100, manzana_id: Optional[int] = None) -> List[Vivienda]:
        query = db.query(Vivienda)
        if manzana_id:
            query = query.filter(Vivienda.manzana_id == manzana_id)
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def get_vivienda(db: Session, vivienda_id: int) -> Optional[Vivienda]:
        return db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
    
    @staticmethod
    def create_vivienda(db: Session, data: ViviendaCreate) -> Vivienda:
        db_vivienda = Vivienda(
            numero_casa=data.numero_casa,
            manzana_id=data.manzana_id,
            propietario=data.propietario,
            cedula=data.cedula,
            telefono=data.telefono,
            whatsapp=data.whatsapp,
            email=data.email,
            direccion=data.direccion,
            tiene_alumbrado=data.tiene_alumbrado,
            tiene_seguridad=data.tiene_seguridad,
            tiene_toma_lectura=data.tiene_toma_lectura,
            tiene_administracion=data.tiene_administracion
        )
        db.add(db_vivienda)
        db.commit()
        db.refresh(db_vivienda)
        return db_vivienda
    
    @staticmethod
    def update_vivienda(db: Session, vivienda_id: int, data: dict) -> Optional[Vivienda]:
        vivienda = db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
        if not vivienda:
            return None
        
        for key, value in data.items():
            if value is not None:
                setattr(vivienda, key, value)
        
        db.commit()
        db.refresh(vivienda)
        return vivienda
    
    @staticmethod
    def delete_vivienda(db: Session, vivienda_id: int) -> bool:
        vivienda = db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
        if not vivienda:
            return False
        
        db.delete(vivienda)
        db.commit()
        return True
    
    @staticmethod
    def get_viviendas_by_manzana(db: Session, manzana_id: int) -> List[Vivienda]:
        return db.query(Vivienda).filter(Vivienda.manzana_id == manzana_id).all()
    
    @staticmethod
    def get_all_viviendas(db: Session, skip: int = 0, limit: int = 100) -> List[Vivienda]:
        return db.query(Vivienda).offset(skip).limit(limit).all()
    
    @staticmethod
    def buscar_por_cedula(db: Session, cedula: str) -> List[Vivienda]:
        return db.query(Vivienda).filter(Vivienda.cedula == cedula).all()