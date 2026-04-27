import sqlite3

db_path = 'portales_facturacion.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Agregar columna vivienda_id si no existe
try:
    cursor.execute('ALTER TABLE pagos ADD COLUMN vivienda_id INTEGER')
    print('Columna vivienda_id agregada')
except:
    print('Columna vivienda_id ya existe')

# Verificar
cursor.execute('PRAGMA table_info(pagos)')
print('Estructura actual:')
for row in cursor.fetchall():
    print(f'  {row}')

conn.commit()
conn.close()
print('\nListo!')
