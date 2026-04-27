from app.db.database import get_db
import sqlite3

db_path = 'portales_facturacion.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Ver la estructura de la tabla
cursor.execute('PRAGMA table_info(pagos)')
for row in cursor.fetchall():
    print(row)

print()

# Verificar si la columna es nullable
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='pagos'")
print('CREATE statement:')
print(cursor.fetchone()[0])

conn.close()
