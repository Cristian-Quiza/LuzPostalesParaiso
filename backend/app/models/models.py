from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.db.database import Base

class RoleEnum(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    EDITOR = "editor"
    LECTOR = "lector"
    CLIENTE = "cliente"

class EstadoFacturaEnum(str, enum.Enum):
    PENDIENTE = "pendiente"
    PAGADA = "pagada"
    PARCIAL = "parcial"
    VENCIDA = "vencida"
    ANULADA = "anulada"
    CORREGIDA = "corregida"

class TipoServicioEnum(str, enum.Enum):
    ALUMBRADO = "alumbrado"
    SEGURIDAD = "seguridad"
    TOMA_LECTURA = "toma_lectura"
    ADMINISTRACION = "administracion"

class Usuario(Base):
    __tablename__ = "usuarios"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    nombre_completo = Column(String(255), nullable=False)
    telefono = Column(String(20))
    whatsapp = Column(String(20))
    rol = Column(SQLEnum(RoleEnum), default=RoleEnum.LECTOR)
    foto_perfil = Column(String(500))
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    lecturas = relationship("Lectura", back_populates="usuario")
    facturas = relationship("Factura", back_populates="usuario_creador")
    pagos = relationship("Pago", back_populates="usuario_registra")

class Manzana(Base):
    __tablename__ = "manzanas"
    
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, index=True, nullable=False)
    nombre = Column(String(100))
    descripcion = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    viviendas = relationship("Vivienda", back_populates="manzana")

class Vivienda(Base):
    __tablename__ = "viviendas"
    
    id = Column(Integer, primary_key=True, index=True)
    numero_casa = Column(String(20), nullable=False)
    manzana_id = Column(Integer, ForeignKey("manzanas.id"), nullable=False)
    
    propietario = Column(String(255), nullable=False)
    cedula = Column(String(20), index=True)
    telefono = Column(String(20))
    whatsapp = Column(String(20))
    email = Column(String(255))
    direccion = Column(String(500))
    
    tiene_alumbrado = Column(Boolean, default=True)
    tiene_seguridad = Column(Boolean, default=False)
    tiene_toma_lectura = Column(Boolean, default=True)
    tiene_administracion = Column(Boolean, default=False)
    
    saldo_a_favor = Column(Float, default=0)
    estado = Column(String(20), default="activo")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    manzana = relationship("Manzana", back_populates="viviendas")
    lecturas = relationship("Lectura", back_populates="vivienda")
    facturas = relationship("Factura", back_populates="vivienda")
    
    __table_args__ = (
        Index('idx_vivienda_manzana_casa', 'manzana_id', 'numero_casa', unique=True),
    )

class Tarifa(Base):
    __tablename__ = "tarifas"
    
    id = Column(Integer, primary_key=True, index=True)
    ano = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)
    
    costo_kwh_subsidiado = Column(Float, nullable=False)
    costo_kwh_pleno = Column(Float, nullable=False)
    consumo_tope_subsidiado = Column(Integer, default=184)
    
    cargo_alumbrado = Column(Float, default=0)
    cargo_seguridad = Column(Float, default=0)
    cargo_toma_lectura = Column(Float, default=0)
    cargo_administracion = Column(Float, default=0)
    
    fecha_limite_pago = Column(Integer, default=20)
    intereses_mora = Column(Float, default=0.02)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    facturas = relationship("Factura", back_populates="tarifa")
    
    __table_args__ = (
        Index('idx_tarifa_ano_mes', 'ano', 'mes', unique=True),
    )

