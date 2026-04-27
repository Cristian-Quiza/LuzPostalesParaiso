from sqlalchemy.orm import Session
from typing import Optional
from datetime import timedelta

from app.models.models import Usuario, RoleEnum
from app.schemas.schemas import UsuarioCreate, UsuarioLogin, Token
from app.utils.security import verify_password, get_password_hash, create_access_token, decode_token
from app.core.config import settings

class AuthService:
    @staticmethod
    def authenticate_user(db: Session, username: str, password: str) -> Optional[Usuario]:
        usuario = db.query(Usuario).filter(Usuario.username == username).first()
        if not usuario:
            return None
        if not verify_password(password, usuario.hashed_password):
            return None
        if not usuario.is_active:
            return None
        return usuario
    
    @staticmethod
    def create_token(usuario: Usuario) -> Token:
        access_token = create_access_token(
            data={"sub": usuario.username, "id": usuario.id, "rol": usuario.rol.value},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return Token(
            access_token=access_token,
            token_type="bearer",
            usuario=usuario
        )
    
    @staticmethod
    def get_current_user(db: Session, token: str) -> Optional[Usuario]:
        payload = decode_token(token)
        if not payload:
            return None
        usuario = db.query(Usuario).filter(Usuario.id == payload.get("id")).first()
        return usuario
    
    @staticmethod
    def create_usuario(db: Session, usuario_data: UsuarioCreate) -> Usuario:
        hashed_password = get_password_hash(usuario_data.password)
        db_usuario = Usuario(
            email=usuario_data.email,
            username=usuario_data.username,
            hashed_password=hashed_password,
            nombre_completo=usuario_data.nombre_completo,
            telefono=usuario_data.telefono,
            whatsapp=usuario_data.whatsapp,
            rol=usuario_data.rol,
            is_superuser=usuario_data.rol == RoleEnum.SUPER_ADMIN
        )
        db.add(db_usuario)
        db.commit()
        db.refresh(db_usuario)
        return db_usuario
    
    @staticmethod
    def get_usuarios(db: Session, skip: int = 0, limit: int = 100):
        return db.query(Usuario).offset(skip).limit(limit).all()
    
    @staticmethod
    def get_usuario_by_id(db: Session, usuario_id: int):
        return db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    @staticmethod
    def update_usuario(db: Session, usuario_id: int, usuario_data: dict):
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            return None
        for key, value in usuario_data.items():
            if value is not None:
                setattr(usuario, key, value)
        db.commit()
        db.refresh(usuario)
        return usuario