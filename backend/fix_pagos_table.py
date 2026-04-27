import sqlite3

db_path = 'portales_facturacion.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Desactivar foreign keys temporalmente
cursor.execute('PRAGMA foreign_keys = OFF')

# Crear tabla nueva sin FK en factura_id
create_sql = """CREATE TABLE pagos_new (
    id INTEGER NOT NULL, 
    factura_id INTEGER, 
    usuario_registra_id INTEGER, 
    monto FLOAT NOT NULL, 
    concepto VARCHAR(255), 
    metodo_pago VARCHAR(50), 
    fecha_pago DATETIME NOT NULL, 
    referencia VARCHAR(100), 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    PRIMARY KEY (id), 
    FOREIGN KEY(usuario_registra_id) REFERENCES usuarios (id)
)"""
cursor.execute(create_sql)

# Copiar los datos
cursor.execute('INSERT INTO pagos_new SELECT * FROM pagos')

# Eliminar la tabla vieja
cursor.execute('DROP TABLE pagos')

# Renombrar la nueva tabla
cursor.execute('ALTER TABLE pagos_new RENAME TO pagos')

# Reactivar foreign keys
cursor.execute('PRAGMA foreign_keys = ON')

conn.commit()

# Verificar
cursor.execute('PRAGMA table_info(pagos)')
print('Nueva estructura:')
for row in cursor.fetchall():
    print(row)

# Verificar pagos
cursor.execute('SELECT COUNT(*) FROM pagos WHERE factura_id IS NULL')
print(f'Pagos con factura_id NULL: {cursor.fetchone()[0]}')

cursor.execute('SELECT COUNT(*) FROM pagos WHERE factura_id = 0')
print(f'Pagos con factura_id = 0: {cursor.fetchone()[0]}')

conn.close()
print('\nListo! Tabla modificada.')
