from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from io import BytesIO
from datetime import datetime
import re
import unicodedata

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.db.database import get_db
from app.models import models
from app.models.models import Usuario, RoleEnum, Factura, Vivienda, Manzana, FacturacionMensual, Lectura
from app.schemas.schemas import (
    UsuarioCreate, UsuarioResponse, UsuarioLogin, Token, 
    UsuarioUpdate, ManzanaCreate, ManzanaResponse, ViviendaCreate, 
    ViviendaResponse, ViviendaUpdate, TarifaCreate, TarifaResponse,
    TarifaUpdate, LecturaCreate, LecturaResponse, FacturaCreate,
    FacturaResponse, FacturaUpdate, PagoCreate, PagoResponse,
    DashboardResponse, ReporteCarteraResponse, ConfiguracionCreate,
    ConfiguracionResponse, HistorialPeriodoResponse, PagoImportData,
    PagoImportResponse, PagoDetalleResponse, LecturaPlanillaRow,
    FacturacionMensualResponse, ClienteResumenResponse, ClienteFacturaResponse,
    ClientePerfilResponse, HistoricoImportRow, HistoricoImportResponse
)
from app.services import auth_service, factura_service, manzana_service, vivienda_service, configuracion_service
from app.utils.security import decode_token, get_password_hash

router = APIRouter()
security = HTTPBearer()

def _month_name(month: int) -> str:
    months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    return months[month - 1] if 1 <= month <= 12 else str(month)

def _pdf_text(value: object) -> str:
    text = str(value if value is not None else "")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

def _format_money(value: object) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0
    return f"${amount:,.0f}"

def _format_reading(value: object) -> str:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = 0
    if number.is_integer():
        return f"{number:,.0f}"
    return f"{number:,.2f}"

def _build_basic_pdf(pages: list[list[str]]) -> bytes:
    if not pages:
        pages = [["PORTALES DEL PARAISO", "Sin registros para imprimir."]]

    objects: list[bytes] = []

    def add_obj(data: bytes | str) -> int:
        payload = data.encode("latin-1", errors="replace") if isinstance(data, str) else data
        objects.append(payload)
        return len(objects)

    font_obj = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_obj_ids: list[int] = []

    for page_lines in pages:
        y = 810
        commands = ["BT", "/F1 10 Tf"]
        for line in page_lines:
            commands.append(f"1 0 0 1 36 {y} Tm ({_pdf_text(line)}) Tj")
            y -= 14
        commands.append("ET")
        stream = "\n".join(commands).encode("latin-1", errors="replace")
        content_obj = add_obj(
            f"<< /Length {len(stream)} >>\nstream\n".encode("latin-1") +
            stream +
            b"\nendstream"
        )
        page_obj = add_obj(
            f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_obj} 0 R >> >> "
            f"/Contents {content_obj} 0 R >>"
        )
        page_obj_ids.append(page_obj)

    kids = " ".join(f"{obj_id} 0 R" for obj_id in page_obj_ids)
    pages_obj = add_obj(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_ids)} >>")
    for page_obj in page_obj_ids:
        objects[page_obj - 1] = objects[page_obj - 1].replace(
            b"/Parent 0 0 R",
            f"/Parent {pages_obj} 0 R".encode("latin-1")
        )
    catalog_obj = add_obj(f"<< /Type /Catalog /Pages {pages_obj} 0 R >>")

    pdf = BytesIO()
    pdf.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(pdf.tell())
        pdf.write(f"{index} 0 obj\n".encode("latin-1"))
        pdf.write(obj)
        pdf.write(b"\nendobj\n")
    xref_at = pdf.tell()
    pdf.write(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.write(f"{offset:010d} 00000 n \n".encode("latin-1"))
    pdf.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_obj} 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF".encode("latin-1")
    )
    return pdf.getvalue()

def _factura_lines(index: int, factura: Factura, vivienda: Vivienda, manzana: Optional[Manzana], ano_cobro: int, mes_cobro: int) -> list[str]:
    manzana_label = manzana.codigo if manzana else f"MZ {vivienda.manzana_id}"
    casa_label = f"{manzana_label} - C {str(vivienda.numero_casa).zfill(2)}"
    estado = factura.estado.value if hasattr(factura.estado, "value") else str(factura.estado)
    return [
        f"No. {index}    FACTURA DE ENERGIA ELECTRICA    {_month_name(mes_cobro)} {ano_cobro}",
        "PORTALES DEL PARAISO",
        "Codigo Cliente: 458432252",
        f"Casa: {casa_label}    Cedula: {vivienda.cedula or 'N/A'}",
        f"Propietario: {vivienda.propietario}",
        f"Lectura anterior: {_format_reading(factura.lectura_anterior)}    Lectura actual: {_format_reading(factura.lectura_actual)}",
        f"Consumo: {_format_reading(factura.consumo)} kWh    Subsidiado: {_format_reading(factura.kwh_subsidiados)}    Sin subsidio: {_format_reading(factura.kwh_excedente)}",
        f"Valor subsidio: {_format_money(factura.costo_subsidiado)}    Valor sin subsidio: {_format_money(factura.costo_excedente)}",
        f"Toma de lectura: {_format_money(factura.cargo_toma_lectura)}    Alumbrado publico: {_format_money(factura.cargo_alumbrado)}    Seguridad: {_format_money(factura.cargo_seguridad)}",
        f"TOTAL A PAGAR: {_format_money(factura.total)}    Estado: {estado}",
        f"Generada: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
    ]

ROYAL_BLUE = colors.HexColor("#1D4ED8")
MINT = colors.HexColor("#5EEAD4")
DARK = colors.HexColor("#0F172A")
LIGHT = colors.HexColor("#F8FAFC")

def _casa_label(vivienda: Vivienda, manzana: Optional[Manzana] = None) -> str:
    manzana_label = manzana.codigo if manzana else f"MZ {vivienda.manzana_id}"
    return f"{manzana_label} - C {str(vivienda.numero_casa).zfill(2)}"

def _factura_periodo_cobro(factura: Factura) -> tuple[int, int]:
    if factura.mes == 12:
        return factura.ano + 1, 1
    return factura.ano, factura.mes + 1

