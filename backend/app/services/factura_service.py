from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.models.models import Tarifa, Lectura, Factura, Pago, Vivienda, Manzana, EstadoFacturaEnum
from app.schemas.schemas import (
    TarifaCreate, TarifaUpdate, LecturaCreate, FacturaCreate, 
    FacturaUpdate, PagoCreate, DashboardResponse, ReporteCarteraResponse,
    PagoImportData
)

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
    total_consumo_kwh: int
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
    def create_lectura(db: Session, data: LecturaCreate, usuario_id: Optional[int]) -> Lectura:
        lectura_anterior = FacturaService.get_ultima_lectura(db, data.vivienda_id)
        lectura_anterior_valor = lectura_anterior.lectura_actual if lectura_anterior else 0
        consumo = data.lectura_actual - lectura_anterior_valor
        
        db_lectura = Lectura(
            vivienda_id=data.vivienda_id,
            usuario_id=usuario_id or 1,
            ano=data.ano,
            mes=data.mes,
            lectura_anterior=lectura_anterior_valor,
            lectura_actual=data.lectura_actual,
            consumo=consumo,
            sincronizado=data.sincronizado,
            offline_id=data.offline_id
        )
        db.add(db_lectura)
        db.commit()
        db.refresh(db_lectura)
        return db_lectura
    
    @staticmethod
    def calcular_factura(vivienda: Vivienda, lectura: Lectura, tarifa: Tarifa, saldo_anterior: float = 0) -> dict:
        consumo = lectura.consumo or 0
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
    def get_facturas(db: Session, vivienda_id: Optional[int] = None, ano: Optional[int] = None, mes: Optional[int] = None, estado: Optional[str] = None) -> List[Factura]:
        query = db.query(Factura)
        if vivienda_id:
            query = query.filter(Factura.vivienda_id == vivienda_id)
        if ano:
            query = query.filter(Factura.ano == ano)
        if mes:
            query = query.filter(Factura.mes == mes)
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
        
        tarifa = FacturaService.get_tarifa(db, data.ano, data.mes)
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
            tarifa_id=tarifa.id,
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
        
        if saldo_anterior > 0:
            vivienda.saldo_a_favor = 0
            db.commit()
        
        return db_factura
    
    @staticmethod
    def _get_saldo_anterior(db: Session, vivienda_id: int, ano: int, mes: int) -> float:
        facturas = db.query(Factura).filter(
            Factura.vivienda_id == vivienda_id,
            Factura.ano < ano,
            Factura.estado != EstadoFacturaEnum.PAGADA
        ).all()
        
        saldo = 0
        for f in facturas:
            saldo += (f.total or 0) - (f.total_pagado or 0)
        
        return max(0, saldo)
    
    @staticmethod
    def generar_facturas_masivo(db: Session, ano: int, mes: int, usuario_id: int) -> List[Factura]:
        tarifa = FacturaService.get_tarifa(db, ano, mes)
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
                tarifa_id=tarifa.id,
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
        return factura
    
    @staticmethod
    def registrar_pago(db: Session, factura_id: int, data: PagoCreate, usuario_id: int) -> Pago:
        factura = db.query(Factura).filter(Factura.id == factura_id).first()
        if not factura:
            raise ValueError("Factura no encontrada")
        
        db_pago = Pago(
            factura_id=factura_id,
            usuario_registra_id=usuario_id,
            monto=data.monto,
            concepto=data.concepto,
            metodo_pago=data.metodo_pago,
            fecha_pago=data.fecha_pago,
            referencia=data.referencia
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
        return db_pago
    
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
                    referencia=str(item.pin) if item.pin else None
                )
                db.add(db_pago)
                
                if factura:
                    factura.total_pagado = (factura.total_pagado or 0) + item.abono
                    if factura.total_pagado >= factura.total:
                        factura.estado = "pagada"
                    elif factura.total_pagado > 0:
                        factura.estado = "parcial"
                
                db.commit()
                
                results["success"] += 1
                estado = "✓" if factura else "⚠️"
                results["success_list"].append(
                    f"{estado} {propietario_info} - {item.abono:.2f} - {item.mes}/{item.ano}"
                )
                
            except Exception as e:
                results["errors"].append(f"Error: {item.cliente} - {str(e)}")
                db.rollback()
        
        return results