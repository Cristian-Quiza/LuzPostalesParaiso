from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

class RoleEnum(str, Enum):
    SUPER_ADMIN = "super_admin"
    EDITOR = "editor"
    LECTOR = "lector"
    CLIENTE = "cliente"

class EstadoFacturaEnum(str, Enum):
    PENDIENTE = "pendiente"
    PAGADA = "pagada"
    PARCIAL = "parcial"
    VENCIDA = "vencida"
    ANULADA = "anulada"
    CORREGIDA = "corregida"

class UsuarioCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    nombre_completo: str = Field(..., min_length=3, max_length=255)
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    rol: RoleEnum = RoleEnum.LECTOR

class UsuarioUpdate(BaseModel):
    email: Optional[EmailStr] = None
    nombre_completo: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    foto_perfil: Optional[str] = None
    rol: Optional[RoleEnum] = None
    is_active: Optional[bool] = None

class UsuarioResponse(BaseModel):
    id: int
    email: str
    username: str
    nombre_completo: str
    telefono: Optional[str]
    whatsapp: Optional[str]
    rol: RoleEnum
    foto_perfil: Optional[str]
    is_active: bool
    is_superuser: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class UsuarioLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    usuario: UsuarioResponse

class ManzanaCreate(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=20)
    nombre: Optional[str] = None
    descripcion: Optional[str] = None

class ManzanaResponse(BaseModel):
    id: int
    codigo: str
    nombre: Optional[str]
    descripcion: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class ViviendaCreate(BaseModel):
    numero_casa: str = Field(..., min_length=1, max_length=20)
    manzana_id: int
    propietario: str = Field(..., min_length=3, max_length=255)
    cedula: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    tiene_alumbrado: bool = True
    tiene_seguridad: bool = False
    tiene_toma_lectura: bool = True
    tiene_administracion: bool = False

class ViviendaUpdate(BaseModel):
    numero_casa: Optional[str] = None
    manzana_id: Optional[int] = None
    propietario: Optional[str] = None
    cedula: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    tiene_alumbrado: Optional[bool] = None
    tiene_seguridad: Optional[bool] = None
    tiene_toma_lectura: Optional[bool] = None
    tiene_administracion: Optional[bool] = None
    saldo_a_favor: Optional[float] = None
    estado: Optional[str] = None

class ViviendaResponse(BaseModel):
    id: int
    numero_casa: str
    manzana_id: int
    manzana_codigo: Optional[str] = None
    propietario: str
    cedula: Optional[str]
    telefono: Optional[str]
    whatsapp: Optional[str]
    email: Optional[str]
    direccion: Optional[str]
    tiene_alumbrado: bool
    tiene_seguridad: bool
    tiene_toma_lectura: bool
    tiene_administracion: bool
    saldo_a_favor: float
    estado: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class TarifaCreate(BaseModel):
    ano: int = Field(..., ge=2020, le=2100)
    mes: int = Field(..., ge=1, le=12)
    costo_kwh_subsidiado: float = Field(..., gt=0)
    costo_kwh_pleno: float = Field(..., gt=0)
    consumo_tope_subsidiado: int = Field(default=184, ge=1)
    cargo_alumbrado: float = 0
    cargo_seguridad: float = 0
    cargo_toma_lectura: float = 0
    cargo_administracion: float = 0
    fecha_limite_pago: int = Field(default=20, ge=1, le=31)
    intereses_mora: float = 0.02

class TarifaUpdate(BaseModel):
    costo_kwh_subsidiado: Optional[float] = None
    costo_kwh_pleno: Optional[float] = None
    consumo_tope_subsidiado: Optional[int] = None
    cargo_alumbrado: Optional[float] = None
    cargo_seguridad: Optional[float] = None
    cargo_toma_lectura: Optional[float] = None
    cargo_administracion: Optional[float] = None
    fecha_limite_pago: Optional[int] = None
    intereses_mora: Optional[float] = None

class TarifaResponse(BaseModel):
    id: int
    ano: int
    mes: int
    costo_kwh_subsidiado: float
    costo_kwh_pleno: float
    consumo_tope_subsidiado: int
    cargo_alumbrado: float
    cargo_seguridad: float
    cargo_toma_lectura: float
    cargo_administracion: float
    fecha_limite_pago: int
    intereses_mora: float
    created_at: datetime
    
    class Config:
        from_attributes = True

class LecturaCreate(BaseModel):
    vivienda_id: int
    ano: int = Field(..., ge=2020, le=2100)
    mes: int = Field(..., ge=1, le=12)
    lectura_anterior: Optional[float] = Field(default=None, ge=0)
    lectura_actual: Optional[float] = Field(default=None, ge=0)
    sincronizado: bool = True
    offline_id: Optional[str] = None
    estado: Optional[str] = "borrador"

