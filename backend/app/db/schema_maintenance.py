import re
from datetime import datetime

from sqlalchemy import inspect, text

from app.db.database import Base, SessionLocal, engine
from app.models.models import Factura, FacturacionMensual, Manzana, Pago, Vivienda


def _get_periodo_cobro(ano_consumo: int, mes_consumo: int) -> tuple[int, int]:
    if mes_consumo == 12:
        return ano_consumo + 1, 1
    return ano_consumo, mes_consumo + 1


def _normalize_code(value: object) -> str:
    return re.sub(r"[^0-9a-z]+", "", str(value or "").lower())


def _normalize_digits(value: object) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(table_name)}


def _add_column_if_missing(conn, table_name: str, columns: set[str], column_name: str, ddl: str) -> None:
    if column_name in columns:
        return
    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {ddl}"))


def _ensure_configuraciones_schema() -> None:
    if "configuraciones" not in inspect(engine).get_table_names():
        return

    current_year = datetime.now().year
    current_month = str(datetime.now().month).zfill(2)
    columns = _column_names("configuraciones")

    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS anio INTEGER"))
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS periodo_mes VARCHAR(2)"))
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS periodo_corte VARCHAR(50)"))
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE"))
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT now()"))
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS fecha_fin TIMESTAMP WITH TIME ZONE"))
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now()"))
            conn.execute(text("ALTER TABLE configuraciones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE"))
        else:
            _add_column_if_missing(conn, "configuraciones", columns, "anio", f"anio INTEGER DEFAULT {current_year}")
            _add_column_if_missing(conn, "configuraciones", columns, "periodo_mes", f"periodo_mes VARCHAR(2) DEFAULT '{current_month}'")
            _add_column_if_missing(conn, "configuraciones", columns, "periodo_corte", "periodo_corte VARCHAR(50)")
            _add_column_if_missing(conn, "configuraciones", columns, "activa", "activa BOOLEAN DEFAULT 1")
            _add_column_if_missing(conn, "configuraciones", columns, "fecha_inicio", "fecha_inicio DATETIME")
            _add_column_if_missing(conn, "configuraciones", columns, "fecha_fin", "fecha_fin DATETIME")
            _add_column_if_missing(conn, "configuraciones", columns, "created_at", "created_at DATETIME")
            _add_column_if_missing(conn, "configuraciones", columns, "updated_at", "updated_at DATETIME")

        conn.execute(text("UPDATE configuraciones SET anio = :anio WHERE anio IS NULL"), {"anio": current_year})
        conn.execute(text("UPDATE configuraciones SET periodo_mes = :periodo_mes WHERE periodo_mes IS NULL"), {"periodo_mes": current_month})
        conn.execute(text("UPDATE configuraciones SET activa = :activa WHERE activa IS NULL"), {"activa": True})
        now = datetime.now()
        conn.execute(text("UPDATE configuraciones SET created_at = :now WHERE created_at IS NULL"), {"now": now})
        conn.execute(text("UPDATE configuraciones SET fecha_inicio = COALESCE(fecha_inicio, created_at, :now) WHERE fecha_inicio IS NULL"), {"now": now})


