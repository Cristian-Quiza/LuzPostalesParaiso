import sqlite3

db_path = 'portales_facturacion.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Obtener todas las viviendas y sus cédulas
cursor.execute('SELECT id, cedula FROM viviendas WHERE cedula IS NOT NULL AND cedula != ""')
viviendas = {row[1].strip().replace(' ', ''): row[0] for row in cursor.fetchall()}
print(f'Viviendas con cédula: {len(viviendas)}')

# Obtener pagos sin vivienda_id
cursor.execute('SELECT id, concepto FROM pagos WHERE vivienda_id IS NULL')
pagos = cursor.fetchall()

print(f'Pagos sin vivienda_id: {len(pagos)}')

# Actualizar cada pago
actualizados = 0
for pago_id, concepto in pagos:
    # Intentar extraer la cédula del concepto (formato: "Ref: xxx | Cuenta: yyy")
    # Pero para pagos importados de Excel, el campo cliente viene en los datos
    # Así que por ahora solo actualizamos los que ya tienen factura_id vinculada a vivienda
    
    # Verificar si hay una factura asociada
    cursor.execute('SELECT vivienda_id FROM facturas WHERE id = (SELECT factura_id FROM pagos WHERE id = ?)', (pago_id,))
    result = cursor.fetchone()
    if result and result[0]:
        cursor.execute('UPDATE pagos SET vivienda_id = ? WHERE id = ?', (result[0], pago_id))
        actualizados += 1

conn.commit()
print(f'Pagos actualizados con vivienda_id de factura: {actualizados}')

# Verificar pagos restantes
cursor.execute('SELECT COUNT(*) FROM pagos WHERE vivienda_id IS NULL')
restantes = cursor.fetchone()[0]
print(f'Pagos restantes sin vivienda_id: {restantes}')

conn.close()
print('\nListo!')