class LecturaResponse(BaseModel):
    id: int
    vivienda_id: int
    usuario_id: int
    ano: int
    mes: int
    lectura_anterior: Optional[float]
    lectura_actual: Optional[float]
    consumo: Optional[float]
    estado: Optional[str] = "borrador"
    sincronizado: bool
    offline_id: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class FacturaCreate(BaseModel):
    vivienda_id: int
    ano: int
    mes: int
    lectura_anterior: Optional[float] = None
    lectura_actual: Optional[float] = None
    observaciones: Optional[str] = None
    es_manual: bool = False

class FacturaUpdate(BaseModel):
    lectura_anterior: Optional[float] = None
    lectura_actual: Optional[float] = None
    consumo: Optional[float] = None
    cargo_alumbrado: Optional[float] = None
    cargo_seguridad: Optional[float] = None
    cargo_toma_lectura: Optional[float] = None
    cargo_administracion: Optional[float] = None
    observaciones: Optional[str] = None
    estado: Optional[EstadoFacturaEnum] = None

class FacturaResponse(BaseModel):
    id: int
    numero_factura: str
    vivienda_id: int
    tarifa_id: Optional[int]
    usuario_creador_id: Optional[int]
    ano: int
    mes: int
    lectura_anterior: Optional[float]
    lectura_actual: Optional[float]
    consumo: Optional[float]
    kwh_subsidiados: Optional[float]
    kwh_excedente: Optional[float]
    costo_subsidiado: Optional[float]
    costo_excedente: Optional[float]
    subtotal_energia: Optional[float]
    cargo_alumbrado: float
    cargo_seguridad: float
    cargo_toma_lectura: float
    cargo_administracion: float
    subtotal: Optional[float]
    saldo_anterior: float
    total: Optional[float]
    total_pagado: float
    estado: EstadoFacturaEnum
    observaciones: Optional[str]
    es_manual: bool
    fecha_emision: datetime
    fecha_vencimiento: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True

class PagoCreate(BaseModel):
    factura_id: Optional[int] = None
    vivienda_id: Optional[int] = None
    monto: float = Field(..., gt=0)
    concepto: Optional[str] = None
    metodo_pago: Optional[str] = None
    fecha_pago: datetime
    referencia: Optional[str] = None
    tipo_pago: Optional[str] = "abono"

class PagoImportData(BaseModel):
    cuenta: str
    cliente: str
    abono: float
    pin: Optional[str] = None
    fecha_recaudo: datetime
    mes: int
    ano: int

class PagoImportResponse(BaseModel):
    success: int
    success_list: List[str]
    errors: List[str]

class HistoricoImportRow(BaseModel):
    cedula: str
    ano: int
    mes_consumo: int
    lectura_anterior: Optional[float] = None
    lectura_actual: float
    precio_kwh_subsidiado: float
    precio_kwh_no_subsidiado: float
    limite_subsidio: Optional[int] = 184
    cargo_toma_lectura: Optional[float] = 0
    cargo_alumbrado: Optional[float] = 0
    cargo_seguridad: Optional[float] = 0
    cargo_administracion: Optional[float] = 0
    valor_pagado: Optional[float] = 0
    fecha_pago: Optional[datetime] = None
    valor_cobrado_hoja: Optional[float] = None

class HistoricoImportDiferencia(BaseModel):
    cedula: str
    ano: int
    mes: int
    valor_hoja: float
    valor_calculado: float
    delta: float

class HistoricoImportResponse(BaseModel):
    procesados: int
    facturas_creadas: List[str]
    tarifas_creadas: List[str]
    advertencias_tarifa_existente: List[str]
    diferencias_valor: List[HistoricoImportDiferencia]
    errores: List[str]

class PagoResponse(BaseModel):
    id: int
    factura_id: Optional[int]
    vivienda_id: Optional[int] = None
    usuario_registra_id: Optional[int]
    monto: float
    concepto: Optional[str]
    metodo_pago: Optional[str]
    fecha_pago: datetime
    referencia: Optional[str]
    tipo_pago: Optional[str] = None
    periodo_ano: Optional[int] = None
    periodo_mes: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class PagoDetalleResponse(BaseModel):
    id: int
    factura_id: Optional[int]
    monto: float
    concepto: Optional[str]
    metodo_pago: Optional[str]
    fecha_pago: datetime
    referencia: Optional[str]
    tipo_pago: Optional[str] = None
    periodo_ano: Optional[int] = None
    periodo_mes: Optional[int] = None
    created_at: datetime
    vivienda_id: Optional[int] = None
    numero_casa: Optional[str] = None
    propietario: Optional[str] = None
    cedula: Optional[str] = None
    manzana_id: Optional[int] = None
    manzana_codigo: Optional[str] = None
    numero_factura: Optional[str] = None
    ano: Optional[int] = None
    mes: Optional[int] = None
    total_factura: Optional[float] = None
    
    class Config:
        from_attributes = True

