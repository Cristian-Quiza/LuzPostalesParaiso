export type Role = 'super_admin' | 'editor' | 'lector';

export type EstadoFactura = 'pendiente' | 'pagada' | 'parcial' | 'vencida';

export interface Usuario {
  id: number;
  email: string;
  username: string;
  nombre_completo: string;
  telefono?: string;
  whatsapp?: string;
  rol: Role;
  foto_perfil?: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  usuario: Usuario;
}

export interface Manzana {
  id: number;
  codigo: string;
  nombre?: string;
  descripcion?: string;
  created_at: string;
  viviendas?: Vivienda[];
}

export interface Vivienda {
  id: number;
  numero_casa: string;
  manzana_id: number;
  propietario: string;
  cedula?: string;
  telefono?: string;
  whatsapp?: string;
  email?: string;
  direccion?: string;
  tiene_alumbrado: boolean;
  tiene_seguridad: boolean;
  tiene_toma_lectura: boolean;
  tiene_administracion: boolean;
  saldo_a_favor: number;
  estado: string;
  created_at: string;
}

export interface Tarifa {
  id: number;
  ano: number;
  mes: number;
  costo_kwh_subsidiado: number;
  costo_kwh_pleno: number;
  consumo_tope_subsidiado: number;
  cargo_alumbrado: number;
  cargo_seguridad: number;
  cargo_toma_lectura: number;
  cargo_administracion: number;
  fecha_limite_pago: number;
  intereses_mora: number;
  created_at: string;
}

export interface Lectura {
  id: number;
  vivienda_id: number;
  usuario_id: number;
  ano: number;
  mes: number;
  lectura_anterior?: number;
  lectura_actual: number;
  consumo?: number;
  sincronizado: boolean;
  offline_id?: string;
  created_at: string;
}

export interface Factura {
  id: number;
  numero_factura: string;
  vivienda_id: number;
  tarifa_id?: number;
  usuario_creador_id?: number;
  ano: number;
  mes: number;
  lectura_anterior?: number;
  lectura_actual?: number;
  consumo?: number;
  kwh_subsidiados?: number;
  kwh_excedente?: number;
  costo_subsidiado?: number;
  costo_excedente?: number;
  subtotal_energia?: number;
  cargo_alumbrado: number;
  cargo_seguridad: number;
  cargo_toma_lectura: number;
  cargo_administracion: number;
  subtotal?: number;
  saldo_anterior: number;
  total?: number;
  total_pagado: number;
  estado: EstadoFactura;
  observaciones?: string;
  es_manual: boolean;
  fecha_emision: string;
  fecha_vencimiento?: string;
  created_at: string;
}

export interface Pago {
  id: number;
  factura_id?: number;
  usuario_registra_id?: number;
  monto: number;
  concepto?: string;
  metodo_pago?: string;
  fecha_pago: string;
  referencia?: string;
  created_at: string;
  vivienda_id?: number;
  numero_casa?: string;
  propietario?: string;
  cedula?: string;
  manzana_id?: number;
  ano?: number;
  mes?: number;
  total_factura?: number;
}

export interface DashboardResponse {
  total_viviendas: number;
  viviendas_activas: number;
  facturas_mes_actual: number;
  facturas_pendientes: number;
  facturas_pagadas: number;
  total_recaudo: number;
  total_pendiente: number;
  consumo_total_kwh: number;
  promedio_consumo_kwh: number;
}

export interface ReporteCartera {
  ano: number;
  mes: number;
  total_facturado: number;
  total_pagado: number;
  total_pendiente: number;
  numero_facturas: number;
  facturas_pendientes: number;
  facturas_pagadas: number;
}

export interface EstadoCuenta {
  vivienda_id: number;
  numero_casa: string;
  propietario: string;
  saldo_actual: number;
  facturas: FacturaEstadoCuenta[];
  total_facturado: number;
  total_pagado: number;
}

export interface FacturaEstadoCuenta {
  id: number;
  numero_factura: string;
  ano: number;
  mes: number;
  consumo?: number;
  total: number;
  total_pagado: number;
  pendiente: number;
  estado: EstadoFactura;
  fecha_emision?: string;
  pagos: Pago[];
}

export interface ReporteConsumo {
  ano: number;
  mes: number;
  manzana_id?: number;
  total_viviendas: number;
  total_consumo_kwh: number;
  promedio_kwh: number;
  costo_total: number;
}

export interface ReportePagos {
  ano: number;
  mes: number;
  total_pagado: number;
  numero_pagos: number;
  metodos_pago: Record<string, number>;
}

export interface LecturaOffline {
  offline_id: string;
  vivienda_id: number;
  ano: number;
  mes: number;
  lectura_actual: number;
  created_at: string;
}

export interface Configuracion {
  id: number;
  clave: string;
  valor?: string;
  descripcion?: string;
  anio?: number;
  periodo_mes?: string;
  periodo_corte?: string;
  activa: boolean;
  fecha_inicio?: string;
  fecha_fin?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HistorialPeriodo {
  id: number;
  anio?: number;
  periodo_mes?: string;
  periodo_corte?: string;
  valor?: string;
  descripcion?: string;
  fecha_inicio?: string;
  fecha_fin?: boolean;
  activa: boolean;
}