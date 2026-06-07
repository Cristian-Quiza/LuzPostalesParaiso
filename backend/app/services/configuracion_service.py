from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from sqlalchemy.exc import OperationalError
from datetime import datetime
from types import SimpleNamespace
from app.models.models import Configuracion

class ConfiguracionService:
    
    @staticmethod
    def get_configuraciones(db: Session, incluir_inactivas: bool = False):
        try:
            query = db.query(Configuracion)
            if not incluir_inactivas:
                query = query.filter(Configuracion.activa == True)
            return query.order_by(Configuracion.clave, Configuracion.fecha_inicio.desc()).all()
        except OperationalError:
            db.rollback()
            rows = db.execute(
                text(
                    "SELECT id, clave, valor, descripcion, updated_at "
                    "FROM configuraciones ORDER BY clave"
                )
            ).fetchall()
            current_year = datetime.now().year
            current_month = str(datetime.now().month).zfill(2)
            return [
                SimpleNamespace(
                    id=row[0],
                    clave=row[1],
                    valor=row[2],
                    descripcion=row[3],
                    anio=current_year,
                    periodo_mes=current_month,
                    periodo_corte=None,
                    activa=True,
                    fecha_inicio=row[4],
                    fecha_fin=None,
                    created_at=row[4],
                    updated_at=row[4],
                )
                for row in rows
            ]
    
    @staticmethod
    def get_configuracion_actual(db: Session, clave: str):
        try:
            return db.query(Configuracion).filter(
                and_(
                    Configuracion.clave == clave,
                    Configuracion.activa == True
                )
            ).first()
        except OperationalError:
            db.rollback()
            row = db.execute(
                text("SELECT clave, valor, descripcion FROM configuraciones WHERE clave = :clave LIMIT 1"),
                {"clave": clave}
            ).fetchone()
            if not row:
                return None
            return SimpleNamespace(clave=row[0], valor=row[1], descripcion=row[2])

    @staticmethod
    def get_configuracion_periodo(db: Session, clave: str, anio: int, periodo_mes: str):
        try:
            return db.query(Configuracion).filter(
                and_(
                    Configuracion.clave == clave,
                    Configuracion.activa == True,
                    Configuracion.anio == anio,
                    Configuracion.periodo_mes == periodo_mes
                )
            ).order_by(Configuracion.fecha_inicio.desc()).first()
        except OperationalError:
            # Compatibilidad con esquemas antiguos sin columnas anio/periodo_mes.
            db.rollback()
            return None

    @staticmethod
    def get_configuracion_valor(
        db: Session,
        clave: str,
        anio: int | None = None,
        periodo_mes: str | None = None,
        default: float | None = None
    ):
        config = None
        if anio is not None and periodo_mes is not None:
            config = ConfiguracionService.get_configuracion_periodo(db, clave, anio, periodo_mes)
        if not config:
            config = ConfiguracionService.get_configuracion_actual(db, clave)
        if not config or config.valor is None:
            return default
        return config.valor
    
    @staticmethod
    def get_historial(db: Session, clave: str = None):
        try:
            query = db.query(Configuracion)
            if clave:
                query = query.filter(Configuracion.clave == clave)
            return query.order_by(Configuracion.clave, Configuracion.fecha_inicio.desc()).all()
        except OperationalError:
            db.rollback()
            return []
    
    @staticmethod
    def get_historial_periodo(db: Session):
        try:
            return db.query(Configuracion).filter(
                Configuracion.clave.in_(['periodo_anio', 'periodo_mes', 'periodo_actual'])
            ).order_by(Configuracion.fecha_inicio.desc()).all()
        except OperationalError:
            db.rollback()
            return []
    
    @staticmethod
    def set_configuracion(db: Session, clave: str, valor: str, descripcion: str = None, anio: int = None, periodo_mes: str = None, periodo_corte: str = None):
        # La tabla configuraciones exige anio NOT NULL.
        # Si el cliente no envía periodo explícito, heredamos del período activo.
        if anio is None:
            periodo_anio = ConfiguracionService.get_configuracion_actual(db, "periodo_anio")
            try:
                anio = int(periodo_anio.valor) if periodo_anio and periodo_anio.valor else datetime.now().year
            except (TypeError, ValueError):
                anio = datetime.now().year

        if not periodo_mes:
            periodo_mes_cfg = ConfiguracionService.get_configuracion_actual(db, "periodo_mes")
            periodo_mes = periodo_mes_cfg.valor if periodo_mes_cfg and periodo_mes_cfg.valor else str(datetime.now().month).zfill(2)

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
        try:
            return db.query(Configuracion).filter(
                and_(
                    Configuracion.clave == clave,
                    Configuracion.activa == True
                )
            ).first()
        except OperationalError:
            db.rollback()
            row = db.execute(
                text("SELECT clave, valor, descripcion FROM configuraciones WHERE clave = :clave LIMIT 1"),
                {"clave": clave}
            ).fetchone()
            if not row:
                return None
            return SimpleNamespace(clave=row[0], valor=row[1], descripcion=row[2])
    
    @staticmethod
    def delete_configuracion(db: Session, id: int):
        config = db.query(Configuracion).filter(Configuracion.id == id).first()
        if config:
            db.delete(config)
            db.commit()
            return True
        return False
