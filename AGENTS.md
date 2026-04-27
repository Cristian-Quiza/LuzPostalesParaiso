# AGENTS.md - Portales del Paraíso

## Project Overview
Sistema de facturación de energía para la urbanización "Portales del Paraíso" (Colombia).

**Stack**: React + Vite + TypeScript (frontend) | FastAPI + SQLAlchemy + SQLite (backend)

---

## Dev Commands

### Frontend
```bash
cd frontend
npm run dev        # Dev server on http://localhost:5173
npm run build      # TypeScript check + production build
npm run lint       # ESLint with unused import warnings as errors
```

### Backend
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000  # Dev server
python init_db.py  # Initialize/seed database
```

---

## Architecture

### API Prefix
All API routes use `/api/v1` prefix. Backend docs at `/api/v1/docs`.

### Key Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /viviendas/buscar?cedula=xxx` | Find vivienda by cedula |
| `POST /pagos/importar` | Import pagos from Excel |
| `POST /facturas/generar-masivo` | Generate facturas for period |

### Frontend API Client
- Uses `/api/v1` prefix (see `frontend/src/lib/api.ts`)
- Auth token passed via `Authorization: Bearer {token}` header
- `useAuthStore` from `frontend/src/store/auth.ts` manages auth state

### Data Models
- **Vivienda**: Propietario de casa (cedula, manzana_id, servicios: alumbrado/seguridad/administracion/toma_lectura)
- **Manzana**: Grupo de viviendas identificado por código
- **Factura**: Factura mensual por vivienda (año, mes, consumo kwh, cargos, total)
- **Pago**: Registro de pago (monto, metodo_pago, fecha_pago, concepto)

---

## Theme & Styling

### Primary Color: Green
CSS variable `--primary` = green (HSL 142.1 76.2% 36.3%)

### Glassmorphic Dark Theme
- Background: dark slate (`#020617`)
- Cards: `.glass-card` class or `rgba(255,255,255,0.05)` with `backdrop-filter: blur(20px)`
- Global styles in `frontend/src/index.css`

### UI Components
- Shadcn/ui-style components in `frontend/src/components/ui/`
- Custom dark theme in Tailwind config (`frontend/tailwind.config.js`)

---

## Import/Export Excel

### Viviendas
- Template columns: `numero_casa`, `manzana_id`, `propietario`, `cedula`, `telefono`, `whatsapp`, `email`
- Service columns: `tiene_alumbrado`, `tiene_seguridad`, `tiene_administracion`, `tiene_toma_lectura`
- Boolean format: `true`/`false` or `1`/`0`

### Pagos
- Template columns: `referencia` (PIN cuenta), `abono` (monto), `fecha_pago`, `metodo_pago`
- Date format: `YYYY-MM-DD HH:MM:SS` (e.g., `2026-01-02 10:50:00`)
- Cedula lookup via `/viviendas/buscar?cedula=xxx`

---

## Common Issues

### TypeScript Unused Imports
Many files have unused imports (ESLint `no-unused-vars` errors). Clean up before committing.

### Database Initialization
Backend uses SQLite by default (`backend/portales_facturacion.db`). Run `python init_db.py` to create/seed.

### Payment Model
`Pago.factura_id` is nullable (`Optional[int]`) to support historical data migration without invoices.

---

## Code Patterns

### React Query Usage
```typescript
const { data, isLoading } = useQuery<Type>({
  queryKey: ['key', dep1, dep2],
  queryFn: () => api.get<Type>('/endpoint', token || undefined),
  enabled: !!token,
});
```

### Date Utilities
- `getMonthName(mes)` - Spanish month name (1-12)
- `getCurrentPeriod()` - Returns `{ ano, mes }` for current date
- `formatCurrency(amount)` - Colombian peso formatting
