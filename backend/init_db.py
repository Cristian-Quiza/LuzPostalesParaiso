import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine, Base, SessionLocal
from app.models.models import Usuario, Manzana, Vivienda, Tarifa, Configuracion
from app.utils.security import get_password_hash
from app.models.models import RoleEnum

def init_database():
    print("Creando tablas...")
    Base.metadata.create_all(bind=engine)
    print("Tablas creadas exitosamente")
    
    db = SessionLocal()
    
    try:
        existing_user = db.query(Usuario).filter(Usuario.username == "admin").first()
        if existing_user:
            print("El usuario admin ya existe")
        else:
            print("Creando usuario administrador...")
            admin = Usuario(
                email="admin@portales.com",
                username="admin",
                hashed_password=get_password_hash("admin123"),
                nombre_completo="Administrador Principal",
                telefono="+573001234567",
                whatsapp="+573001234567",
                rol=RoleEnum.SUPER_ADMIN,
                is_superuser=True,
                is_active=True
            )
            db.add(admin)
        
        print("Validando manzanas...")
        manzanas_objetivo = [
            ("MZ 183", "Manzana 183", "Primera manzana del conjunto"),
            ("MZ 184", "Manzana 184", "Segunda manzana del conjunto"),
            ("MZ 185", "Manzana 185", "Tercera manzana del conjunto"),
            ("MZ 186", "Manzana 186", "Cuarta manzana del conjunto"),
        ]
        for codigo, nombre, descripcion in manzanas_objetivo:
            if not db.query(Manzana).filter(Manzana.codigo == codigo).first():
                db.add(Manzana(codigo=codigo, nombre=nombre, descripcion=descripcion))
        db.commit()
        
        print("Validando viviendas de ejemplo...")
        propietarios_ejemplo = [
            ("Claudia Patricia Ocampo Restrepo", "40361567", "3133241618", "claudia@email.com"),
            ("María García", "23456789", "3132222222", "maria@email.com"),
            ("Carlos López", "34567890", "3133333333", "carlos@email.com"),
            ("Ana Martínez", "45678901", "3134444444", "ana@email.com"),
            ("Pedro Rodríguez", "56789012", "3135555555", "pedro@email.com"),
            ("Laura Sánchez", "67890123", "3136666666", "laura@email.com"),
            ("Miguel Torres", "78901234", "3137777777", "miguel@email.com"),
            ("Sofia Díaz", "89012345", "3138888888", "sofia@email.com"),
            ("Jorge Ruiz", "90123456", "3139999999", "jorge@email.com"),
            ("Carmen Flores", "01234567", "3131010101", "carmen@email.com"),
            ("Roberto Gómez", "11223344", "3131212121", "roberto@email.com"),
            ("Luisa Hernández", "22334455", "3131313131", "luisa@email.com"),
            ("Andrés Moreno", "33445566", "3131414141", "andres@email.com"),
            ("Diana Carolina", "44556677", "3131515151", "diana@email.com"),
            ("Fernando Castro", "55667788", "3131616161", "fernando@email.com"),
            ("Gloria Edith", "66778899", "3131717171", "gloria@email.com"),
            ("Harold Steven", "77889900", "3131818181", "harold@email.com"),
            ("Isabel Cristina", "88990011", "3131919191", "isabel@email.com"),
            ("Julián Andrés", "99001122", "3132020202", "julian@email.com"),
        ]
        
        manzanas_db = db.query(Manzana).order_by(Manzana.codigo).all()
        if db.query(Vivienda).count() == 0 and manzanas_db:
            viviendas = []
            for i, (nombre, cedula, tel, email) in enumerate(propietarios_ejemplo):
                manzana_idx = i % len(manzanas_db)
                numero_casa = (i % 5) + 1
                tiene_seguridad = i % 2 == 0
                
                v = Vivienda(
                    numero_casa=str(numero_casa),
                    manzana_id=manzanas_db[manzana_idx].id,
                    propietario=nombre,
                    cedula=cedula,
                    telefono=tel,
                    whatsapp=tel,
                    email=email,
                    direccion=f"Calle {numero_casa} # {i+10}-{i+20}",
                    tiene_alumbrado=True,
                    tiene_seguridad=tiene_seguridad,
                    tiene_toma_lectura=True,
                    tiene_administracion=False,
                    saldo_a_favor=0,
                    estado="activo"
                )
                viviendas.append(v)
            db.add_all(viviendas)
        
        print("Validando tarifas del mes actual...")
        from datetime import datetime
        now = datetime.now()
        tarifa_existente = db.query(Tarifa).filter(Tarifa.ano == now.year, Tarifa.mes == now.month).first()
        if not tarifa_existente:
            tarifa = Tarifa(
                ano=now.year,
                mes=now.month,
                costo_kwh_subsidiado=285.0,
                costo_kwh_pleno=582.0,
                consumo_tope_subsidiado=184,
                cargo_alumbrado=15000,
                cargo_seguridad=35000,
                cargo_toma_lectura=2000,
                cargo_administracion=0,
                fecha_limite_pago=20,
                intereses_mora=0.02
            )
            db.add(tarifa)
        
        print("Creando configuraciones generales...")
        periodo_mes = str(now.month).zfill(2)
        configuraciones = [
            Configuracion(clave="nombre_barrio", valor="PORTALES DEL PARAISO", descripcion="Nombre del conjunto residencial", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="lider_comunitario", valor="CRISTIAN DAVID QUIZA PAMPLONA", descripcion="Nombre del líder comunitario", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="macro_medidor", valor="84440422", descripcion="Número del macro medidor", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="codigo_cliente", valor="458432252", descripcion="Código de cliente del servicio", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="limite_subsidio", valor="184", descripcion="Límite de consumo subsidiado en kWh", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="precio_kwh_subsidiado", valor="369.77", descripcion="Precio por kWh con subsidio", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="precio_kwh_sin_subsidio", valor="783.00", descripcion="Precio por kWh sin subsidio", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="costo_toma_lectura", valor="4500", descripcion="Costo por toma de lectura", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="costo_alumbrado", valor="3000", descripcion="Costo de alumbrado público", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="costo_seguridad", valor="2000", descripcion="Costo de seguridad", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="periodo_anio", valor=str(now.year), descripcion="Año actual de facturación", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="periodo_mes", valor=periodo_mes, descripcion="Período de corte actual", anio=now.year, periodo_mes=periodo_mes),
            Configuracion(clave="periodo_actual", valor="FEBRERO01 - MARZO01", descripcion="Período a facturar (mes vencido)", anio=now.year, periodo_mes=periodo_mes),
        ]
        for c in configuraciones:
            existe = db.query(Configuracion).filter(
                Configuracion.clave == c.clave,
                Configuracion.anio == c.anio,
                Configuracion.periodo_mes == c.periodo_mes,
                Configuracion.activa == True
            ).first()
            if not existe:
                db.add(c)
        
        db.commit()
        print("Base de datos inicializada correctamente")
        print(f"Usuario: admin / Contraseña: admin123")
        
    except Exception as e:
        print(f"Error al inicializar: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_database()