class Lectura(Base):
    __tablename__ = "lecturas"
    
    id = Column(Integer, primary_key=True, index=True)
    vivienda_id = Column(Integer, ForeignKey("viviendas.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    
    ano = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)
    
    lectura_anterior = Column(Float)
    lectura_actual = Column(Float, nullable=True)
    consumo = Column(Float)
    estado = Column(String(30), default="borrador")
    
    sincronizado = Column(Boolean, default=True)
    offline_id = Column(String(50))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    vivienda = relationship("Vivienda", back_populates="lecturas")
    usuario = relationship("Usuario", back_populates="lecturas")
    
    __table_args__ = (
        Index('idx_lectura_vivienda_periodo', 'vivienda_id', 'ano', 'mes', unique=True),
    )

class Factura(Base):
    __tablename__ = "facturas"
    
    id = Column(Integer, primary_key=True, index=True)
    numero_factura = Column(String(30), unique=True, index=True)
    vivienda_id = Column(Integer, ForeignKey("viviendas.id"), nullable=False)
    tarifa_id = Column(Integer, ForeignKey("tarifas.id"))
    usuario_creador_id = Column(Integer, ForeignKey("usuarios.id"))
    
    ano = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)
    
    lectura_anterior = Column(Float)
    lectura_actual = Column(Float)
    consumo = Column(Float)
    
    kwh_subsidiados = Column(Float)
    kwh_excedente = Column(Float)
    costo_subsidiado = Column(Float)
    costo_excedente = Column(Float)
    subtotal_energia = Column(Float)
    
    cargo_alumbrado = Column(Float, default=0)
    cargo_seguridad = Column(Float, default=0)
    cargo_toma_lectura = Column(Float, default=0)
    cargo_administracion = Column(Float, default=0)
    
    subtotal = Column(Float)
    saldo_anterior = Column(Float, default=0)
    total = Column(Float)
    total_pagado = Column(Float, default=0)
    
    estado = Column(SQLEnum(EstadoFacturaEnum), default=EstadoFacturaEnum.PENDIENTE)
    
    observaciones = Column(Text)
    es_manual = Column(Boolean, default=False)
    fecha_emision = Column(DateTime(timezone=True), server_default=func.now())
    fecha_vencimiento = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    vivienda = relationship("Vivienda", back_populates="facturas")
    tarifa = relationship("Tarifa", back_populates="facturas")
    usuario_creador = relationship("Usuario", back_populates="facturas")
    pagos = relationship("Pago", back_populates="factura")
    
    __table_args__ = (
        Index('idx_factura_vivienda_periodo', 'vivienda_id', 'ano', 'mes', unique=True),
    )

class FacturacionMensual(Base):
    __tablename__ = "facturacion_mensual"

    id = Column(Integer, primary_key=True, index=True)
    factura_id = Column(Integer, ForeignKey("facturas.id"), nullable=False, unique=True)
    vivienda_id = Column(Integer, ForeignKey("viviendas.id"), nullable=False)

    ano_cobro = Column(Integer, nullable=False)
    mes_cobro = Column(Integer, nullable=False)
    ano_consumo = Column(Integer, nullable=False)
    mes_consumo = Column(Integer, nullable=False)

    casa = Column(String(50), nullable=False)
    nombre = Column(String(255), nullable=False)
    cedula = Column(String(20))

    lectura_anterior = Column(Float, default=0)
    lectura_actual = Column(Float, default=0)
    consumo_kwh = Column(Float, default=0)
    consumo_subsidio = Column(Float, default=0)
    consumo_sin_subsidio = Column(Float, default=0)
    valor_subsidio = Column(Float, default=0)
    valor_sin_subsidio = Column(Float, default=0)

    toma_lectura = Column(Float, default=0)
    alumbrado = Column(Float, default=0)
    seguridad = Column(Float, default=0)
    administracion = Column(Float, default=0)

    subtotal = Column(Float, default=0)
    descuento_porcentaje = Column(Float, default=0)
    valor_descuento = Column(Float, default=0)
    total_a_pagar = Column(Float, default=0)
    pago = Column(Float, default=0)
    saldo = Column(Float, default=0)
    estado = Column(String(30), default="pendiente")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_facturacion_mensual_cobro", "ano_cobro", "mes_cobro"),
        Index("idx_facturacion_mensual_vivienda_cobro", "vivienda_id", "ano_cobro", "mes_cobro", unique=True),
    )

class Pago(Base):
    __tablename__ = "pagos"
    
    id = Column(Integer, primary_key=True, index=True)
    factura_id = Column(Integer, ForeignKey("facturas.id"), nullable=True)
    vivienda_id = Column(Integer, ForeignKey("viviendas.id"), nullable=True)
    usuario_registra_id = Column(Integer, ForeignKey("usuarios.id"))
    
    monto = Column(Float, nullable=False)
    concepto = Column(String(255))
    metodo_pago = Column(String(50))
    fecha_pago = Column(DateTime(timezone=True), nullable=False)
    referencia = Column(String(100))
    tipo_pago = Column(String(30), default="abono")
    periodo_ano = Column(Integer)
    periodo_mes = Column(Integer)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    factura = relationship("Factura", back_populates="pagos")
    vivienda = relationship("Vivienda", foreign_keys=[vivienda_id])
    usuario_registra = relationship("Usuario", back_populates="pagos")
    
    __table_args__ = (
        Index('idx_pago_factura_fecha', 'factura_id', 'fecha_pago'),
        Index('idx_pago_periodo', 'periodo_ano', 'periodo_mes'),
        Index('idx_pago_vivienda_periodo', 'vivienda_id', 'periodo_ano', 'periodo_mes'),
    )

class Configuracion(Base):
    __tablename__ = "configuraciones"
    
    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(100), index=True, nullable=False)
    valor = Column(Text)
    descripcion = Column(String(500))
    anio = Column(Integer, nullable=False)
    periodo_mes = Column(String(2))
    periodo_corte = Column(String(50))
    activa = Column(Boolean, default=True)
    fecha_inicio = Column(DateTime(timezone=True), server_default=func.now())
    fecha_fin = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