def _draw_value_pair(pdf: canvas.Canvas, x: float, y: float, label: str, value: str, width: float = 76 * mm) -> None:
    pdf.setFillColor(colors.HexColor("#64748B"))
    pdf.setFont("Helvetica", 7)
    pdf.drawString(x, y + 8, label)
    pdf.setFillColor(DARK)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(x, y - 3, value)
    pdf.setStrokeColor(colors.HexColor("#E2E8F0"))
    pdf.line(x, y - 8, x + width, y - 8)

def _draw_receipt(pdf: canvas.Canvas, index: int, factura: Factura, vivienda: Vivienda, manzana: Optional[Manzana], x: float, y: float, w: float, h: float, ano_cobro: int, mes_cobro: int) -> None:
    estado = factura.estado.value if hasattr(factura.estado, "value") else str(factura.estado)
    total_periodo = factura.subtotal if factura.subtotal is not None else factura.total
    pdf.setStrokeColor(colors.HexColor("#CBD5E1"))
    pdf.setLineWidth(0.7)
    pdf.roundRect(x, y, w, h, 7, stroke=1, fill=0)

    pdf.setFillColor(ROYAL_BLUE)
    pdf.roundRect(x, y + h - 30, w, 30, 7, stroke=0, fill=1)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(x + 10, y + h - 18, "FACTURA DE ENERGIA ELECTRICA")
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(x + w - 10, y + h - 18, f"{_month_name(mes_cobro)} {ano_cobro}")

    pdf.setFillColor(DARK)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawCentredString(x + w / 2, y + h - 48, "PORTALES DEL PARAISO")
    pdf.setFillColor(ROYAL_BLUE)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawCentredString(x + w / 2, y + h - 63, "Codigo Cliente: 458432252")
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.setFont("Helvetica", 8)
    pdf.drawString(x + 10, y + h - 63, f"No. {index}")

    section_y = y + h - 87
    pdf.setFillColor(MINT)
    pdf.roundRect(x + 8, section_y, w - 16, 16, 4, stroke=0, fill=1)
    pdf.setFillColor(DARK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x + 14, section_y + 5, "INFORMACION DEL CLIENTE")
    _draw_value_pair(pdf, x + 14, section_y - 14, "Casa", _casa_label(vivienda, manzana), 62 * mm)
    _draw_value_pair(pdf, x + 82 * mm, section_y - 14, "Cedula", vivienda.cedula or "N/A", 50 * mm)
    _draw_value_pair(pdf, x + 14, section_y - 39, "Propietario", vivienda.propietario[:52], 125 * mm)

    section_y -= 66
    pdf.setFillColor(ROYAL_BLUE)
    pdf.roundRect(x + 8, section_y, w - 16, 16, 4, stroke=0, fill=1)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x + 14, section_y + 5, "LECTURAS Y CONSUMO")
    _draw_value_pair(pdf, x + 14, section_y - 14, "Lectura anterior", _format_reading(factura.lectura_anterior), 42 * mm)
    _draw_value_pair(pdf, x + 62 * mm, section_y - 14, "Lectura actual", _format_reading(factura.lectura_actual), 42 * mm)
    _draw_value_pair(pdf, x + 110 * mm, section_y - 14, "Consumo kWh", _format_reading(factura.consumo), 35 * mm)
    _draw_value_pair(pdf, x + 14, section_y - 39, "Subsidiado", _format_reading(factura.kwh_subsidiados), 42 * mm)
    _draw_value_pair(pdf, x + 62 * mm, section_y - 39, "Sin subsidio", _format_reading(factura.kwh_excedente), 42 * mm)

    section_y -= 70
    pdf.setFillColor(MINT)
    pdf.roundRect(x + 8, section_y, w - 16, 16, 4, stroke=0, fill=1)
    pdf.setFillColor(DARK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x + 14, section_y + 5, "DETALLE DE COBRO")
    detail = [
        ("Valor subsidio", _format_money(factura.costo_subsidiado)),
        ("Valor sin subsidio", _format_money(factura.costo_excedente)),
        ("Toma de lectura", _format_money(factura.cargo_toma_lectura)),
        ("Alumbrado publico", _format_money(factura.cargo_alumbrado)),
        ("Seguridad", _format_money(factura.cargo_seguridad)),
        ("Administracion", _format_money(factura.cargo_administracion)),
    ]
    dy = section_y - 11
    for label, value in detail:
        pdf.setFillColor(colors.HexColor("#334155"))
        pdf.setFont("Helvetica", 8)
        pdf.drawString(x + 14, dy, label)
        pdf.setFillColor(DARK)
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawRightString(x + w - 14, dy, value)
        dy -= 12

    pdf.setFillColor(ROYAL_BLUE)
    pdf.roundRect(x + 8, y + 12, w - 16, 28, 5, stroke=0, fill=1)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(x + 16, y + 29, "TOTAL A PAGAR")
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(x + w - 16, y + 27, _format_money(total_periodo))
    pdf.setFillColor(MINT)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x + 16, y + 17, f"Estado: {estado.upper()}")
    pdf.drawRightString(x + w - 16, y + 17, f"Generada: {datetime.now().strftime('%d/%m/%Y %H:%M')}")

def _build_factura_pdf(records: list[tuple[int, Factura, Vivienda, Optional[Manzana], int, int]], two_per_page: bool = True) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    margin = 12 * mm
    gap = 8 * mm
    receipt_h = (page_h - (margin * 2) - gap) / 2 if two_per_page else page_h - margin * 2
    receipt_w = page_w - margin * 2

    for pos, (index, factura, vivienda, manzana, ano_cobro, mes_cobro) in enumerate(records):
        slot = pos % (2 if two_per_page else 1)
        if pos > 0 and slot == 0:
            pdf.showPage()
        y = page_h - margin - receipt_h - (slot * (receipt_h + gap))
        _draw_receipt(pdf, index, factura, vivienda, manzana, margin, y, receipt_w, receipt_h, ano_cobro, mes_cobro)

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()

