# Plan de Despliegue — Portales del Paraíso

Arquitectura aprobada: **frontend en Vercel + backend en otro proveedor**.

---

## 1. Pre-flight (hacer ANTES del primer deploy)

### 1.1 Rotar la contraseña de Supabase
La contraseña actual (`NXbqPAYMbAl2p6FW`) está en `.env` local. Aunque NO fue commiteada al repo, conviene rotarla porque:
- Estuvo en archivos locales que podrían sincronizarse con cualquier servicio en la nube.
- Buenas prácticas: rotar credenciales antes de cualquier push importante.

Pasos:
1. Entra a Supabase → **Settings → Database → Reset database password**.
2. Copia la nueva cadena `DATABASE_URL` (Connection Pooling, modo "Session").
3. Actualiza tu `backend/.env` local con la nueva URL.
4. La pondrás como variable de entorno en el host del backend (paso 3.2).

### 1.2 Generar SECRET_KEY de producción
En cualquier terminal con Python:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```
Copia el resultado. Lo configurarás como `SECRET_KEY` en el host del backend.

### 1.3 Crear `frontend/vercel.json` (SPA rewrite)
Vercel necesita saber que todas las rutas deben servir `index.html` (router SPA).

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 1.4 (Opcional pero recomendado) Endurecer admin inicial
- En `backend/init_db.py:148` la contraseña inicial del admin es `admin123`. Antes de correr en producción, cámbiala por una variable de entorno (`ADMIN_INITIAL_PASSWORD`).
- En `backend/app/api/routes/main.py:389` el endpoint `generar_usuarios_clientes` crea contraseñas iguales a la cédula. Considerar generar contraseñas aleatorias + enviarlas por WhatsApp.

---

## 2. Despliegue del backend (Railway recomendado)

Opciones equivalentes: Railway, Render, Fly.io. Recomiendo **Railway** por simplicidad.

### 2.1 Crear el servicio
1. Crear cuenta en railway.app y proyecto nuevo.
2. "Deploy from GitHub repo" → seleccionar `Cristian-Quiza/LuzPostalesParaiso`.
3. Servicio → settings:
   - **Root directory**: `backend`
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 2.2 Variables de entorno (Railway → Variables)
```
ENV=production
DATABASE_URL=<la cadena nueva de Supabase>
SECRET_KEY=<el secret aleatorio del paso 1.2>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
BACKEND_CORS_ORIGINS=https://<TU-PROYECTO>.vercel.app
USE_POSTGRES=true
```
Importante: `BACKEND_CORS_ORIGINS` debe ser la URL final del frontend en Vercel. Si todavía no la tienes, déjala vacía y configúrala después.

### 2.3 Verificar
- Railway debe darte una URL tipo `https://luz-portales-paraiso-backend.up.railway.app`.
- Prueba: `curl https://<tu-backend>.up.railway.app/health` → `{"status":"healthy"}`.
- `/api/v1/docs` debe responder **404** (porque ENV=production).

---

## 3. Despliegue del frontend (Vercel)

### 3.1 Importar el repo
1. Entra al proyecto que ya creaste: https://vercel.com/cristian-quizas-projects/project-3gsgb
2. Settings → Git → Connect a `Cristian-Quiza/LuzPostalesParaiso`.
3. Build & Development Settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `dist` (default)
   - **Install Command**: `npm install`

### 3.2 Variables de entorno (Vercel → Settings → Environment Variables)
```
VITE_API_BASE_URL=https://<tu-backend>.up.railway.app
```
Aplica a Production y Preview.

### 3.3 Deploy
- Click **Deploy**. Vercel hace `npm install && npm run build`.
- Recibirás una URL tipo `https://project-3gsgb-xxxx.vercel.app`.

### 3.4 Cerrar el loop CORS
Copia la URL de Vercel y pégala en `BACKEND_CORS_ORIGINS` del backend (Railway → Variables). Redeploy del backend.

---

## 4. Verificación post-deploy

| Check | Cómo |
|---|---|
| Frontend carga | Abrir URL Vercel, ver el login sin las credenciales `admin/admin123` |
| Login funciona | Loguear con un usuario real (recordatorio: el seeded `admin/admin123` solo existe si corriste `init_db.py` contra esa DB) |
| API responde | DevTools → Network → debes ver llamadas a `https://<tu-backend>...` con 200 |
| CORS OK | Sin errores rojos en la consola del browser |
| /docs cerrado | `curl https://<tu-backend>/api/v1/docs` → 404 |
| PDF de factura | Descargar un recibo, debe abrir bien |
| Paz y Salvo | Generar uno para Víctor Cárdenas, verificar marca de agua "PAGADO" |
| Importar histórico | Subir el Excel de Hilda, validar resultado |

---

## 5. Mejoras pendientes (no bloqueantes, hacer en otro PR)

| Prioridad | Item | Lugar |
|---|---|---|
| Alta | Forzar cambio de password al primer login | nuevo endpoint + flag en `Usuario` |
| Alta | Bundle 1 MB → code-split por ruta con `React.lazy` | `frontend/src/App.tsx` |
| Media | Quitar `--reload` no aplicable en prod (ya cubierto, solo recordatorio) | Railway start cmd |
| Media | Migrar `@app.on_event("startup")` a `lifespan` (deprecated en FastAPI 0.110+) | `backend/app/main.py:27` |
| Media | Imágenes/PDFs sin optimizar pesan mucho | revisar `backend/*.pdf` checked-in |
| Baja | Logs estructurados (json) en backend | nuevo helper |
| Baja | Rate-limiting en endpoints sensibles (login, registro) | middleware |

---

## 6. Rollback

- **Vercel**: Settings → Deployments → seleccionar el anterior → **Promote to Production**. Toma ~30s.
- **Railway**: Deployments → click en uno anterior → **Redeploy**.
- **DB**: Supabase tiene PITR si el plan lo soporta; si no, usa el dump más reciente.