class DashboardResponse(BaseModel):
    total_viviendas: int
    viviendas_activas: int
    facturas_mes_actual: int
    facturas_pendientes: int
    facturas_pagadas: int
    total_recaudo: float
    total_pendiente: float
    consumo_total_kwh: float
    promedio_consumo_kwh: float

class ReporteCarteraResponse(BaseModel):
    ano: int
    mes: int
    total_facturado: float
    total_pagado: float
    total_pendiente: float
    numero_facturas: int
    facturas_pendientes: int
    facturas_pagadas: int

class ConfiguracionCreate(BaseModel):
    clave: str = Field(..., min_length=1, max_length=100)
    valor: Optional[str] = None
    descripcion: Optional[str] = None
    anio: Optional[int] = None
    periodo_mes: Optional[str] = None
    periodo_corte: Optional[str] = None

class ConfiguracionResponse(BaseModel):
    id: int
    clave: str
    valor: Optional[str]
    descripcion: Optional[str]
    anio: Optional[int]
    periodo_mes: Optional[str]
    periodo_corte: Optional[str]
    activa: bool
    fecha_inicio: Optional[datetime]
    fecha_fin: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class HistorialPeriodoResponse(BaseModel):
    id: int
    anio: Optional[int]
    periodo_mes: Optional[str]
    periodo_corte: Optional[str]
    valor: Optional[str]
    descripcion: Optional[str]
    fecha_inicio: Optional[datetime]
    fecha_fin: Optional[datetime]
    activa: bool
    
    class Config:
        from_attributes = True

class LecturaPlanillaRow(BaseModel):
    vivienda_id: int
    numero_casa: str
    manzana_id: int
    manzana_codigo: Optional[str] = None
    propietario: str
    cedula: Optional[str] = None
    telefono: Optional[str] = None
    estado_vivienda: str
    lectura_id: Optional[int] = None
    lectura_anterior: float
    lectura_actual: Optional[float] = None
    consumo_kwh: float = 0
    consumo_subsidiado: float = 0
    consumo_sin_subsidio: float = 0
    precio_subsidiado: float = 0
    precio_sin_subsidio: float = 0
    cargo_toma_lectura: float = 0
    cargo_alumbrado: float = 0
    cargo_seguridad: float = 0
    cargo_administracion: float = 0
    cobros_fijos: float = 0
    limite_subsidio: int = 184
    tarifa_subsidiada: float = 0
    tarifa_plena: float = 0
    total_factura: float = 0
    factura_id: Optional[int] = None
    factura_estado: Optional[EstadoFacturaEnum] = None
    lectura_estado: Optional[str] = "borrador"
    requiere_lectura: bool = True

class ClienteFacturaResponse(BaseModel):
    id: int
    vivienda_id: int
    casa: str
    propietario: str
    cedula: Optional[str] = None
    ano: int
    mes: int
    ano_cobro: int
    mes_cobro: int
    numero_factura: str
    lectura_anterior: Optional[float] = None
    lectura_actual: Optional[float] = None
    consumo: Optional[float] = None
    total: float = 0
    total_pagado: float = 0
    saldo: float = 0
    estado: str
    fecha_emision: datetime

class ClienteResumenResponse(BaseModel):
    propietario: str
    cedula: str
    total_facturado: float
    total_pagado: float
    total_adeudado: float
    facturas_pendientes: int
    facturas_pagadas: int
    facturas_parciales: int
    al_dia: bool
    facturas: List[ClienteFacturaResponse]

class ClientePerfilResponse(BaseModel):
    nombre_completo: str
    cedula: str
    casa: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None

class FacturacionMensualResponse(BaseModel):
    id: int
    factura_id: int
    vivienda_id: int
    ano_cobro: int
    mes_cobro: int
    ano_consumo: int
    mes_consumo: int
    casa: str
    nombre: str
    cedula: Optional[str] = None
    lectura_anterior: float
    lectura_actual: float
    consumo_kwh: float
    consumo_subsidio: float
    consumo_sin_subsidio: float
    valor_subsidio: float
    valor_sin_subsidio: float
    toma_lectura: float
    alumbrado: float
    seguridad: float
    administracion: float
    subtotal: float
    descuento_porcentaje: float
    valor_descuento: float
    total_a_pagar: float
    pago: float
    saldo: float
    estado: str

    class Config:
        from_attributes = True

ManzanaResponse.model_rebuild()
ViviendaResponse.model_rebuild()
