import re

from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional, List

from app.models.models import Vivienda, Manzana, Lectura, Factura, Pago, FacturacionMensual
from app.schemas.schemas import ViviendaCreate

class ViviendaService:
    @staticmethod
    def _normalize_code(value: object) -> str:
        return re.sub(r"[^0-9a-z]+", "", str(value or "").lower())

    @staticmethod
    def _normalize_digits(value: object) -> str:
        return re.sub(r"\D+", "", str(value or ""))

    @staticmethod
    def _resolve_manzana_id(db: Session, value: int | str | None) -> Optional[int]:
        if value is None:
            return None

        try:
            numeric_value = int(value)
        except (TypeError, ValueError):
            numeric_value = None

        if numeric_value is not None:
            manzana = db.query(Manzana).filter(Manzana.id == numeric_value).first()
            if manzana:
                return manzana.id

        wanted_digits = ViviendaService._normalize_digits(value)
        wanted_code = ViviendaService._normalize_code(value)
        for manzana in db.query(Manzana).all():
            if wanted_digits and ViviendaService._normalize_digits(manzana.codigo) == wanted_digits:
                return manzana.id
            if wanted_code and ViviendaService._normalize_code(manzana.codigo) == wanted_code:
                return manzana.id

        return None

    @staticmethod
    def _attach_manzana_codigo(vivienda: Vivienda) -> Vivienda:
        if vivienda and vivienda.manzana:
            setattr(vivienda, "manzana_codigo", vivienda.manzana.codigo)
        return vivienda

    @staticmethod
    def _attach_manzana_codigos(db: Session, viviendas: List[Vivienda]) -> List[Vivienda]:
        manzana_ids = {vivienda.manzana_id for vivienda in viviendas if vivienda.manzana_id is not None}
        manzanas = (
            {
                manzana.id: manzana.codigo
                for manzana in db.query(Manzana).filter(Manzana.id.in_(manzana_ids)).all()
            }
            if manzana_ids
            else {}
        )
        for vivienda in viviendas:
            setattr(vivienda, "manzana_codigo", manzanas.get(vivienda.manzana_id, f"MZ {vivienda.manzana_id}"))
        return viviendas

    @staticmethod
    def get_viviendas(db: Session, skip: int = 0, limit: int = 100, manzana_id: Optional[int] = None) -> List[Vivienda]:
        query = db.query(Vivienda)
        if manzana_id:
            resolved_manzana_id = ViviendaService._resolve_manzana_id(db, manzana_id)
            query = query.filter(Vivienda.manzana_id == (resolved_manzana_id or manzana_id))
        viviendas = query.order_by(Vivienda.manzana_id, Vivienda.numero_casa).offset(skip).limit(limit).all()
        return ViviendaService._attach_manzana_codigos(db, viviendas)
    
    @staticmethod
    def get_vivienda(db: Session, vivienda_id: int) -> Optional[Vivienda]:
        vivienda = db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
        if not vivienda:
            return None
        return ViviendaService._attach_manzana_codigos(db, [vivienda])[0]
    
    @staticmethod
    def create_vivienda(db: Session, data: ViviendaCreate) -> Vivienda:
        manzana_id = ViviendaService._resolve_manzana_id(db, data.manzana_id)
        if not manzana_id:
            raise ValueError("La manzana seleccionada no existe")

        db_vivienda = Vivienda(
            numero_casa=data.numero_casa,
            manzana_id=manzana_id,
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
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ValueError("No se pudo guardar la vivienda. Verifique manzana y número de casa") from exc
        db.refresh(db_vivienda)
        return ViviendaService._attach_manzana_codigos(db, [db_vivienda])[0]
    
    @staticmethod
    def update_vivienda(db: Session, vivienda_id: int, data: dict) -> Optional[Vivienda]:
        vivienda = db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
        if not vivienda:
            return None

        if data.get("manzana_id") is not None:
            manzana_id = ViviendaService._resolve_manzana_id(db, data["manzana_id"])
            if not manzana_id:
                raise ValueError("La manzana seleccionada no existe")
            data["manzana_id"] = manzana_id
        
        for key, value in data.items():
            if value is not None:
                setattr(vivienda, key, value)
        
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ValueError("No se pudo actualizar la vivienda. Verifique manzana y número de casa") from exc
        db.refresh(vivienda)
        return ViviendaService._attach_manzana_codigos(db, [vivienda])[0]
    
    @staticmethod
    def delete_vivienda(db: Session, vivienda_id: int) -> bool:
        vivienda = db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
        if not vivienda:
            return False

        lecturas_count = db.query(Lectura).filter(Lectura.vivienda_id == vivienda_id).count()
        facturas = db.query(Factura.id).filter(Factura.vivienda_id == vivienda_id).all()
        factura_ids = [factura.id for factura in facturas]
        facturas_count = len(factura_ids)
        facturacion_count = db.query(FacturacionMensual).filter(
            FacturacionMensual.vivienda_id == vivienda_id
        ).count()

        payment_filters = [Pago.vivienda_id == vivienda_id]
        if factura_ids:
            payment_filters.append(Pago.factura_id.in_(factura_ids))

        pagos_asociados = db.query(Pago).filter(or_(*payment_filters)).count()
        if pagos_asociados:
            raise ValueError(
                "No se puede eliminar la vivienda porque tiene pagos asociados. "
                "Revise o elimine esos pagos primero, o cambie la vivienda a inactiva."
            )

        if lecturas_count > 1 or facturas_count > 1 or facturacion_count > 1:
            raise ValueError(
                "No se puede eliminar la vivienda porque ya tiene historial de varios períodos. "
                "Para conservar los soportes, cambie su estado a inactiva o actualice el propietario "
                "para los próximos cobros."
            )

        try:
            if factura_ids:
                db.query(FacturacionMensual).filter(
                    FacturacionMensual.factura_id.in_(factura_ids)
                ).delete(synchronize_session=False)

            db.query(FacturacionMensual).filter(
                FacturacionMensual.vivienda_id == vivienda_id
            ).delete(synchronize_session=False)
            db.query(Lectura).filter(
                Lectura.vivienda_id == vivienda_id
            ).delete(synchronize_session=False)
            db.query(Factura).filter(
                Factura.vivienda_id == vivienda_id
            ).delete(synchronize_session=False)

            db.delete(vivienda)
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ValueError(
                "No se pudo eliminar la vivienda porque tiene registros relacionados."
            ) from exc

        return True
    
    @staticmethod
    def get_viviendas_by_manzana(db: Session, manzana_id: int) -> List[Vivienda]:
        resolved_manzana_id = ViviendaService._resolve_manzana_id(db, manzana_id)
        viviendas = db.query(Vivienda).filter(Vivienda.manzana_id == (resolved_manzana_id or manzana_id)).order_by(Vivienda.numero_casa).all()
        return ViviendaService._attach_manzana_codigos(db, viviendas)
    
    @staticmethod
    def get_all_viviendas(db: Session, skip: int = 0, limit: int = 100) -> List[Vivienda]:
        viviendas = db.query(Vivienda).order_by(Vivienda.manzana_id, Vivienda.numero_casa).offset(skip).limit(limit).all()
        return ViviendaService._attach_manzana_codigos(db, viviendas)
    
    @staticmethod
    def buscar_por_cedula(db: Session, cedula: str) -> List[Vivienda]:
        viviendas = db.query(Vivienda).filter(Vivienda.cedula == cedula).all()
        return ViviendaService._attach_manzana_codigos(db, viviendas)