def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Usuario:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    usuario = db.query(Usuario).filter(Usuario.id == payload.get("id")).first()
    if not usuario or not usuario.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado o inactivo")
    if usuario.rol == RoleEnum.CLIENTE:
        allowed_prefixes = ("/api/v1/cliente",)
        allowed_paths = ("/api/v1/auth/me",)
        if not request.url.path.startswith(allowed_prefixes) and request.url.path not in allowed_paths:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso exclusivo del portal de propietario")
    return usuario

def require_roles(roles: list[RoleEnum]):
    def role_checker(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if current_user.rol not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para esta acción")
        return current_user
    return role_checker

def _normalize_username_part(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", ascii_text.lower())

def _cliente_cedula(current_user: Usuario) -> str:
    if current_user.email and current_user.email.endswith("@clientes.portales.local"):
        return current_user.email.split("@", 1)[0]
    digits = re.sub(r"\D+", "", current_user.username or "")
    if digits:
        return digits
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario cliente sin cédula asociada")

@router.post("/auth/register", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def register(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    existing = db.query(Usuario).filter(
        (Usuario.email == usuario.email) | (Usuario.username == usuario.username)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email o usuario ya existe")
    return auth_service.AuthService.create_usuario(db, usuario)

@router.post("/auth/login", response_model=Token)
def login(usuario: UsuarioLogin, db: Session = Depends(get_db)):
    db_usuario = auth_service.AuthService.authenticate_user(db, usuario.username, usuario.password)
    if not db_usuario:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    return auth_service.AuthService.create_token(db_usuario)

@router.get("/auth/me", response_model=UsuarioResponse)
def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user

@router.get("/usuarios", response_model=list[UsuarioResponse])
def get_usuarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return auth_service.AuthService.get_usuarios(db, skip, limit)

@router.post("/usuarios/generar-clientes")
def generar_usuarios_clientes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    viviendas = db.query(Vivienda).filter(Vivienda.cedula.isnot(None)).all()
    creados = 0
    actualizados = 0
    omitidos = 0
    usuarios = []
    omitidos_list = []
    processed_cedulas: set[str] = set()

    for vivienda in viviendas:
        cedula = re.sub(r"\D+", "", vivienda.cedula or "")
        propietario = (vivienda.propietario or "").strip()
        propietario_normalizado = unicodedata.normalize("NFKD", propietario).encode("ascii", "ignore").decode("ascii").upper()
        if not cedula:
            omitidos += 1
            omitidos_list.append({"casa": _casa_label(vivienda, vivienda.manzana), "propietario": propietario, "motivo": "Sin cédula"})
            continue
        if "OFICINA" in propietario_normalizado or "VACIA" in propietario_normalizado:
            omitidos += 1
            omitidos_list.append({"casa": _casa_label(vivienda, vivienda.manzana), "cedula": cedula, "propietario": propietario, "motivo": "Vivienda no asignada a propietario"})
            continue
        if cedula in processed_cedulas:
            omitidos += 1
            omitidos_list.append({"casa": _casa_label(vivienda, vivienda.manzana), "cedula": cedula, "propietario": propietario, "motivo": "Cédula repetida en viviendas"})
            continue
        processed_cedulas.add(cedula)
        email = f"{cedula}@clientes.portales.local"
        existing = db.query(Usuario).filter(
            (func.lower(Usuario.email) == email.lower()) | (Usuario.username == cedula)
        ).first()
        if existing:
            existing.email = email
            existing.username = cedula
            existing.nombre_completo = propietario
            existing.telefono = vivienda.telefono
            existing.whatsapp = vivienda.whatsapp or vivienda.telefono
            existing.rol = RoleEnum.CLIENTE
            existing.is_active = True
            actualizados += 1
            usuarios.append({"casa": _casa_label(vivienda, vivienda.manzana), "cedula": cedula, "username": cedula, "estado": "actualizado"})
            continue

        usuario = Usuario(
            email=email,
            username=cedula,
            hashed_password=get_password_hash(cedula),
            nombre_completo=propietario,
            telefono=vivienda.telefono,
            whatsapp=vivienda.whatsapp or vivienda.telefono,
            rol=RoleEnum.CLIENTE,
            is_active=True,
            is_superuser=False,
        )
        db.add(usuario)
        creados += 1
        usuarios.append({"casa": _casa_label(vivienda, vivienda.manzana), "cedula": cedula, "username": cedula, "estado": "creado"})

    db.commit()
    return {"creados": creados, "actualizados": actualizados, "omitidos": omitidos, "usuarios": usuarios, "omitidos_list": omitidos_list}

@router.put("/usuarios/{usuario_id}", response_model=UsuarioResponse)
def update_usuario(
    usuario_id: int,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    return auth_service.AuthService.update_usuario(db, usuario_id, data.dict(exclude_unset=True))

@router.get("/manzanas", response_model=list[ManzanaResponse])
def get_manzanas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return manzana_service.ManzanaService.get_all(db)

@router.post("/manzana", response_model=ManzanaResponse, status_code=status.HTTP_201_CREATED)
def create_manzana(
    data: ManzanaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    return manzana_service.ManzanaService.create_manzana(db, data)

@router.get("/viviendas", response_model=list[ViviendaResponse])
def get_viviendas(
    skip: int = 0,
    limit: int = 100,
    manzana_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return vivienda_service.ViviendaService.get_viviendas(db, skip, limit, manzana_id)

@router.get("/viviendas/{vivienda_id}", response_model=ViviendaResponse)
def get_vivienda(
    vivienda_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return vivienda_service.ViviendaService.get_vivienda(db, vivienda_id)

@router.post("/vivienda", response_model=ViviendaResponse, status_code=status.HTTP_201_CREATED)
def create_vivienda(
    data: ViviendaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    try:
        return vivienda_service.ViviendaService.create_vivienda(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

@router.put("/viviendas/{vivienda_id}", response_model=ViviendaResponse)
def update_vivienda(
    vivienda_id: int,
    data: ViviendaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    try:
        updated = vivienda_service.ViviendaService.update_vivienda(db, vivienda_id, data.dict(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vivienda no encontrada")
    return updated

@router.delete("/viviendas/{vivienda_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vivienda(
    vivienda_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    try:
        deleted = vivienda_service.ViviendaService.delete_vivienda(db, vivienda_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vivienda no encontrada")
    return None

@router.get("/viviendas/buscar", response_model=list[ViviendaResponse])
def buscar_vivienda_por_cedula(
    cedula: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    if not cedula:
        return []
    return vivienda_service.ViviendaService.buscar_por_cedula(db, cedula)

@router.get("/tarifas", response_model=list[TarifaResponse])
def get_tarifas(
    ano: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_tarifas(db, ano)

@router.post("/tarifa", response_model=TarifaResponse, status_code=status.HTTP_201_CREATED)
def create_tarifa(
    data: TarifaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    return factura_service.FacturaService.create_tarifa(db, data)

@router.put("/tarifas/{tarifa_id}", response_model=TarifaResponse)
def update_tarifa(
    tarifa_id: int,
    data: TarifaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    return factura_service.FacturaService.update_tarifa(db, tarifa_id, data.dict(exclude_unset=True))

@router.get("/lecturas", response_model=list[LecturaResponse])
def get_lecturas(
    vivienda_id: Optional[int] = None,
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_lecturas(db, vivienda_id, ano, mes)

@router.get("/lecturas/planilla", response_model=list[LecturaPlanillaRow])
def get_lecturas_planilla(
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    try:
        return factura_service.FacturaService.get_planilla_lecturas(db, ano, mes)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

@router.post("/lectura", response_model=LecturaResponse, status_code=status.HTTP_201_CREATED)
def create_lectura(
    data: LecturaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    try:
        return factura_service.FacturaService.create_lectura(db, data, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

@router.post("/lecturas/borrador", response_model=LecturaResponse, status_code=status.HTTP_201_CREATED)
def guardar_lectura_borrador(
    data: LecturaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    try:
        return factura_service.FacturaService.guardar_lectura_borrador(db, data, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

@router.post("/facturacion/aprobar", response_model=LecturaResponse, status_code=status.HTTP_201_CREATED)
def aprobar_lectura_facturacion(
    data: LecturaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    try:
        return factura_service.FacturaService.aprobar_lectura_facturacion(db, data, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

@router.post("/lectura/offline", response_model=LecturaResponse, status_code=status.HTTP_201_CREATED)
def create_lectura_offline(
    data: LecturaCreate,
    db: Session = Depends(get_db)
):
    data.sincronizado = False
    return factura_service.FacturaService.create_lectura(db, data, None)

@router.get("/facturas", response_model=list[FacturaResponse])
def get_facturas(
    vivienda_id: Optional[int] = None,
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    estado: Optional[str] = None,
    ano_cobro: Optional[int] = None,
    mes_cobro: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_facturas(db, vivienda_id, ano, mes, estado, ano_cobro, mes_cobro)

@router.get("/facturas/pdf-masivo")
def get_facturas_pdf_masivo(
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    ano_cobro: Optional[int] = None,
    mes_cobro: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    facturas = factura_service.FacturaService.get_facturas(db, None, ano, mes, None, ano_cobro, mes_cobro)
    if not facturas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No hay facturas para exportar")

    viviendas = {
        vivienda.id: vivienda
        for vivienda in db.query(Vivienda).filter(Vivienda.id.in_([factura.vivienda_id for factura in facturas])).all()
    }
    manzanas = {manzana.id: manzana for manzana in db.query(Manzana).all()}
    facturas_ordenadas = sorted(
        facturas,
        key=lambda factura: (
            viviendas.get(factura.vivienda_id).manzana_id if viviendas.get(factura.vivienda_id) else 0,
            str(viviendas.get(factura.vivienda_id).numero_casa).zfill(3) if viviendas.get(factura.vivienda_id) else "",
        ),
    )

    records = []
    for index, factura in enumerate(facturas_ordenadas, start=1):
        vivienda = viviendas.get(factura.vivienda_id)
        if not vivienda:
            continue
        cobro_ano = ano_cobro if ano_cobro is not None else factura.ano + (1 if factura.mes == 12 else 0)
        cobro_mes = mes_cobro if mes_cobro is not None else (1 if factura.mes == 12 else factura.mes + 1)
        records.append((index, factura, vivienda, manzanas.get(vivienda.manzana_id), cobro_ano, cobro_mes))

    pdf_bytes = _build_factura_pdf(records, two_per_page=True)
    filename = f"recibos_{ano_cobro or ano}_{str(mes_cobro or mes).zfill(2)}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# Paz y Salvo PDF (sello PAGADO en marca de agua)
def _build_paz_y_salvo_pdf(vivienda: Vivienda, manzana: Optional[Manzana]) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4

    # Marca de agua "PAGADO" en diagonal, grande y semitransparente
    pdf.saveState()
    try:
        pdf.setFillAlpha(0.12)
    except Exception:
        pass
    pdf.setFillColor(colors.HexColor("#16A34A"))
    pdf.translate(page_w / 2, page_h / 2)
    pdf.rotate(30)
    pdf.setFont("Helvetica-Bold", 140)
    pdf.drawCentredString(0, -40, "PAGADO")
    pdf.restoreState()

    # Marco decorativo
    pdf.setStrokeColor(ROYAL_BLUE)
    pdf.setLineWidth(2)
    pdf.roundRect(15 * mm, 15 * mm, page_w - 30 * mm, page_h - 30 * mm, 6, stroke=1, fill=0)
    pdf.setStrokeColor(colors.HexColor("#94A3B8"))
    pdf.setLineWidth(0.6)
    pdf.roundRect(18 * mm, 18 * mm, page_w - 36 * mm, page_h - 36 * mm, 5, stroke=1, fill=0)

    # Encabezado
    pdf.setFillColor(ROYAL_BLUE)
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawCentredString(page_w / 2, page_h - 40 * mm, "PORTALES DEL PARAISO")
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(page_w / 2, page_h - 47 * mm, "Administracion de servicio de energia electrica")
    pdf.drawCentredString(page_w / 2, page_h - 53 * mm, "Codigo Cliente: 458432252")

    # Título
    pdf.setStrokeColor(ROYAL_BLUE)
    pdf.setLineWidth(1)
    pdf.line(40 * mm, page_h - 60 * mm, page_w - 40 * mm, page_h - 60 * mm)
    pdf.setFillColor(DARK)
    pdf.setFont("Helvetica-Bold", 28)
    pdf.drawCentredString(page_w / 2, page_h - 78 * mm, "PAZ Y SALVO")
    pdf.setFillColor(colors.HexColor("#64748B"))
    pdf.setFont("Helvetica-Oblique", 11)
    pdf.drawCentredString(page_w / 2, page_h - 86 * mm, "Servicio de Energia Electrica")

    # Fecha y número
    hoy = datetime.now()
    numero = f"PYS-{hoy.strftime('%Y%m%d')}-{vivienda.id:04d}"
    pdf.setFillColor(DARK)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(25 * mm, page_h - 100 * mm, f"Numero: {numero}")
    pdf.drawRightString(page_w - 25 * mm, page_h - 100 * mm, f"Fecha de expedicion: {hoy.strftime('%d/%m/%Y')}")

    # Cuerpo
    casa_label = f"Manzana {manzana.codigo if manzana else vivienda.manzana_id} - Casa {vivienda.numero_casa}"
    propietario = (vivienda.propietario or "").strip().upper()
    cedula = vivienda.cedula or "N/A"

    body_y = page_h - 120 * mm
    pdf.setFont("Helvetica", 12)
    pdf.setFillColor(DARK)

    lineas = [
        "La administracion de la comunidad PORTALES DEL PARAISO hace constar que:",
        "",
        f"El(la) senor(a) {propietario},",
        f"identificado(a) con cedula de ciudadania No. {cedula},",
        f"propietario(a) del inmueble ubicado en {casa_label}",
        "de la comunidad PORTALES DEL PARAISO,",
        "",
        "se encuentra a PAZ Y SALVO por todo concepto relacionado con el",
        "servicio de energia electrica administrado por la comunidad,",
        f"a la fecha de expedicion del presente documento ({hoy.day} de {_month_name(hoy.month).lower()} de {hoy.year}).",
        "",
        "El presente paz y salvo se expide a solicitud del(la) interesado(a)",
        "para los fines que estime convenientes.",
    ]
    line_h = 16
    for i, linea in enumerate(lineas):
        if linea.startswith("El(la) senor(a)") or linea.startswith("identificado") or linea.startswith("propietario"):
            pdf.setFont("Helvetica-Bold", 12)
        else:
            pdf.setFont("Helvetica", 12)
        pdf.drawString(28 * mm, body_y - i * line_h, linea)

    # Firma
    firma_y = 55 * mm
    pdf.setStrokeColor(DARK)
    pdf.setLineWidth(0.7)
    pdf.line(page_w / 2 - 45 * mm, firma_y, page_w / 2 + 45 * mm, firma_y)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.setFillColor(DARK)
    pdf.drawCentredString(page_w / 2, firma_y - 12, "ADMINISTRACION")
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.drawCentredString(page_w / 2, firma_y - 24, "PORTALES DEL PARAISO")

    # Pie
    pdf.setFont("Helvetica-Oblique", 8)
    pdf.setFillColor(colors.HexColor("#94A3B8"))
    pdf.drawCentredString(page_w / 2, 24 * mm, f"Documento generado electronicamente el {hoy.strftime('%d/%m/%Y %H:%M')}")
    pdf.drawCentredString(page_w / 2, 20 * mm, f"Verificacion: {numero}")

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/viviendas/{vivienda_id}/paz-y-salvo")
def get_paz_y_salvo(
    vivienda_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    vivienda = db.query(Vivienda).filter(Vivienda.id == vivienda_id).first()
    if not vivienda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vivienda no encontrada")
    manzana = db.query(Manzana).filter(Manzana.id == vivienda.manzana_id).first()
    pdf_bytes = _build_paz_y_salvo_pdf(vivienda, manzana)
    cedula_safe = (vivienda.cedula or "sincedula").replace(" ", "")
    filename = f"paz-y-salvo-{cedula_safe}-{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/facturas/importar-historico/plantilla")
def get_plantilla_importar_historico(
    current_user: Usuario = Depends(get_current_user)
):
    columnas = [
        "CEDULA", "ANO", "MES_CONSUMO",
        "L_ANTERIOR", "L_ACTUAL",
        "PRECIO_KWH_SUBSIDIADO", "PRECIO_KWH_NO_SUBSIDIADO", "LIMITE_SUBSIDIO",
        "CARGO_TOMA_LECTURA", "CARGO_ALUMBRADO", "CARGO_SEGURIDAD", "CARGO_ADMINISTRACION",
        "VALOR_PAGADO", "FECHA_PAGO", "VALOR_COBRADO_HOJA",
    ]
    ejemplo = [
        "30004757", "2025", "8",
        "", "4",
        "360.35", "777", "184",
        "4000", "6000", "2000", "2000",
        "", "", "10000",
    ]
    contenido = ",".join(columnas) + "\r\n" + ",".join(ejemplo) + "\r\n"
    return StreamingResponse(
        BytesIO(contenido.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="plantilla_historico.csv"'}
    )


@router.post("/facturas/importar-historico", response_model=HistoricoImportResponse)
def importar_historico(
    rows: list[HistoricoImportRow],
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    resultado = factura_service.FacturaService.importar_historico(db, rows, current_user.id)
    return resultado


@router.get("/facturas/pdf-masivo-mes")
def get_facturas_pdf_masivo_solo_mes(
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    ano_cobro: Optional[int] = None,
    mes_cobro: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    facturas = factura_service.FacturaService.get_facturas(db, None, ano, mes, None, ano_cobro, mes_cobro)
    if not facturas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No hay facturas para exportar")

    viviendas = {
        v.id: v for v in db.query(Vivienda).filter(
            Vivienda.id.in_([f.vivienda_id for f in facturas])
        ).all()
    }
    manzanas = {m.id: m for m in db.query(Manzana).all()}
    facturas_ordenadas = sorted(
        facturas,
        key=lambda f: (
            viviendas.get(f.vivienda_id).manzana_id if viviendas.get(f.vivienda_id) else 0,
            str(viviendas.get(f.vivienda_id).numero_casa).zfill(3) if viviendas.get(f.vivienda_id) else "",
        ),
    )

    records = []
    for index, factura in enumerate(facturas_ordenadas, start=1):
        vivienda = viviendas.get(factura.vivienda_id)
        if not vivienda:
            continue
        cobro_ano = ano_cobro if ano_cobro is not None else factura.ano + (1 if factura.mes == 12 else 0)
        cobro_mes = mes_cobro if mes_cobro is not None else (1 if factura.mes == 12 else factura.mes + 1)
        records.append((index, _factura_solo_mes(db, factura, vivienda), vivienda, manzanas.get(vivienda.manzana_id), cobro_ano, cobro_mes))

    pdf_bytes = _build_factura_pdf(records, two_per_page=True)
    filename = f"recibos_solo_mes_{ano_cobro or ano}_{str(mes_cobro or mes).zfill(2)}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/facturas/{factura_id}", response_model=FacturaResponse)
def get_factura(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_factura(db, factura_id)

@router.get("/facturas/{factura_id}/pdf")
def get_factura_pdf(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    vivienda = db.query(Vivienda).filter(Vivienda.id == factura.vivienda_id).first()
    if not vivienda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vivienda no encontrada")
    manzana = db.query(Manzana).filter(Manzana.id == vivienda.manzana_id).first()
    ano_cobro, mes_cobro = _factura_periodo_cobro(factura)
    pdf_bytes = _build_factura_pdf([(1, factura, vivienda, manzana, ano_cobro, mes_cobro)], two_per_page=False)
    cedula = (vivienda.cedula or "sin-cedula").replace(" ", "")
    filename = f"factura-{cedula} {_month_name(mes_cobro)} - {ano_cobro}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

def _factura_solo_mes(db: Session, factura: Factura, vivienda: Vivienda) -> Factura:
    """Devuelve una copia transitoria de la factura donde el consumo es SOLO el del mes
    (lectura_actual del periodo - lectura_actual del periodo inmediato anterior). No persiste."""
    lectura_periodo = db.query(Lectura).filter(
        Lectura.vivienda_id == factura.vivienda_id,
        Lectura.ano == factura.ano,
        Lectura.mes == factura.mes,
    ).first()
    if not lectura_periodo or lectura_periodo.lectura_actual is None:
        return factura

    lectura_anterior_real = lectura_periodo.lectura_anterior or 0
    consumo_real = max(0, (lectura_periodo.lectura_actual or 0) - lectura_anterior_real)

    tarifa = factura_service.FacturaService.get_tarifa_efectiva(db, factura.ano, factura.mes)
    if not tarifa:
        return factura

    lectura_shim = Lectura(
        vivienda_id=factura.vivienda_id,
        ano=factura.ano,
        mes=factura.mes,
        lectura_anterior=lectura_anterior_real,
        lectura_actual=lectura_periodo.lectura_actual,
        consumo=consumo_real,
    )
    calc = factura_service.FacturaService.calcular_factura(
        vivienda, lectura_shim, tarifa, saldo_anterior=0, consumo_override=consumo_real
    )
    copia = Factura(
        id=factura.id,
        numero_factura=factura.numero_factura,
        vivienda_id=factura.vivienda_id,
        tarifa_id=factura.tarifa_id,
        ano=factura.ano,
        mes=factura.mes,
        lectura_anterior=calc["lectura_anterior"],
        lectura_actual=calc["lectura_actual"],
        consumo=calc["consumo"],
        kwh_subsidiados=calc["kwh_subsidiados"],
        kwh_excedente=calc["kwh_excedente"],
        costo_subsidiado=calc["costo_subsidiado"],
        costo_excedente=calc["costo_excedente"],
        subtotal_energia=calc["subtotal_energia"],
        cargo_alumbrado=calc["cargo_alumbrado"],
        cargo_seguridad=calc["cargo_seguridad"],
        cargo_toma_lectura=calc["cargo_toma_lectura"],
        cargo_administracion=calc["cargo_administracion"],
        subtotal=calc["subtotal"],
        saldo_anterior=0,
        total=calc["subtotal"],
        estado=factura.estado,
    )
    return copia


@router.get("/facturas/{factura_id}/pdf-mes")
def get_factura_pdf_solo_mes(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    vivienda = db.query(Vivienda).filter(Vivienda.id == factura.vivienda_id).first()
    if not vivienda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vivienda no encontrada")
    manzana = db.query(Manzana).filter(Manzana.id == vivienda.manzana_id).first()
    ano_cobro, mes_cobro = _factura_periodo_cobro(factura)
    factura_mes = _factura_solo_mes(db, factura, vivienda)
    pdf_bytes = _build_factura_pdf([(1, factura_mes, vivienda, manzana, ano_cobro, mes_cobro)], two_per_page=False)
    cedula = (vivienda.cedula or "sin-cedula").replace(" ", "")
    filename = f"factura-solo-mes-{cedula} {_month_name(mes_cobro)} - {ano_cobro}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/factura", response_model=FacturaResponse, status_code=status.HTTP_201_CREATED)
def create_factura(
    data: FacturaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.create_factura(db, data, current_user.id)

@router.post("/facturas/generar-masivo", response_model=list[FacturaResponse])
def generar_facturas_masivo(
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    return factura_service.FacturaService.generar_facturas_masivo(db, ano, mes, current_user.id)

@router.put("/facturas/{factura_id}", response_model=FacturaResponse)
def update_factura(
    factura_id: int,
    data: FacturaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    if current_user.rol == RoleEnum.LECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Los lectores no pueden modificar facturas")
    return factura_service.FacturaService.update_factura(db, factura_id, data.dict(exclude_unset=True))

@router.delete("/control-cobros/{vivienda_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_control_cobro(
    vivienda_id: int,
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    try:
        factura_service.FacturaService.delete_registro_cobro(db, vivienda_id, ano, mes)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return None

@router.post("/facturas/{factura_id}/pago", response_model=PagoResponse, status_code=status.HTTP_201_CREATED)
def registrar_pago(
    factura_id: int,
    data: PagoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.registrar_pago(db, factura_id, data, current_user.id)

@router.post("/pagos/importar", response_model=PagoImportResponse)
def importar_pagos(
    data: list[PagoImportData],
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.importar_pagos(db, data, current_user.id)

@router.get("/pagos", response_model=list[PagoDetalleResponse])
def get_pagos(
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    q: Optional[str] = None,
    manzana_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    from sqlalchemy import or_

    query = db.query(models.Pago).outerjoin(models.Factura, models.Pago.factura_id == models.Factura.id).outerjoin(
        models.Vivienda,
        or_(models.Pago.vivienda_id == models.Vivienda.id, models.Factura.vivienda_id == models.Vivienda.id)
    ).outerjoin(models.Manzana, models.Vivienda.manzana_id == models.Manzana.id)

    if ano and mes:
        query = query.filter(
            or_(
                (models.Pago.periodo_ano == ano) & (models.Pago.periodo_mes == mes),
                (models.Factura.ano == ano) & (models.Factura.mes == mes),
                (
                    models.Pago.factura_id.is_(None)
                    & (func.extract("year", models.Pago.fecha_pago) == ano)
                    & (func.extract("month", models.Pago.fecha_pago) == mes)
                ),
            )
        )
    elif ano:
        query = query.filter(
            or_(
                models.Pago.periodo_ano == ano,
                models.Factura.ano == ano,
                (models.Pago.factura_id.is_(None) & (func.extract("year", models.Pago.fecha_pago) == ano)),
            )
        )

    if manzana_id:
        query = query.filter(models.Vivienda.manzana_id == manzana_id)

    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(models.Vivienda.propietario).like(term),
                func.lower(models.Vivienda.cedula).like(term),
                func.lower(models.Vivienda.numero_casa).like(term),
                func.lower(models.Manzana.codigo).like(term),
                func.lower(models.Factura.numero_factura).like(term),
                func.lower(models.Pago.referencia).like(term),
                func.lower(models.Pago.concepto).like(term),
            )
        )
    
    pagos = query.order_by(models.Pago.fecha_pago.desc(), models.Pago.id.desc()).all()
    
    result = []
    for pago in pagos:
        pago_dict = {
            "id": pago.id,
            "factura_id": pago.factura_id,
            "monto": pago.monto,
            "concepto": pago.concepto,
            "metodo_pago": pago.metodo_pago,
            "fecha_pago": pago.fecha_pago,
            "referencia": pago.referencia,
            "tipo_pago": pago.tipo_pago,
            "periodo_ano": pago.periodo_ano,
            "periodo_mes": pago.periodo_mes,
            "created_at": pago.created_at,
            "vivienda_id": None,
            "numero_casa": None,
            "propietario": None,
            "cedula": None,
            "manzana_id": None,
            "manzana_codigo": None,
            "numero_factura": None,
            "ano": None,
            "mes": None,
            "total_factura": None,
        }
        
        vivienda = None
        if pago.factura and pago.factura.vivienda:
            vivienda = pago.factura.vivienda
        elif pago.vivienda:
            vivienda = pago.vivienda
        
        if vivienda:
            pago_dict["vivienda_id"] = vivienda.id
            pago_dict["numero_casa"] = vivienda.numero_casa
            pago_dict["propietario"] = vivienda.propietario
            pago_dict["cedula"] = vivienda.cedula
            pago_dict["manzana_id"] = vivienda.manzana_id
            pago_dict["manzana_codigo"] = vivienda.manzana.codigo if vivienda.manzana else None
        if pago.factura:
            pago_dict["ano"] = pago.factura.ano
            pago_dict["mes"] = pago.factura.mes
            pago_dict["total_factura"] = pago.factura.total
            pago_dict["numero_factura"] = pago.factura.numero_factura
        else:
            pago_dict["ano"] = pago.periodo_ano
            pago_dict["mes"] = pago.periodo_mes
        
        result.append(pago_dict)
    
    return result

@router.delete("/pagos/all", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_pagos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    db.query(models.Pago).delete()
    db.commit()
    return None

@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_dashboard(db)

@router.get("/reportes/cartera", response_model=list[ReporteCarteraResponse])
def get_reporte_cartera(
    ano: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_reporte_cartera(db, ano)

@router.get("/reportes/estado-cuenta/{vivienda_id}")
def get_estado_cuenta(
    vivienda_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_estado_cuenta(db, vivienda_id)

@router.get("/reportes/consumo")
def get_reporte_consumo(
    ano: int,
    mes: int,
    manzana_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_reporte_consumo(db, ano, mes, manzana_id)

@router.get("/reportes/pagos")
def get_reporte_pagos(
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_reporte_pagos(db, ano, mes)

def _cliente_factura_response(factura: Factura, vivienda: Vivienda, manzana: Optional[Manzana]) -> ClienteFacturaResponse:
    ano_cobro, mes_cobro = _factura_periodo_cobro(factura)
    total = float(factura.total or 0)
    pagado = float(factura.total_pagado or 0)
    estado = factura.estado.value if hasattr(factura.estado, "value") else str(factura.estado)
    return ClienteFacturaResponse(
        id=factura.id,
        vivienda_id=vivienda.id,
        casa=_casa_label(vivienda, manzana),
        propietario=vivienda.propietario,
        cedula=vivienda.cedula,
        ano=factura.ano,
        mes=factura.mes,
        ano_cobro=ano_cobro,
        mes_cobro=mes_cobro,
        numero_factura=factura.numero_factura,
        lectura_anterior=factura.lectura_anterior,
        lectura_actual=factura.lectura_actual,
        consumo=factura.consumo,
        total=total,
        total_pagado=pagado,
        saldo=total - pagado,
        estado=estado,
        fecha_emision=factura.fecha_emision,
    )

def _cliente_facturas(db: Session, current_user: Usuario, ano: Optional[int] = None, mes: Optional[int] = None, estado: Optional[str] = None) -> list[ClienteFacturaResponse]:
    if current_user.rol != RoleEnum.CLIENTE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Endpoint exclusivo para clientes")
    cedula = _cliente_cedula(current_user)
    viviendas = db.query(Vivienda).filter(Vivienda.cedula == cedula).all()
    if not viviendas:
        return []
    viviendas_by_id = {vivienda.id: vivienda for vivienda in viviendas}
    query = db.query(Factura).filter(Factura.vivienda_id.in_(viviendas_by_id.keys()))
    if estado:
        query = query.filter(Factura.estado == estado)
    facturas = query.order_by(Factura.ano.desc(), Factura.mes.desc()).all()
    manzanas = {manzana.id: manzana for manzana in db.query(Manzana).all()}
    rows = []
    for factura in facturas:
        ano_cobro, mes_cobro = _factura_periodo_cobro(factura)
        if ano is not None and ano_cobro != ano:
            continue
        if mes is not None and mes_cobro != mes:
            continue
        vivienda = viviendas_by_id.get(factura.vivienda_id)
        if vivienda:
            rows.append(_cliente_factura_response(factura, vivienda, manzanas.get(vivienda.manzana_id)))
    return rows

@router.get("/cliente/facturas", response_model=list[ClienteFacturaResponse])
def get_cliente_facturas(
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return _cliente_facturas(db, current_user, ano, mes, estado)

@router.get("/cliente/perfil", response_model=ClientePerfilResponse)
def get_cliente_perfil(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    if current_user.rol != RoleEnum.CLIENTE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Endpoint exclusivo para clientes")
    cedula = _cliente_cedula(current_user)
    vivienda = db.query(Vivienda).filter(Vivienda.cedula == cedula).first()
    if not vivienda:
        return ClientePerfilResponse(
            nombre_completo=current_user.nombre_completo,
            cedula=cedula,
            telefono=current_user.telefono,
            whatsapp=current_user.whatsapp,
            email=current_user.email,
        )
    return ClientePerfilResponse(
        nombre_completo=vivienda.propietario or current_user.nombre_completo,
        cedula=cedula,
        casa=_casa_label(vivienda, vivienda.manzana),
        telefono=vivienda.telefono or current_user.telefono,
        whatsapp=vivienda.whatsapp or current_user.whatsapp,
        email=vivienda.email or current_user.email,
    )

@router.get("/cliente/resumen", response_model=ClienteResumenResponse)
def get_cliente_resumen(
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    facturas = _cliente_facturas(db, current_user, ano, mes)
    cedula = _cliente_cedula(current_user)
    total_facturado = sum(f.total for f in facturas)
    total_pagado = sum(f.total_pagado for f in facturas)
    total_adeudado = sum(max(f.saldo, 0) for f in facturas)
    return ClienteResumenResponse(
        propietario=current_user.nombre_completo,
        cedula=cedula,
        total_facturado=total_facturado,
        total_pagado=total_pagado,
        total_adeudado=total_adeudado,
        facturas_pendientes=sum(1 for f in facturas if f.saldo > 1 and f.total_pagado <= 0),
        facturas_pagadas=sum(1 for f in facturas if f.saldo <= 1),
        facturas_parciales=sum(1 for f in facturas if f.saldo > 1 and f.total_pagado > 0),
        al_dia=total_adeudado <= 1,
        facturas=facturas,
    )

@router.get("/cliente/facturas/{factura_id}/pdf")
def get_cliente_factura_pdf(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    cedula = _cliente_cedula(current_user)
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    vivienda = db.query(Vivienda).filter(Vivienda.id == factura.vivienda_id, Vivienda.cedula == cedula).first()
    if not vivienda:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Factura no pertenece al cliente")
    manzana = db.query(Manzana).filter(Manzana.id == vivienda.manzana_id).first()
    ano_cobro, mes_cobro = _factura_periodo_cobro(factura)
    pdf_bytes = _build_factura_pdf([(1, factura, vivienda, manzana, ano_cobro, mes_cobro)], two_per_page=False)
    filename = f"factura-{cedula} {_month_name(mes_cobro)} - {ano_cobro}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/facturacion-mensual", response_model=list[FacturacionMensualResponse])
def get_facturacion_mensual(
    ano_cobro: Optional[int] = None,
    mes_cobro: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    query = db.query(FacturacionMensual)
    if ano_cobro is not None:
        query = query.filter(FacturacionMensual.ano_cobro == ano_cobro)
    if mes_cobro is not None:
        query = query.filter(FacturacionMensual.mes_cobro == mes_cobro)
    return query.order_by(FacturacionMensual.id.asc()).all()

@router.get("/configuraciones", response_model=list[ConfiguracionResponse])
def get_configuraciones(
    incluir_inactivas: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return configuracion_service.ConfiguracionService.get_configuraciones(db, incluir_inactivas)

@router.get("/configuraciones/actuales", response_model=list[ConfiguracionResponse])
def get_configuraciones_actuales(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return configuracion_service.ConfiguracionService.get_configuraciones(db, False)

@router.get("/configuraciones/historial-periodos", response_model=list[HistorialPeriodoResponse])
def get_historial_periodos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return configuracion_service.ConfiguracionService.get_historial_periodo(db)

@router.get("/configuraciones/{clave}", response_model=ConfiguracionResponse)
def get_configuracion(
    clave: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    config = configuracion_service.ConfiguracionService.get_configuracion(db, clave)
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configuración no encontrada")
    return config

@router.post("/configuraciones", response_model=ConfiguracionResponse, status_code=status.HTTP_201_CREATED)
def create_configuracion(
    data: ConfiguracionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    return configuracion_service.ConfiguracionService.set_configuracion(
        db, data.clave, data.valor, data.descripcion, data.anio, data.periodo_mes, data.periodo_corte
    )

@router.put("/configuraciones/periodo", response_model=ConfiguracionResponse, status_code=status.HTTP_201_CREATED)
def update_configuracion_periodo(
    anio: int,
    mes: str,
    periodo_actual: str,
    periodo_corte: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    return configuracion_service.ConfiguracionService.set_configuracion_periodo(
        db, anio, mes, periodo_actual, periodo_corte
    )

@router.put("/configuraciones/{clave}", response_model=ConfiguracionResponse)
def update_configuracion(
    clave: str,
    data: ConfiguracionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    return configuracion_service.ConfiguracionService.set_configuracion(
        db, clave, data.valor, data.descripcion, data.anio, data.periodo_mes, data.periodo_corte
    )

@router.delete("/configuraciones/{clave}", status_code=status.HTTP_204_NO_CONTENT)
def delete_configuracion(
    clave: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    if not configuracion_service.ConfiguracionService.delete_configuracion(db, clave):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configuración no encontrada")
