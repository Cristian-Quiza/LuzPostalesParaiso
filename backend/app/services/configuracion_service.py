from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime
from app.models.models import Configuracion

class ConfiguracionService:
    
    @staticmethod
    def get_configuraciones(db: Session, incluir_inactivas: bool = False):
        query = db.query(Configuracion)
        if not incluir_inactivas:
            query = query.filter(Configuracion.activa == True)
        return query.order_by(Configuracion.clave, Configuracion.fecha_inicio.desc()).all()
    
    @staticmethod
    def get_configuracion_actual(db: Session, clave: str):
        return db.query(Configuracion).filter(
            and_(
                Configuracion.clave == clave,
                Configuracion.activa == True
            )
        ).first()
    
    @staticmethod
    def get_historial(db: Session, clave: str = None):
        query = db.query(Configuracion)
        if clave:
            query = query.filter(Configuracion.clave == clave)
        return query.order_by(Configuracion.clave, Configuracion.fecha_inicio.desc()).all()
    
    @staticmethod
    def get_historial_periodo(db: Session):
        return db.query(Configuracion).filter(
            Configuracion.clave.in_(['periodo_anio', 'periodo_mes', 'periodo_actual'])
        ).order_by(Configuracion.fecha_inicio.desc()).all()
    
    @staticmethod
    def set_configuracion(db: Session, clave: str, valor: str, descripcion: str = None, anio: int = None, periodo_mes: str = None, periodo_corte: str = None):
        config_existente = db.query(Configuracion).filter(
            and_(
                Configuracion.clave == clave,
                Configuracion.activa == True
            )
        ).first()
        
        if config_existente:
            config_existente.activa = False
            config_existente.fecha_fin = datetime.now()
        
        nueva_config = Configuracion(
            clave=clave,
            valor=valor,
            descripcion=descripcion,
            anio=anio,
            periodo_mes=periodo_mes,
            periodo_corte=periodo_corte,
            activa=True,
            fecha_inicio=datetime.now()
        )
        db.add(nueva_config)
        db.commit()
        db.refresh(nueva_config)
        return nueva_config
    
    @staticmethod
    def set_configuracion_periodo(db: Session, anio: int, mes: str, periodo_actual: str, periodo_corte: str):
        config_existente = db.query(Configuracion).filter(
            and_(
                Configuracion.clave == 'periodo_sistema',
                Configuracion.activa == True
            )
        ).first()
        
        if config_existente:
            config_existente.activa = False
            config_existente.fecha_fin = datetime.now()
        
        nueva_config = Configuracion(
            clave='periodo_sistema',
            valor=periodo_actual,
            descripcion='Configuración de período del sistema',
            anio=anio,
            periodo_mes=mes,
            periodo_corte=periodo_corte,
            activa=True,
            fecha_inicio=datetime.now()
        )
        db.add(nueva_config)
        db.commit()
        db.refresh(nueva_config)
        return nueva_config
    
    @staticmethod
    def get_configuracion(db: Session, clave: str):
        return db.query(Configuracion).filter(
            and_(
                Configuracion.clave == clave,
                Configuracion.activa == True
            )
        ).first()
    
    @staticmethod
    def delete_configuracion(db: Session, id: int):
        config = db.query(Configuracion).filter(Configuracion.id == id).first()
        if config:
            db.delete(config)
            db.commit()
            return True
        return False