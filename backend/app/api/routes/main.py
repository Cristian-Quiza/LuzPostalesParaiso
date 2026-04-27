from fastapi import APIRouter, Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.models import models
from app.models.models import Usuario, RoleEnum
from app.schemas.schemas import (
    UsuarioCreate, UsuarioResponse, UsuarioLogin, Token, 
    UsuarioUpdate, ManzanaCreate, ManzanaResponse, ViviendaCreate, 
    ViviendaResponse, ViviendaUpdate, TarifaCreate, TarifaResponse,
    TarifaUpdate, LecturaCreate, LecturaResponse, FacturaCreate,
    FacturaResponse, FacturaUpdate, PagoCreate, PagoResponse,
    DashboardResponse, ReporteCarteraResponse, ConfiguracionCreate,
    ConfiguracionResponse, HistorialPeriodoResponse, PagoImportData,
    PagoImportResponse, PagoDetalleResponse
)
from app.services import auth_service, factura_service, manzana_service, vivienda_service, configuracion_service
from app.utils.security import decode_token

router = APIRouter()
security = HTTPBearer()

def get_current_user(
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
    return usuario

def require_roles(roles: list[RoleEnum]):
    def role_checker(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if current_user.rol not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para esta acción")
        return current_user
    return role_checker

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
    return vivienda_service.ViviendaService.create_vivienda(db, data)

@router.put("/viviendas/{vivienda_id}", response_model=ViviendaResponse)
def update_vivienda(
    vivienda_id: int,
    data: ViviendaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN, RoleEnum.EDITOR]))
):
    return vivienda_service.ViviendaService.update_vivienda(db, vivienda_id, data.dict(exclude_unset=True))

@router.delete("/viviendas/{vivienda_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vivienda(
    vivienda_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles([RoleEnum.SUPER_ADMIN]))
):
    return vivienda_service.ViviendaService.delete_vivienda(db, vivienda_id)

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

@router.post("/lectura", response_model=LecturaResponse, status_code=status.HTTP_201_CREATED)
def create_lectura(
    data: LecturaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.create_lectura(db, data, current_user.id)

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
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_facturas(db, vivienda_id, ano, mes, estado)

@router.get("/facturas/{factura_id}", response_model=FacturaResponse)
def get_factura(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return factura_service.FacturaService.get_factura(db, factura_id)

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
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    query = db.query(models.Pago)
    
    from sqlalchemy import or_, and_
    
    if ano and mes:
        facturas_ids = db.query(models.Factura.id).filter(
            models.Factura.ano == ano,
            models.Factura.mes == mes
        ).all()
        factura_id_list = [f.id for f in facturas_ids]
        
        if factura_id_list:
            query = query.filter(
                or_(
                    models.Pago.factura_id.in_(factura_id_list),
                    models.Pago.factura_id.is_(None)
                )
            )
        else:
            query = query.filter(models.Pago.factura_id.is_(None))
    elif ano:
        facturas_ids = db.query(models.Factura.id).filter(models.Factura.ano == ano).all()
        factura_id_list = [f.id for f in facturas_ids]
        if factura_id_list:
            query = query.filter(
                or_(
                    models.Pago.factura_id.in_(factura_id_list),
                    models.Pago.factura_id.is_(None)
                )
            )
    
    pagos = query.order_by(models.Pago.fecha_pago.desc()).all()
    
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
            "created_at": pago.created_at,
            "vivienda_id": None,
            "numero_casa": None,
            "propietario": None,
            "cedula": None,
            "manzana_id": None,
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
            if pago.factura:
                pago_dict["ano"] = pago.factura.ano
                pago_dict["mes"] = pago.factura.mes
                pago_dict["total_factura"] = pago.factura.total
        
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