def _ensure_legacy_vivienda_manzanas() -> None:
    table_names = inspect(engine).get_table_names()
    if "viviendas" not in table_names or "manzanas" not in table_names:
        return

    db = SessionLocal()
    try:
        manzanas = db.query(Manzana).all()
        by_digits = {_normalize_digits(manzana.codigo): manzana for manzana in manzanas if _normalize_digits(manzana.codigo)}
        by_code = {_normalize_code(manzana.codigo): manzana for manzana in manzanas}

        for vivienda in db.query(Vivienda).all():
            if db.query(Manzana.id).filter(Manzana.id == vivienda.manzana_id).first():
                continue

            digits = _normalize_digits(vivienda.manzana_id)
            manzana = by_digits.get(digits) or by_code.get(_normalize_code(f"MZ{digits}"))

            if not manzana and digits:
                codigo = f"MZ{digits}"
                manzana = Manzana(codigo=codigo, nombre=f"Manzana {digits}", descripcion="Creada por migracion de compatibilidad")
                db.add(manzana)
                db.flush()
                by_digits[digits] = manzana
                by_code[_normalize_code(codigo)] = manzana

            if manzana:
                vivienda.manzana_id = manzana.id

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _backfill_facturacion_mensual() -> None:
    db = SessionLocal()
    try:
        facturas = (
            db.query(Factura)
            .outerjoin(FacturacionMensual, FacturacionMensual.factura_id == Factura.id)
            .filter(FacturacionMensual.id.is_(None))
            .all()
        )
        for factura in facturas:
            vivienda = db.query(Vivienda).filter(Vivienda.id == factura.vivienda_id).first()
            if not vivienda:
                continue

            ano_cobro, mes_cobro = _get_periodo_cobro(factura.ano, factura.mes)
            pago = factura.total_pagado or 0
            total = factura.total or 0
            estado = factura.estado.value if hasattr(factura.estado, "value") else str(factura.estado)
            db.add(
                FacturacionMensual(
                    factura_id=factura.id,
                    vivienda_id=vivienda.id,
                    ano_cobro=ano_cobro,
                    mes_cobro=mes_cobro,
                    ano_consumo=factura.ano,
                    mes_consumo=factura.mes,
                    casa=f"MZ {vivienda.manzana_id} C{vivienda.numero_casa}",
                    nombre=vivienda.propietario,
                    cedula=vivienda.cedula,
                    lectura_anterior=factura.lectura_anterior or 0,
                    lectura_actual=factura.lectura_actual or 0,
                    consumo_kwh=factura.consumo or 0,
                    consumo_subsidio=factura.kwh_subsidiados or 0,
                    consumo_sin_subsidio=factura.kwh_excedente or 0,
                    valor_subsidio=factura.costo_subsidiado or 0,
                    valor_sin_subsidio=factura.costo_excedente or 0,
                    toma_lectura=factura.cargo_toma_lectura or 0,
                    alumbrado=factura.cargo_alumbrado or 0,
                    seguridad=factura.cargo_seguridad or 0,
                    administracion=factura.cargo_administracion or 0,
                    subtotal=factura.subtotal or 0,
                    total_a_pagar=total,
                    pago=pago,
                    saldo=total - pago,
                    estado=estado,
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _ensure_pagos_schema() -> None:
    if "pagos" not in inspect(engine).get_table_names():
        return

    columns = _column_names("pagos")
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE pagos ADD COLUMN IF NOT EXISTS tipo_pago VARCHAR(30) DEFAULT 'abono'"))
            conn.execute(text("ALTER TABLE pagos ADD COLUMN IF NOT EXISTS periodo_ano INTEGER"))
            conn.execute(text("ALTER TABLE pagos ADD COLUMN IF NOT EXISTS periodo_mes INTEGER"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pago_periodo ON pagos(periodo_ano, periodo_mes)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pago_vivienda_periodo ON pagos(vivienda_id, periodo_ano, periodo_mes)"))
            conn.execute(
                text(
                    """
                    UPDATE pagos p
                    SET periodo_ano = f.ano,
                        periodo_mes = f.mes,
                        vivienda_id = COALESCE(p.vivienda_id, f.vivienda_id)
                    FROM facturas f
                    WHERE p.factura_id = f.id
                      AND (p.periodo_ano IS NULL OR p.periodo_mes IS NULL OR p.vivienda_id IS NULL)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE pagos
                    SET periodo_ano = EXTRACT(YEAR FROM fecha_pago)::INTEGER,
                        periodo_mes = EXTRACT(MONTH FROM fecha_pago)::INTEGER
                    WHERE factura_id IS NULL
                      AND fecha_pago IS NOT NULL
                      AND (periodo_ano IS NULL OR periodo_mes IS NULL)
                    """
                )
            )
        else:
            _add_column_if_missing(conn, "pagos", columns, "tipo_pago", "tipo_pago VARCHAR(30) DEFAULT 'abono'")
            _add_column_if_missing(conn, "pagos", columns, "periodo_ano", "periodo_ano INTEGER")
            _add_column_if_missing(conn, "pagos", columns, "periodo_mes", "periodo_mes INTEGER")
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pago_periodo ON pagos(periodo_ano, periodo_mes)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pago_vivienda_periodo ON pagos(vivienda_id, periodo_ano, periodo_mes)"))
            conn.execute(
                text(
                    """
                    UPDATE pagos
                    SET periodo_ano = (SELECT ano FROM facturas WHERE facturas.id = pagos.factura_id),
                        periodo_mes = (SELECT mes FROM facturas WHERE facturas.id = pagos.factura_id),
                        vivienda_id = COALESCE(vivienda_id, (SELECT vivienda_id FROM facturas WHERE facturas.id = pagos.factura_id))
                    WHERE factura_id IS NOT NULL
                      AND (periodo_ano IS NULL OR periodo_mes IS NULL OR vivienda_id IS NULL)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE pagos
                    SET periodo_ano = CAST(strftime('%Y', fecha_pago) AS INTEGER),
                        periodo_mes = CAST(strftime('%m', fecha_pago) AS INTEGER)
                    WHERE factura_id IS NULL
                      AND fecha_pago IS NOT NULL
                      AND (periodo_ano IS NULL OR periodo_mes IS NULL)
                    """
                )
            )

        conn.execute(text("UPDATE pagos SET tipo_pago = 'abono' WHERE tipo_pago IS NULL OR tipo_pago = ''"))


def ensure_runtime_schema() -> None:
    """Apply small additive compatibility fixes without touching business data."""
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "usuarios" in table_names and engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'CLIENTE'"))
            conn.execute(text("ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'cliente'"))

    _ensure_configuraciones_schema()
    _ensure_legacy_vivienda_manzanas()
    _ensure_pagos_schema()

    if "facturas" in table_names and "facturacion_mensual" not in table_names:
        Base.metadata.create_all(bind=engine, tables=[FacturacionMensual.__table__])
        table_names = inspect(engine).get_table_names()

    if "lecturas" not in table_names:
        return

    columns = {column["name"]: column for column in inspector.get_columns("lecturas")}
    with engine.begin() as conn:
        if "estado" not in columns:
            conn.execute(text("ALTER TABLE lecturas ADD COLUMN estado VARCHAR(30) DEFAULT 'borrador'"))
        if engine.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE lecturas ALTER COLUMN lectura_actual DROP NOT NULL"))

    if "facturas" in table_names and "facturacion_mensual" in table_names:
        _backfill_facturacion_mensual()
