from sqlalchemy.orm import Session
from sqlalchemy import and_, func as sql_func, or_
from sqlalchemy.exc import IntegrityError
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.models.models import Tarifa, Lectura, Factura, Pago, Vivienda, Manzana, EstadoFacturaEnum, FacturacionMensual
from app.services.configuracion_service import ConfiguracionService
from app.schemas.schemas import (
    TarifaCreate, TarifaUpdate, LecturaCreate, FacturaCreate,
    FacturaUpdate, PagoCreate, DashboardResponse, ReporteCarteraResponse,
    PagoImportData, LecturaPlanillaRow, HistoricoImportRow
)
from calendar import monthrange

class EstadoCuentaResponse(BaseModel):
    vivienda_id: int
    numero_casa: str
    propietario: str
    saldo_actual: float
    facturas: List[dict]
    total_facturado: float
    total_pagado: float

class ReporteConsumoResponse(BaseModel):
    ano: int
    mes: int
    manzana_id: Optional[int]
    total_viviendas: int
    total_consumo_kwh: float
    promedio_kwh: float
    costo_total: float

class ReportePagosResponse(BaseModel):
    ano: int
    mes: int
    total_pagado: float
    numero_pagos: int
    metodos_pago: dict

class FacturaService:
    @staticmethod
    def get_minimo_kwh_facturacion(db: Session) -> int:
        valor = ConfiguracionService.get_configuracion_valor(
            db,
            "minimo_kwh_facturacion",
            default=6
        )
        try:
            return int(float(valor))
        except (TypeError, ValueError):
            return 6

    @staticmethod
    def get_consumo_pendiente_sin_factura(db: Session, vivienda_id: int, ano: int, mes: int) -> float:
        lecturas = db.query(Lectura).filter(
            Lectura.vivienda_id == vivienda_id,
            (Lectura.ano < ano) | ((Lectura.ano == ano) & (Lectura.mes <= mes))
        ).order_by(Lectura.ano.asc(), Lectura.mes.asc()).all()

        consumo_pendiente = 0.0
        for lectura in lecturas:
            factura = db.query(Factura.id).filter(
                Factura.vivienda_id == vivienda_id,
                Factura.ano == lectura.ano,
                Factura.mes == lectura.mes
            ).first()
            if factura:
                consumo_pendiente = 0.0
                continue
            consumo_pendiente += lectura.consumo or 0

        return consumo_pendiente

    @staticmethod
    def _get_periodo_cobro_desde_consumo(ano_consumo: int, mes_consumo: int) -> tuple[int, int]:
        if mes_consumo == 12:
            return ano_consumo + 1, 1
        return ano_consumo, mes_consumo + 1

    @staticmethod
    def _get_periodo_consumo_desde_cobro(ano_cobro: int, mes_cobro: int) -> tuple[int, int]:
        if mes_cobro == 1:
            return ano_cobro - 1, 12
        return ano_cobro, mes_cobro - 1

    @staticmethod
    def get_tarifas(db: Session, ano: Optional[int] = None) -> List[Tarifa]:
        query = db.query(Tarifa)
        if ano:
            query = query.filter(Tarifa.ano == ano)
        return query.order_by(Tarifa.ano.desc(), Tarifa.mes.desc()).all()
    
    @staticmethod
    def get_tarifa(db: Session, ano: int, mes: int) -> Optional[Tarifa]:
        return db.query(Tarifa).filter(
            Tarifa.ano == ano, 
            Tarifa.mes == mes
        ).first()

    @staticmethod
    def _parse_float(value: Optional[str], default: float = 0) -> float:
        if value is None:
            return default
        text = str(value).strip().replace(",", ".")
        return float(text) if text else default

    @staticmethod
    def _parse_int(value: Optional[str], default: int = 0) -> int:
        if value is None:
            return default
        text = str(value).strip()
        return int(float(text)) if text else default

    @staticmethod
    def get_tarifa_efectiva(db: Session, ano: int, mes: int) -> Optional[Tarifa]:
        tarifa = FacturaService.get_tarifa(db, ano, mes)
        if tarifa:
            return tarifa

        periodo_mes = str(mes).zfill(2)
        precio_sub = ConfiguracionService.get_configuracion_valor(
            db, "precio_kwh_subsidiado", ano, periodo_mes
        )
        precio_pleno = ConfiguracionService.get_configuracion_valor(
            db, "precio_kwh_sin_subsidio", ano, periodo_mes
        )
        tope_subsidio = ConfiguracionService.get_configuracion_valor(
            db, "limite_subsidio", ano, periodo_mes
        )

        if precio_sub is None or precio_pleno is None or tope_subsidio is None:
            return None

        return Tarifa(
            id=0,
            ano=ano,
            mes=mes,
            costo_kwh_subsidiado=FacturaService._parse_float(precio_sub, 0),
            costo_kwh_pleno=FacturaService._parse_float(precio_pleno, 0),
            consumo_tope_subsidiado=FacturaService._parse_int(tope_subsidio, 0),
            cargo_alumbrado=FacturaService._parse_float(
                ConfiguracionService.get_configuracion_valor(db, "costo_alumbrado", ano, periodo_mes), 0
            ),
            cargo_seguridad=FacturaService._parse_float(
                ConfiguracionService.get_configuracion_valor(db, "costo_seguridad", ano, periodo_mes), 0
            ),
            cargo_toma_lectura=FacturaService._parse_float(
                ConfiguracionService.get_configuracion_valor(db, "costo_toma_lectura", ano, periodo_mes), 0
            ),
            cargo_administracion=FacturaService._parse_float(
                ConfiguracionService.get_configuracion_valor(db, "costo_administracion", ano, periodo_mes), 0
            ),
            fecha_limite_pago=20,
            intereses_mora=0.02
        )
    
    @staticmethod
    def create_tarifa(db: Session, data: TarifaCreate) -> Tarifa:
        existing = db.query(Tarifa).filter(
            Tarifa.ano == data.ano,
            Tarifa.mes == data.mes
        ).first()
        if existing:
            raise ValueError(f"Ya existe tarifa para {data.ano}-{data.mes}")
        
        db_tarifa = Tarifa(**data.model_dump())
        db.add(db_tarifa)
        db.commit()
        db.refresh(db_tarifa)
        return db_tarifa
    
    @staticmethod
    def update_tarifa(db: Session, tarifa_id: int, data: dict) -> Optional[Tarifa]:
        tarifa = db.query(Tarifa).filter(Tarifa.id == tarifa_id).first()
        if not tarifa:
            return None
        
        for key, value in data.items():
            if value is not None:
                setattr(tarifa, key, value)
        
        db.commit()
        db.refresh(tarifa)
        return tarifa
    
    @staticmethod
    def get_lecturas(db: Session, vivienda_id: Optional[int] = None, ano: Optional[int] = None, mes: Optional[int] = None) -> List[Lectura]:
        query = db.query(Lectura)
        if vivienda_id:
            query = query.filter(Lectura.vivienda_id == vivienda_id)
        if ano:
            query = query.filter(Lectura.ano == ano)
        if mes:
            query = query.filter(Lectura.mes == mes)
        return query.order_by(Lectura.ano.desc(), Lectura.mes.desc()).all()
    
    @staticmethod
    def get_ultima_lectura(db: Session, vivienda_id: int) -> Optional[Lectura]:
        return db.query(Lectura).filter(
            Lectura.vivienda_id == vivienda_id
        ).order_by(Lectura.ano.desc(), Lectura.mes.desc()).first()
    
    @staticmethod
    def create_lectura(
        db: Session,
        data: LecturaCreate,
        usuario_id: Optional[int],
        generar_factura: bool = True,
        estado: Optional[str] = None
    ) -> Lectura:
        vivienda = db.query(Vivienda).filter(Vivienda.id == data.vivienda_id).first()
        if not vivienda:
            raise ValueError("Vivienda no encontrada")
        if vivienda.estado != "activo":
            raise ValueError("La vivienda está inactiva")

        lectura_actual_normalizada = float(data.lectura_actual) if data.lectura_actual is not None else None
        lectura_anterior_solicitada = float(data.lectura_anterior) if data.lectura_anterior is not None else None

        if lectura_actual_normalizada is not None and lectura_actual_normalizada < 0:
            raise ValueError("La lectura no puede ser negativa")

        tarifa_efectiva = FacturaService.get_tarifa_efectiva(db, data.ano, data.mes)
        if not tarifa_efectiva:
            raise ValueError(f"No existe configuración de tarifa para {data.ano}-{data.mes:02d}")

        lectura_periodo = db.query(Lectura).filter(
            Lectura.vivienda_id == data.vivienda_id,
            Lectura.ano == data.ano,
            Lectura.mes == data.mes
        ).first()

        lectura_anterior = db.query(Lectura).filter(
            Lectura.vivienda_id == data.vivienda_id,
            (Lectura.ano < data.ano) |
            ((Lectura.ano == data.ano) & (Lectura.mes < data.mes))
        ).order_by(Lectura.ano.desc(), Lectura.mes.desc()).first()
        lectura_anterior_historica = lectura_anterior.lectura_actual if lectura_anterior else 0
        lectura_anterior_valor = (
            lectura_anterior_solicitada
            if lectura_anterior_solicitada is not None
            else lectura_anterior_historica
        )

        if lectura_anterior_valor < 0:
            raise ValueError("La lectura anterior no puede ser negativa")

        if lectura_actual_normalizada is not None and lectura_actual_normalizada < lectura_anterior_valor:
            raise ValueError(
                f"La lectura actual ({lectura_actual_normalizada}) no puede ser menor que la lectura anterior ({lectura_anterior_valor})"
            )

        consumo = lectura_actual_normalizada - lectura_anterior_valor if lectura_actual_normalizada is not None else None
        estado_lectura = estado or data.estado or ("facturada" if generar_factura else "pendiente_revision")

        if lectura_periodo:
            lectura_periodo.lectura_actual = lectura_actual_normalizada
            lectura_periodo.lectura_anterior = lectura_anterior_valor
            lectura_periodo.consumo = consumo
            lectura_periodo.usuario_id = usuario_id or lectura_periodo.usuario_id or 1
            lectura_periodo.sincronizado = data.sincronizado
            lectura_periodo.offline_id = data.offline_id
            lectura_periodo.estado = estado_lectura
            db_lectura = lectura_periodo
        else:
            db_lectura = Lectura(
                vivienda_id=data.vivienda_id,
                usuario_id=usuario_id or 1,
                ano=data.ano,
                mes=data.mes,
                lectura_anterior=lectura_anterior_valor,
                lectura_actual=lectura_actual_normalizada,
                consumo=consumo,
                sincronizado=data.sincronizado,
                offline_id=data.offline_id,
                estado=estado_lectura
            )
            db.add(db_lectura)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise ValueError("Ya existe una lectura para esa vivienda en el período seleccionado")

        db.refresh(db_lectura)
        if generar_factura and lectura_actual_normalizada is not None:
            FacturaService.upsert_factura_desde_lectura(db, db_lectura, usuario_id or 1)
        return db_lectura

    @staticmethod
    def guardar_lectura_borrador(db: Session, data: LecturaCreate, usuario_id: Optional[int]) -> Lectura:
        return FacturaService.create_lectura(
            db,
            data,
            usuario_id,
            generar_factura=False,
            estado="pendiente_revision"
        )

    @staticmethod
    def aprobar_lectura_facturacion(db: Session, data: LecturaCreate, usuario_id: Optional[int]) -> Lectura:
        factura = FacturaService.get_factura_by_periodo(db, data.vivienda_id, data.ano, data.mes)
        if data.lectura_actual is None:
            if factura:
                pagos = db.query(Pago).filter(Pago.factura_id == factura.id).count()
                if pagos > 0:
                    raise ValueError("No se puede limpiar la lectura porque la factura tiene pagos asociados")
                factura.estado = EstadoFacturaEnum.CORREGIDA
                db.query(FacturacionMensual).filter(
                    FacturacionMensual.factura_id == factura.id
                ).delete(synchronize_session=False)
                db.commit()
            return FacturaService.create_lectura(
                db,
                data,
                usuario_id,
                generar_factura=False,
                estado="corregida"
            )

        lectura = FacturaService.create_lectura(
            db,
            data,
            usuario_id,
            generar_factura=True,
            estado="facturada"
        )
        lectura.estado = "facturada"
        db.commit()
        db.refresh(lectura)
        return lectura

    @staticmethod
    def update_lectura(db: Session, lectura_id: int, data: dict, usuario_id: int) -> Optional[Lectura]:
        lectura = db.query(Lectura).filter(Lectura.id == lectura_id).first()
        if not lectura:
            return None

        lectura_actual = data.get("lectura_actual")
        payload = LecturaCreate(
            vivienda_id=lectura.vivienda_id,
            ano=lectura.ano,
            mes=lectura.mes,
            lectura_anterior=data.get("lectura_anterior"),
            lectura_actual=lectura_actual,
            sincronizado=data.get("sincronizado", True),
            offline_id=data.get("offline_id")
        )

        return FacturaService.create_lectura(db, payload, usuario_id)

    @staticmethod
    def delete_lectura(db: Session, lectura_id: int) -> bool:
        lectura = db.query(Lectura).filter(Lectura.id == lectura_id).first()
        if not lectura:
            return False

        factura = FacturaService.get_factura_by_periodo(db, lectura.vivienda_id, lectura.ano, lectura.mes)
        if factura:
            factura.estado = EstadoFacturaEnum.CORREGIDA

        db.delete(lectura)
        db.commit()
        return True

    @staticmethod
    def delete_registro_cobro(db: Session, vivienda_id: int, ano: int, mes: int) -> bool:
        lectura = db.query(Lectura).filter(
            Lectura.vivienda_id == vivienda_id,
            Lectura.ano == ano,
            Lectura.mes == mes
        ).first()
        factura = FacturaService.get_factura_by_periodo(db, vivienda_id, ano, mes)

        if not lectura and not factura:
            return True

        if factura:
            pagos = db.query(Pago).filter(Pago.factura_id == factura.id).count()
            if pagos > 0:
                raise ValueError("No se puede borrar el registro porque tiene pagos asociados")

            db.query(FacturacionMensual).filter(
                FacturacionMensual.factura_id == factura.id
            ).delete(synchronize_session=False)
            db.delete(factura)

        if lectura:
            db.delete(lectura)

        db.commit()
        return True
    
    @staticmethod
    def calcular_factura(vivienda: Vivienda, lectura: Lectura, tarifa: Tarifa, saldo_anterior: float = 0, consumo_override: Optional[float] = None) -> dict:
        consumo = consumo_override if consumo_override is not None else (lectura.consumo or 0)
        kwh_subsidiados = min(consumo, tarifa.consumo_tope_subsidiado)
        kwh_excedente = max(0, consumo - tarifa.consumo_tope_subsidiado)
        
        costo_subsidiado = kwh_subsidiados * tarifa.costo_kwh_subsidiado
        costo_excedente = kwh_excedente * tarifa.costo_kwh_pleno
        subtotal_energia = costo_subsidiado + costo_excedente
        
        cargo_alumbrado = tarifa.cargo_alumbrado if vivienda.tiene_alumbrado else 0
        cargo_seguridad = tarifa.cargo_seguridad if vivienda.tiene_seguridad else 0
        cargo_toma_lectura = tarifa.cargo_toma_lectura if vivienda.tiene_toma_lectura else 0
        cargo_administracion = tarifa.cargo_administracion if vivienda.tiene_administracion else 0
        
        cargos = cargo_alumbrado + cargo_seguridad + cargo_toma_lectura + cargo_administracion
        subtotal = subtotal_energia + cargos
        total = subtotal + saldo_anterior
        
        return {
            "lectura_anterior": lectura.lectura_anterior,
            "lectura_actual": lectura.lectura_actual,
            "consumo": consumo,
            "kwh_subsidiados": kwh_subsidiados,
            "kwh_excedente": kwh_excedente,
            "costo_subsidiado": costo_subsidiado,
            "costo_excedente": costo_excedente,
            "subtotal_energia": subtotal_energia,
            "cargo_alumbrado": cargo_alumbrado,
            "cargo_seguridad": cargo_seguridad,
            "cargo_toma_lectura": cargo_toma_lectura,
            "cargo_administracion": cargo_administracion,
            "subtotal": subtotal,
            "saldo_anterior": saldo_anterior,
            "total": total
        }

    @staticmethod
    def upsert_factura_desde_lectura(db: Session, lectura: Lectura, usuario_id: int) -> Optional[Factura]:
        vivienda = db.query(Vivienda).filter(Vivienda.id == lectura.vivienda_id).first()
        if not vivienda:
            raise ValueError("Vivienda no encontrada para generar factura")

        tarifa = FacturaService.get_tarifa_efectiva(db, lectura.ano, lectura.mes)
        if not tarifa:
            raise ValueError(f"No existe tarifa/configuración para {lectura.ano}-{lectura.mes:02d}")

        saldo_anterior = FacturaService._get_saldo_anterior(db, vivienda.id, lectura.ano, lectura.mes)
        numero_factura = f"PP-{lectura.ano}{lectura.mes:02d}-{vivienda.id:04d}"
        existente = FacturaService.get_factura_by_periodo(db, vivienda.id, lectura.ano, lectura.mes)

        consumo_para_facturar = None
        if not existente:
            consumo_acumulado = FacturaService.get_consumo_pendiente_sin_factura(
                db,
                vivienda.id,
                lectura.ano,
                lectura.mes
            )
            minimo_kwh = FacturaService.get_minimo_kwh_facturacion(db)
            if consumo_acumulado < minimo_kwh:
                return None
            consumo_para_facturar = consumo_acumulado

        calculo = FacturaService.calcular_factura(
            vivienda,
            lectura,
            tarifa,
            saldo_anterior,
            consumo_override=consumo_para_facturar
        )

        if existente:
            existente.tarifa_id = tarifa.id if getattr(tarifa, "id", 0) else existente.tarifa_id
            existente.usuario_creador_id = usuario_id
            existente.numero_factura = numero_factura
            existente.lectura_anterior = calculo["lectura_anterior"]
            existente.lectura_actual = calculo["lectura_actual"]
            existente.consumo = calculo["consumo"]
            existente.kwh_subsidiados = calculo["kwh_subsidiados"]
            existente.kwh_excedente = calculo["kwh_excedente"]
            existente.costo_subsidiado = calculo["costo_subsidiado"]
            existente.costo_excedente = calculo["costo_excedente"]
            existente.subtotal_energia = calculo["subtotal_energia"]
            existente.cargo_alumbrado = calculo["cargo_alumbrado"]
            existente.cargo_seguridad = calculo["cargo_seguridad"]
            existente.cargo_toma_lectura = calculo["cargo_toma_lectura"]
            existente.cargo_administracion = calculo["cargo_administracion"]
            existente.subtotal = calculo["subtotal"]
            existente.saldo_anterior = calculo["saldo_anterior"]
            existente.total = calculo["total"]
            if existente.estado in [EstadoFacturaEnum.ANULADA, EstadoFacturaEnum.CORREGIDA]:
                existente.estado = EstadoFacturaEnum.PENDIENTE
            db.commit()
            db.refresh(existente)
            FacturaService.upsert_facturacion_mensual(db, existente)
            return existente

        factura = Factura(
            numero_factura=numero_factura,
            vivienda_id=vivienda.id,
            tarifa_id=tarifa.id if getattr(tarifa, "id", 0) else None,
            usuario_creador_id=usuario_id,
            ano=lectura.ano,
            mes=lectura.mes,
            lectura_anterior=calculo["lectura_anterior"],
            lectura_actual=calculo["lectura_actual"],
            consumo=calculo["consumo"],
            kwh_subsidiados=calculo["kwh_subsidiados"],
            kwh_excedente=calculo["kwh_excedente"],
            costo_subsidiado=calculo["costo_subsidiado"],
            costo_excedente=calculo["costo_excedente"],
            subtotal_energia=calculo["subtotal_energia"],
            cargo_alumbrado=calculo["cargo_alumbrado"],
            cargo_seguridad=calculo["cargo_seguridad"],
            cargo_toma_lectura=calculo["cargo_toma_lectura"],
            cargo_administracion=calculo["cargo_administracion"],
            subtotal=calculo["subtotal"],
            saldo_anterior=calculo["saldo_anterior"],
            total=calculo["total"],
            estado=EstadoFacturaEnum.PENDIENTE
        )

        db.add(factura)
        db.commit()
        db.refresh(factura)
        FacturaService.upsert_facturacion_mensual(db, factura)
        return factura

    @staticmethod
    def upsert_facturacion_mensual(db: Session, factura: Factura) -> FacturacionMensual:
        vivienda = db.query(Vivienda).filter(Vivienda.id == factura.vivienda_id).first()
        if not vivienda:
            raise ValueError("Vivienda no encontrada para facturación mensual")

        ano_cobro, mes_cobro = FacturaService._get_periodo_cobro_desde_consumo(factura.ano, factura.mes)
        casa = f"MZ {vivienda.manzana_id} C{vivienda.numero_casa}"
        pago = factura.total_pagado or 0
        total = factura.total or 0
        saldo = total - pago

        data = {
            "vivienda_id": vivienda.id,
            "ano_cobro": ano_cobro,
            "mes_cobro": mes_cobro,
            "ano_consumo": factura.ano,
            "mes_consumo": factura.mes,
            "casa": casa,
            "nombre": vivienda.propietario,
            "cedula": vivienda.cedula,
            "lectura_anterior": factura.lectura_anterior or 0,
            "lectura_actual": factura.lectura_actual or 0,
            "consumo_kwh": factura.consumo or 0,
            "consumo_subsidio": factura.kwh_subsidiados or 0,
            "consumo_sin_subsidio": factura.kwh_excedente or 0,
            "valor_subsidio": factura.costo_subsidiado or 0,
            "valor_sin_subsidio": factura.costo_excedente or 0,
            "toma_lectura": factura.cargo_toma_lectura or 0,
            "alumbrado": factura.cargo_alumbrado or 0,
            "seguridad": factura.cargo_seguridad or 0,
            "administracion": factura.cargo_administracion or 0,
            "subtotal": factura.subtotal or 0,
            "descuento_porcentaje": 0,
            "valor_descuento": 0,
            "total_a_pagar": total,
            "pago": pago,
            "saldo": saldo,
            "estado": factura.estado.value if hasattr(factura.estado, "value") else str(factura.estado),
        }

        existente = db.query(FacturacionMensual).filter(FacturacionMensual.factura_id == factura.id).first()
        if existente:
            for key, value in data.items():
                if key in {"casa", "nombre", "cedula"}:
                    continue
                setattr(existente, key, value)
            db.commit()
            db.refresh(existente)
            return existente

        registro = FacturacionMensual(factura_id=factura.id, **data)
        db.add(registro)
        db.commit()
        db.refresh(registro)
        return registro

    @staticmethod
    def get_planilla_lecturas(db: Session, ano: int, mes: int) -> List[LecturaPlanillaRow]:
        viviendas = db.query(Vivienda).order_by(Vivienda.manzana_id, Vivienda.numero_casa).all()
        tarifa = FacturaService.get_tarifa_efectiva(db, ano, mes)
        if not tarifa:
            raise ValueError(f"No existe configuración de tarifa para {ano}-{mes:02d}")

        vivienda_ids = [vivienda.id for vivienda in viviendas]
        lecturas_periodo = {}
        lecturas_anteriores = {}
        facturas_periodo = {}

        if vivienda_ids:
            lecturas_periodo = {
                lectura.vivienda_id: lectura
                for lectura in db.query(Lectura).filter(
                    Lectura.vivienda_id.in_(vivienda_ids),
                    Lectura.ano == ano,
                    Lectura.mes == mes
                ).all()
            }

            for lectura in db.query(Lectura).filter(
                Lectura.vivienda_id.in_(vivienda_ids),
                (Lectura.ano < ano) | ((Lectura.ano == ano) & (Lectura.mes < mes))
            ).order_by(Lectura.vivienda_id, Lectura.ano.desc(), Lectura.mes.desc()).all():
                if lectura.vivienda_id not in lecturas_anteriores:
                    lecturas_anteriores[lectura.vivienda_id] = lectura

            facturas_periodo = {
                factura.vivienda_id: factura
                for factura in db.query(Factura).filter(
                    Factura.vivienda_id.in_(vivienda_ids),
                    Factura.ano == ano,
                    Factura.mes == mes
                ).all()
            }

        rows: List[LecturaPlanillaRow] = []
        for vivienda in viviendas:
            lectura = lecturas_periodo.get(vivienda.id)
            lectura_anterior = lecturas_anteriores.get(vivienda.id)
            lectura_anterior_valor = (
                lectura.lectura_anterior
                if lectura and lectura.lectura_anterior is not None
                else lectura_anterior.lectura_actual if lectura_anterior else 0
            )

            lectura_actual = lectura.lectura_actual if lectura else None
            consumo = 0
            if lectura_actual is not None and lectura_actual >= lectura_anterior_valor:
                consumo = lectura_actual - lectura_anterior_valor

            if lectura_actual is None:
                consumo_subsidiado = 0
                consumo_sin_subsidio = 0
                precio_subsidiado = 0
                precio_sin_subsidio = 0
                cargo_toma_lectura = 0
                cargo_alumbrado = 0
                cargo_seguridad = 0
                cargo_administracion = 0
                cobros_fijos = 0
                total_factura = 0
            else:
                consumo_subsidiado = min(consumo, tarifa.consumo_tope_subsidiado)
                consumo_sin_subsidio = max(0, consumo - tarifa.consumo_tope_subsidiado)
                precio_subsidiado = consumo_subsidiado * tarifa.costo_kwh_subsidiado
                precio_sin_subsidio = consumo_sin_subsidio * tarifa.costo_kwh_pleno
                cargo_toma_lectura = tarifa.cargo_toma_lectura if vivienda.tiene_toma_lectura else 0
                cargo_alumbrado = tarifa.cargo_alumbrado if vivienda.tiene_alumbrado else 0
                cargo_seguridad = tarifa.cargo_seguridad if vivienda.tiene_seguridad else 0
                cargo_administracion = tarifa.cargo_administracion if vivienda.tiene_administracion else 0
                cobros_fijos = cargo_toma_lectura + cargo_alumbrado + cargo_seguridad + cargo_administracion
                total_factura = precio_subsidiado + precio_sin_subsidio + cobros_fijos

            factura = facturas_periodo.get(vivienda.id)
            if lectura_actual is not None and not factura:
                consumo_acumulado = FacturaService.get_consumo_pendiente_sin_factura(db, vivienda.id, ano, mes)
                if consumo_acumulado < FacturaService.get_minimo_kwh_facturacion(db):
                    precio_subsidiado = 0
                    precio_sin_subsidio = 0
                    cargo_toma_lectura = 0
                    cargo_alumbrado = 0
                    cargo_seguridad = 0
                    cargo_administracion = 0
                    cobros_fijos = 0
                    total_factura = 0

            is_activa = vivienda.estado == "activo"
            rows.append(
                LecturaPlanillaRow(
                    vivienda_id=vivienda.id,
                    numero_casa=vivienda.numero_casa,
                    manzana_id=vivienda.manzana_id,
                    manzana_codigo=vivienda.manzana.codigo if vivienda.manzana else f"MZ {vivienda.manzana_id}",
                    propietario=vivienda.propietario,
                    cedula=vivienda.cedula,
                    telefono=vivienda.telefono or vivienda.whatsapp,
                    estado_vivienda=vivienda.estado,
                    lectura_id=lectura.id if lectura else None,
                    lectura_anterior=lectura_anterior_valor,
                    lectura_actual=lectura_actual,
                    consumo_kwh=consumo,
                    consumo_subsidiado=consumo_subsidiado,
                    consumo_sin_subsidio=consumo_sin_subsidio,
                    precio_subsidiado=round(precio_subsidiado, 2),
                    precio_sin_subsidio=round(precio_sin_subsidio, 2),
                    cargo_toma_lectura=round(cargo_toma_lectura, 2),
                    cargo_alumbrado=round(cargo_alumbrado, 2),
                    cargo_seguridad=round(cargo_seguridad, 2),
                    cargo_administracion=round(cargo_administracion, 2),
                    cobros_fijos=round(cobros_fijos, 2),
                    limite_subsidio=tarifa.consumo_tope_subsidiado,
                    tarifa_subsidiada=round(tarifa.costo_kwh_subsidiado, 4),
                    tarifa_plena=round(tarifa.costo_kwh_pleno, 4),
                    total_factura=round(total_factura, 2),
                    factura_id=factura.id if factura else None,
                    factura_estado=factura.estado if factura else None,
                    lectura_estado=lectura.estado if lectura and lectura.estado else "borrador",
                    requiere_lectura=is_activa and (lectura is None)
                )
            )

        return rows
    
    @staticmethod
    def get_facturas(
        db: Session,
        vivienda_id: Optional[int] = None,
        ano: Optional[int] = None,
        mes: Optional[int] = None,
        estado: Optional[str] = None,
        ano_cobro: Optional[int] = None,
        mes_cobro: Optional[int] = None,
    ) -> List[Factura]:
        query = db.query(Factura)
        if vivienda_id:
            query = query.filter(Factura.vivienda_id == vivienda_id)
        if ano:
            query = query.filter(Factura.ano == ano)
        if mes:
            query = query.filter(Factura.mes == mes)
        if ano_cobro is not None or mes_cobro is not None:
            if ano_cobro is not None and mes_cobro is not None:
                ano_consumo, mes_consumo = FacturaService._get_periodo_consumo_desde_cobro(ano_cobro, mes_cobro)
                query = query.filter(Factura.ano == ano_consumo, Factura.mes == mes_consumo)
            elif ano_cobro is not None:
                query = query.filter(
                    or_(
                        and_(Factura.ano == ano_cobro, Factura.mes < 12),
                        and_(Factura.ano == ano_cobro - 1, Factura.mes == 12),
                    )
                )
            elif mes_cobro is not None:
                mes_consumo = 12 if mes_cobro == 1 else mes_cobro - 1
                query = query.filter(Factura.mes == mes_consumo)
        if estado:
            query = query.filter(Factura.estado == estado)
        return query.order_by(Factura.ano.desc(), Factura.mes.desc()).all()
    
    @staticmethod
    def get_factura(db: Session, factura_id: int) -> Optional[Factura]:
        return db.query(Factura).filter(Factura.id == factura_id).first()
    
    @staticmethod
    def get_factura_by_periodo(db: Session, vivienda_id: int, ano: int, mes: int) -> Optional[Factura]:
        return db.query(Factura).filter(
            Factura.vivienda_id == vivienda_id,
            Factura.ano == ano,
            Factura.mes == mes
        ).first()
    
    @staticmethod
    def create_factura(db: Session, data: FacturaCreate, usuario_id: int) -> Factura:
        existente = FacturaService.get_factura_by_periodo(db, data.vivienda_id, data.ano, data.mes)
        if existente:
            raise ValueError(f"Ya existe factura para {data.vivienda_id} en {data.ano}-{data.mes}")
        
        vivienda = db.query(Vivienda).filter(Vivienda.id == data.vivienda_id).first()
        if not vivienda:
            raise ValueError("Vivienda no encontrada")
        
        tarifa = FacturaService.get_tarifa_efectiva(db, data.ano, data.mes)
        if not tarifa:
            raise ValueError(f"No existe tarifa para {data.ano}-{data.mes}")
        
        lectura = db.query(Lectura).filter(
            Lectura.vivienda_id == data.vivienda_id,
            Lectura.ano == data.ano,
            Lectura.mes == data.mes
        ).first()
        
        if not lectura and not data.es_manual:
            raise ValueError("No hay lectura registrada para este período")
        
        saldo_anterior = FacturaService._get_saldo_anterior(db, data.vivienda_id, data.ano, data.mes)
        
        if lectura:
            calculo = FacturaService.calcular_factura(vivienda, lectura, tarifa, saldo_anterior)
        else:
            calculo = {
                "lectura_anterior": data.lectura_anterior,
                "lectura_actual": data.lectura_actual,
                "consumo": (data.lectura_actual or 0) - (data.lectura_anterior or 0),
                "kwh_subsidiados": 0, "kwh_excedente": 0,
                "costo_subsidiado": 0, "costo_excedente": 0,
                "subtotal_energia": 0,
                "cargo_alumbrado": tarifa.cargo_alumbrado if vivienda.tiene_alumbrado else 0,
                "cargo_seguridad": tarifa.cargo_seguridad if vivienda.tiene_seguridad else 0,
                "cargo_toma_lectura": tarifa.cargo_toma_lectura if vivienda.tiene_toma_lectura else 0,
                "cargo_administracion": tarifa.cargo_administracion if vivienda.tiene_administracion else 0,
                "subtotal": 0, "saldo_anterior": saldo_anterior, "total": saldo_anterior
            }
        
        numero_factura = f"PP-{data.ano}{data.mes:02d}-{data.vivienda_id:04d}"
        
        db_factura = Factura(
            numero_factura=numero_factura,
            vivienda_id=data.vivienda_id,
            tarifa_id=tarifa.id if getattr(tarifa, "id", 0) else None,
            usuario_creador_id=usuario_id,
            ano=data.ano,
            mes=data.mes,
            lectura_anterior=calculo["lectura_anterior"],
            lectura_actual=calculo["lectura_actual"],
            consumo=calculo["consumo"],
            kwh_subsidiados=calculo["kwh_subsidiados"],
            kwh_excedente=calculo["kwh_excedente"],
            costo_subsidiado=calculo["costo_subsidiado"],
            costo_excedente=calculo["costo_excedente"],
            subtotal_energia=calculo["subtotal_energia"],
            cargo_alumbrado=calculo["cargo_alumbrado"],
            cargo_seguridad=calculo["cargo_seguridad"],
            cargo_toma_lectura=calculo["cargo_toma_lectura"],
            cargo_administracion=calculo["cargo_administracion"],
            subtotal=calculo["subtotal"],
            saldo_anterior=calculo["saldo_anterior"],
            total=calculo["total"],
            observaciones=data.observaciones,
            es_manual=data.es_manual,
            estado=EstadoFacturaEnum.PENDIENTE
        )
        
        db.add(db_factura)
        db.commit()
        db.refresh(db_factura)
        FacturaService.upsert_facturacion_mensual(db, db_factura)
        
        if saldo_anterior > 0:
            vivienda.saldo_a_favor = 0
            db.commit()
        
        return db_factura
    
    @staticmethod
    def _get_saldo_anterior(db: Session, vivienda_id: int, ano: int, mes: int) -> float:
        facturas = db.query(Factura).filter(
            Factura.vivienda_id == vivienda_id,
            (Factura.ano < ano) | ((Factura.ano == ano) & (Factura.mes < mes)),
            Factura.estado != EstadoFacturaEnum.PAGADA
        ).all()
        
        saldo = 0
        for f in facturas:
            saldo += (f.total or 0) - (f.total_pagado or 0)
        
        return max(0, saldo)
    
    @staticmethod
    def generar_facturas_masivo(db: Session, ano: int, mes: int, usuario_id: int) -> List[Factura]:
        tarifa = FacturaService.get_tarifa_efectiva(db, ano, mes)
        if not tarifa:
            raise ValueError(f"No existe tarifa para {ano}-{mes}")
        
        viviendas = db.query(Vivienda).filter(Vivienda.estado == "activo").all()
        facturas_creadas = []
        
        for vivienda in viviendas:
            existente = FacturaService.get_factura_by_periodo(db, vivienda.id, ano, mes)
            if existente:
                continue
            
            lectura = db.query(Lectura).filter(
                Lectura.vivienda_id == vivienda.id,
                Lectura.ano == ano,
                Lectura.mes == mes
            ).first()
            
            if not lectura:
                continue
            
            saldo_anterior = FacturaService._get_saldo_anterior(db, vivienda.id, ano, mes)
            calculo = FacturaService.calcular_factura(vivienda, lectura, tarifa, saldo_anterior)
            
            numero_factura = f"PP-{ano}{mes:02d}-{vivienda.id:04d}"
            
            db_factura = Factura(
                numero_factura=numero_factura,
                vivienda_id=vivienda.id,
                tarifa_id=tarifa.id if getattr(tarifa, "id", 0) else None,
                usuario_creador_id=usuario_id,
                ano=ano,
                mes=mes,
                lectura_anterior=calculo["lectura_anterior"],
                lectura_actual=calculo["lectura_actual"],
                consumo=calculo["consumo"],
                kwh_subsidiados=calculo["kwh_subsidiados"],
                kwh_excedente=calculo["kwh_excedente"],
                costo_subsidiado=calculo["costo_subsidiado"],
                costo_excedente=calculo["costo_excedente"],
                subtotal_energia=calculo["subtotal_energia"],
                cargo_alumbrado=calculo["cargo_alumbrado"],
                cargo_seguridad=calculo["cargo_seguridad"],
                cargo_toma_lectura=calculo["cargo_toma_lectura"],
                cargo_administracion=calculo["cargo_administracion"],
                subtotal=calculo["subtotal"],
                saldo_anterior=calculo["saldo_anterior"],
                total=calculo["total"],
                estado=EstadoFacturaEnum.PENDIENTE
            )
            db.add(db_factura)
            facturas_creadas.append(db_factura)
        
        db.commit()
        for f in facturas_creadas:
            db.refresh(f)
            FacturaService.upsert_facturacion_mensual(db, f)
        
        return facturas_creadas
    
    @staticmethod
    def update_factura(db: Session, factura_id: int, data: dict) -> Optional[Factura]:
        factura = db.query(Factura).filter(Factura.id == factura_id).first()
        if not factura:
            return None
        
        for key, value in data.items():
            if value is not None:
                setattr(factura, key, value)
        
        if data.get("estado"):
            if data["estado"] == EstadoFacturaEnum.PAGADA:
                factura.total_pagado = factura.total
        
        db.commit()
        db.refresh(factura)
        FacturaService.upsert_facturacion_mensual(db, factura)
        return factura
    
    @staticmethod
    def registrar_pago(db: Session, factura_id: int, data: PagoCreate, usuario_id: int) -> Pago:
        factura = db.query(Factura).filter(Factura.id == factura_id).first()
        if not factura:
            raise ValueError("Factura no encontrada")

        saldo_actual = max((factura.total or 0) - (factura.total_pagado or 0), 0)
        tipo_pago = data.tipo_pago or ("pago_total" if data.monto >= saldo_actual else "abono")
        referencia = data.referencia or FacturaService._generar_referencia_pago(factura, data.fecha_pago)
        
        db_pago = Pago(
            factura_id=factura_id,
            vivienda_id=factura.vivienda_id,
            usuario_registra_id=usuario_id,
            monto=data.monto,
            concepto=data.concepto,
            metodo_pago=data.metodo_pago,
            fecha_pago=data.fecha_pago,
            referencia=referencia,
            tipo_pago=tipo_pago,
            periodo_ano=factura.ano,
            periodo_mes=factura.mes,
        )
        db.add(db_pago)
        
        factura.total_pagado = (factura.total_pagado or 0) + data.monto
        
        if factura.total_pagado >= factura.total:
            factura.estado = EstadoFacturaEnum.PAGADA
            vivienda = db.query(Vivienda).filter(Vivienda.id == factura.vivienda_id).first()
            if vivienda:
                excedente = factura.total_pagado - factura.total
                vivienda.saldo_a_favor = max(0, excedente)
        elif factura.total_pagado > 0:
            factura.estado = EstadoFacturaEnum.PARCIAL
        
        db.commit()
        db.refresh(db_pago)
        db.refresh(factura)
        FacturaService.upsert_facturacion_mensual(db, factura)
        return db_pago

    @staticmethod
    def _generar_referencia_pago(factura: Factura, fecha_pago: datetime, prefijo: str = "REC") -> str:
        numero = factura.numero_factura or f"FAC-{factura.id}"
        numero = "".join(ch for ch in str(numero) if ch.isalnum() or ch in ("-", "_"))
        return f"{prefijo}-{numero}-{fecha_pago.strftime('%Y%m%d%H%M%S')}"
    
    @staticmethod
    def get_dashboard(db: Session) -> DashboardResponse:
        from app.models.models import Manzana
        
        total_viviendas = db.query(Vivienda).filter(Vivienda.estado == "activo").count()
        viviendas_activas = total_viviendas
        
        now = datetime.now()
        ano_actual = now.year
        mes_actual = now.month
        
        facturas_mes = db.query(Factura).filter(
            Factura.ano == ano_actual,
            Factura.mes == mes_actual
        ).all()
        
        facturas_mes_actual = len(facturas_mes)
        facturas_pendientes = len([f for f in facturas_mes if f.estado == EstadoFacturaEnum.PENDIENTE])
        facturas_pagadas = len([f for f in facturas_mes if f.estado == EstadoFacturaEnum.PAGADA])
        
        total_recaudo = sum(f.total_pagado or 0 for f in facturas_mes if f.estado == EstadoFacturaEnum.PAGADA)
        total_pendiente = sum((f.total or 0) - (f.total_pagado or 0) for f in facturas_mes if f.estado != EstadoFacturaEnum.PAGADA)
        
        consumo_total = sum(f.consumo or 0 for f in facturas_mes)
        promedio = consumo_total / facturas_mes_actual if facturas_mes_actual > 0 else 0
        
        return DashboardResponse(
            total_viviendas=total_viviendas,
            viviendas_activas=viviendas_activas,
            facturas_mes_actual=facturas_mes_actual,
            facturas_pendientes=facturas_pendientes,
            facturas_pagadas=facturas_pagadas,
            total_recaudo=round(total_recaudo, 2),
            total_pendiente=round(total_pendiente, 2),
            consumo_total_kwh=consumo_total,
            promedio_consumo_kwh=round(promedio, 2)
        )
    
    @staticmethod
    def get_reporte_cartera(db: Session, ano: Optional[int] = None) -> List[ReporteCarteraResponse]:
        query = db.query(Factura)
        if ano:
            query = query.filter(Factura.ano == ano)
        
        facturas = query.all()
        
        reporte_dict = {}
        for f in facturas:
            key = (f.ano, f.mes)
            if key not in reporte_dict:
                reporte_dict[key] = {
                    "total_facturado": 0, "total_pagado": 0, "pendiente": 0,
                    "numero_facturas": 0, "pendientes": 0, "pagadas": 0
                }
            reporte_dict[key]["total_facturado"] += f.total or 0
            reporte_dict[key]["total_pagado"] += f.total_pagado or 0
            reporte_dict[key]["pendiente"] += (f.total or 0) - (f.total_pagado or 0)
            reporte_dict[key]["numero_facturas"] += 1
            if f.estado == EstadoFacturaEnum.PAGADA:
                reporte_dict[key]["pagadas"] += 1
            else:
                reporte_dict[key]["pendientes"] += 1
        
        return [
            ReporteCarteraResponse(
                ano=k[0], mes=k[1],
                total_facturado=round(v["total_facturado"], 2),
                total_pagado=round(v["total_pagado"], 2),
                total_pendiente=round(v["pendiente"], 2),
                numero_facturas=v["numero_facturas"],
                facturas_pendientes=v["pendientes"],
                facturas_pagadas=v["pagadas"]
            )
            for k, v in sorted(reporte_dict.items(), reverse=True)
        ]
    
    @staticmethod
    def get_estado_cuenta(db: Session, vivienda_id: int) -> Optional[EstadoCuentaResponse]:
        vivienda = db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
        if not vivienda:
            return None
        
        facturas = db.query(Factura).filter(
            Factura.vivienda_id == vivienda_id
        ).order_by(Factura.ano.desc(), Factura.mes.desc()).all()
        
        facturas_data = []
        total_facturado = 0
        total_pagado = 0
        
        for f in facturas:
            pendiente = (f.total or 0) - (f.total_pagado or 0)
            total_facturado += f.total or 0
            total_pagado += f.total_pagado or 0
            
            pagos = db.query(Pago).filter(Pago.factura_id == f.id).all()
            pagos_list = [
                {
                    "id": p.id,
                    "monto": p.monto,
                    "fecha_pago": p.fecha_pago.isoformat() if p.fecha_pago else None,
                    "metodo_pago": p.metodo_pago,
                    "referencia": p.referencia
                }
                for p in pagos
            ]
            
            facturas_data.append({
                "id": f.id,
                "numero_factura": f.numero_factura,
                "ano": f.ano,
                "mes": f.mes,
                "consumo": f.consumo,
                "total": f.total,
                "total_pagado": f.total_pagado,
                "pendiente": pendiente,
                "estado": f.estado.value,
                "fecha_emision": f.fecha_emision.isoformat() if f.fecha_emision else None,
                "pagos": pagos_list
            })
        
        saldo_actual = sum(f["pendiente"] for f in facturas_data)
        
        return EstadoCuentaResponse(
            vivienda_id=vivienda.id,
            numero_casa=vivienda.numero_casa,
            propietario=vivienda.propietario,
            saldo_actual=round(saldo_actual, 2),
            facturas=facturas_data,
            total_facturado=round(total_facturado, 2),
            total_pagado=round(total_pagado, 2)
        )
    
    @staticmethod
    def get_reporte_consumo(db: Session, ano: int, mes: int, manzana_id: Optional[int] = None) -> ReporteConsumoResponse:
        query = db.query(Factura).filter(Factura.ano == ano, Factura.mes == mes)
        
        if manzana_id:
            query = query.join(Vivienda).filter(Vivienda.manzana_id == manzana_id)
        
        facturas = query.all()
        
        total_viviendas = len(facturas)
        total_consumo = sum(f.consumo or 0 for f in facturas)
        promedio = total_consumo / total_viviendas if total_viviendas > 0 else 0
        costo_total = sum(f.subtotal_energia or 0 for f in facturas)
        
        return ReporteConsumoResponse(
            ano=ano,
            mes=mes,
            manzana_id=manzana_id,
            total_viviendas=total_viviendas,
            total_consumo_kwh=total_consumo,
            promedio_kwh=round(promedio, 2),
            costo_total=round(costo_total, 2)
        )
    
    @staticmethod
    def get_reporte_pagos(db: Session, ano: int, mes: int) -> ReportePagosResponse:
        pagos = db.query(Pago).join(Factura).filter(
            Factura.ano == ano,
            Factura.mes == mes
        ).all()
        
        total_pagado = sum(p.monto for p in pagos)
        
        metodos = {}
        for p in pagos:
            metodo = p.metodo_pago or "No especificado"
            metodos[metodo] = metodos.get(metodo, 0) + 1
        
        return ReportePagosResponse(
            ano=ano,
            mes=mes,
            total_pagado=round(total_pagado, 2),
            numero_pagos=len(pagos),
            metodos_pago=metodos
        )
    
    @staticmethod
    def importar_pagos(db: Session, data: list[PagoImportData], usuario_id: int) -> dict:
        results = {
            "success": 0,
            "success_list": [],
            "errors": []
        }
        
        for item in data:
            try:
                cliente_limpio = str(item.cliente).strip().replace(' ', '')
                
                vivienda = None
                vivienda_id = None
                propietario_info = f"Cédula: {item.cliente}"
                
                todas_viviendas = db.query(Vivienda).all()
                for v in todas_viviendas:
                    if v.cedula and v.cedula.strip().replace(' ', '') == cliente_limpio:
                        vivienda = v
                        vivienda_id = v.id
                        propietario_info = f"{v.propietario} - MZ {v.manzana_id} Casa {v.numero_casa}"
                        break
                
                factura = None
                if vivienda_id:
                    factura = db.query(Factura).filter(
                        Factura.vivienda_id == vivienda_id,
                        Factura.ano == item.ano,
                        Factura.mes == item.mes
                    ).first()
                
                factura_id = factura.id if factura else None
                
                existing_pago = None
                if item.pin:
                    existing_pago = db.query(Pago).filter(
                        Pago.referencia == str(item.pin),
                        Pago.monto == item.abono
                    ).first()
                
                if existing_pago:
                    results["errors"].append(f"⏩ {propietario_info}: Pago duplicado (Ref: {item.pin})")
                    continue
                
                db_pago = Pago(
                    factura_id=factura_id,
                    vivienda_id=vivienda_id,
                    usuario_registra_id=usuario_id,
                    monto=item.abono,
                    concepto=f"Ref: {item.pin or 'N/A'} | Cuenta: {item.cuenta or 'N/A'}",
                    metodo_pago="importado",
                    fecha_pago=item.fecha_recaudo,
                    referencia=str(item.pin) if item.pin else (
                        FacturaService._generar_referencia_pago(factura, item.fecha_recaudo, "IMP")
                        if factura else f"IMP-{cliente_limpio}-{item.fecha_recaudo.strftime('%Y%m%d%H%M%S')}"
                    ),
                    tipo_pago="abono",
                    periodo_ano=item.ano,
                    periodo_mes=item.mes,
                )
                db.add(db_pago)
                
                if factura:
                    factura.total_pagado = (factura.total_pagado or 0) + item.abono
                    if factura.total_pagado >= factura.total:
                        factura.estado = "pagada"
                    elif factura.total_pagado > 0:
                        factura.estado = "parcial"
                
                db.commit()
                if factura:
                    FacturaService.upsert_facturacion_mensual(db, factura)
                
                results["success"] += 1
                estado = "✓" if factura else "⚠️"
                results["success_list"].append(
                    f"{estado} {propietario_info} - {item.abono:.2f} - {item.mes}/{item.ano}"
                )
                
            except Exception as e:
                results["errors"].append(f"Error: {item.cliente} - {str(e)}")
                db.rollback()

        return results

    @staticmethod
    def importar_historico(db: Session, rows: list, usuario_id: int) -> dict:
        from app.models.models import Tarifa
        from app.schemas.schemas import HistoricoImportDiferencia

        results = {
            "procesados": 0,
            "facturas_creadas": [],
            "tarifas_creadas": [],
            "advertencias_tarifa_existente": [],
            "diferencias_valor": [],
            "errores": [],
        }

        ordenadas = sorted(rows, key=lambda r: (r.ano, r.mes_consumo))

        for row in ordenadas:
            ctx = f"{row.cedula} {row.ano}-{row.mes_consumo:02d}"
            try:
                if row.mes_consumo < 1 or row.mes_consumo > 12:
                    results["errores"].append(f"{ctx}: mes_consumo fuera de rango")
                    continue

                cedula_limpia = str(row.cedula).strip().replace(" ", "")
                vivienda = None
                for v in db.query(Vivienda).all():
                    if v.cedula and v.cedula.strip().replace(" ", "") == cedula_limpia:
                        vivienda = v
                        break
                if not vivienda:
                    results["errores"].append(f"{ctx}: no se encontró vivienda con esa cédula")
                    continue

                tarifa_existente = FacturaService.get_tarifa(db, row.ano, row.mes_consumo)
                if tarifa_existente:
                    distinta = (
                        abs((tarifa_existente.costo_kwh_subsidiado or 0) - row.precio_kwh_subsidiado) > 0.01
                        or abs((tarifa_existente.costo_kwh_pleno or 0) - row.precio_kwh_no_subsidiado) > 0.01
                        or (tarifa_existente.consumo_tope_subsidiado or 0) != (row.limite_subsidio or 184)
                        or abs((tarifa_existente.cargo_toma_lectura or 0) - (row.cargo_toma_lectura or 0)) > 0.01
                        or abs((tarifa_existente.cargo_alumbrado or 0) - (row.cargo_alumbrado or 0)) > 0.01
                        or abs((tarifa_existente.cargo_seguridad or 0) - (row.cargo_seguridad or 0)) > 0.01
                        or abs((tarifa_existente.cargo_administracion or 0) - (row.cargo_administracion or 0)) > 0.01
                    )
                    if distinta:
                        results["advertencias_tarifa_existente"].append(
                            f"{ctx}: tarifa ya existe con valores distintos, no se sobrescribió"
                        )
                else:
                    nueva_tarifa = Tarifa(
                        ano=row.ano,
                        mes=row.mes_consumo,
                        costo_kwh_subsidiado=row.precio_kwh_subsidiado,
                        costo_kwh_pleno=row.precio_kwh_no_subsidiado,
                        consumo_tope_subsidiado=row.limite_subsidio or 184,
                        cargo_alumbrado=row.cargo_alumbrado or 0,
                        cargo_seguridad=row.cargo_seguridad or 0,
                        cargo_toma_lectura=row.cargo_toma_lectura or 0,
                        cargo_administracion=row.cargo_administracion or 0,
                        fecha_limite_pago=20,
                        intereses_mora=0.02,
                    )
                    db.add(nueva_tarifa)
                    db.commit()
                    results["tarifas_creadas"].append(f"{row.ano}-{row.mes_consumo:02d}")

                lectura_anterior_valor = row.lectura_anterior
                if lectura_anterior_valor is None:
                    lectura_prev = db.query(Lectura).filter(
                        Lectura.vivienda_id == vivienda.id,
                        (Lectura.ano < row.ano) | ((Lectura.ano == row.ano) & (Lectura.mes < row.mes_consumo)),
                        Lectura.lectura_actual.isnot(None),
                    ).order_by(Lectura.ano.desc(), Lectura.mes.desc()).first()
                    lectura_anterior_valor = lectura_prev.lectura_actual if lectura_prev else 0

                payload = LecturaCreate(
                    vivienda_id=vivienda.id,
                    ano=row.ano,
                    mes=row.mes_consumo,
                    lectura_anterior=lectura_anterior_valor,
                    lectura_actual=row.lectura_actual,
                    sincronizado=True,
                    offline_id=None,
                )
                FacturaService.create_lectura(
                    db, payload, usuario_id,
                    generar_factura=True, estado="facturada"
                )

                factura = FacturaService.get_factura_by_periodo(db, vivienda.id, row.ano, row.mes_consumo)
                if not factura:
                    results["errores"].append(f"{ctx}: la lectura no generó factura (revisa mínimo kWh)")
                    continue

                results["facturas_creadas"].append(factura.numero_factura)

                if row.valor_pagado and row.valor_pagado > 0:
                    if row.fecha_pago:
                        fecha_pago = row.fecha_pago
                    else:
                        ano_cobro, mes_cobro = FacturaService._get_periodo_cobro_desde_consumo(row.ano, row.mes_consumo)
                        ultimo = monthrange(ano_cobro, mes_cobro)[1]
                        fecha_pago = datetime(ano_cobro, mes_cobro, ultimo)
                    pago_payload = PagoCreate(
                        monto=row.valor_pagado,
                        concepto=f"Importación histórica {row.ano}-{row.mes_consumo:02d}",
                        metodo_pago="importado_historico",
                        fecha_pago=fecha_pago,
                    )
                    FacturaService.registrar_pago(db, factura.id, pago_payload, usuario_id)

                if row.valor_cobrado_hoja is not None:
                    delta = (factura.total or 0) - row.valor_cobrado_hoja
                    if abs(delta) > 1:
                        results["diferencias_valor"].append(
                            HistoricoImportDiferencia(
                                cedula=row.cedula,
                                ano=row.ano,
                                mes=row.mes_consumo,
                                valor_hoja=row.valor_cobrado_hoja,
                                valor_calculado=factura.total or 0,
                                delta=delta,
                            )
                        )

                results["procesados"] += 1

            except Exception as e:
                db.rollback()
                results["errores"].append(f"{ctx}: {str(e)}")

        return results
