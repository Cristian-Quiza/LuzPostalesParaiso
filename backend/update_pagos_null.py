import sqlite3

db_path = 'portales_facturacion.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Actualizar factura_id = 0 a NULL
cursor.execute('UPDATE pagos SET factura_id = NULL WHERE factura_id = 0')
conn.commit()

# Verificar
cursor.execute('SELECT COUNT(*) FROM pagos WHERE factura_id IS NULL')
print(f'Pagos con factura_id NULL: {cursor.fetchone()[0]}')

cursor.execute('SELECT COUNT(*) FROM pagos WHERE factura_id = 0')
print(f'Pagos con factura_id = 0: {cursor.fetchone()[0]}')

conn.close()
print('\nDatos actualizados!')
