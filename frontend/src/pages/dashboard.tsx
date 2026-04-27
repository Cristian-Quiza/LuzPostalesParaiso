import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency, formatNumber, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { 
  Home, Users, FileText, Zap, DollarSign, TrendingUp, 
  Clock, CheckCircle, AlertCircle, ArrowRight, Sun, ClipboardList
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardStats {
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

export default function DashboardPage() {
  const { token, usuario } = useAuthStore();
  const { ano, mes } = getCurrentPeriod();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/reportes/dashboard', token || undefined),
    enabled: !!token,
  });

  const porcentajeRecaudo = stats && stats.facturas_mes_actual > 0
    ? Math.round((stats.facturas_pagadas / stats.facturas_mes_actual) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-white/60">Bienvenido de vuelta, {usuario?.nombre_completo}</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card">
          <Sun className="h-5 w-5 text-yellow-400" />
          <span className="text-white font-medium">{getMonthName(mes)} {ano}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card border-white/10 hover:border-blue-500/30 transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <Home className="h-6 w-6 text-blue-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{stats?.viviendas_activas || 0}</p>
                <p className="text-sm text-white/50">Viviendas Activas</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-green-400">{stats?.total_viviendas || 0} total</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10 hover:border-green-500/30 transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-green-500/20">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{stats?.facturas_pagadas || 0}</p>
                <p className="text-sm text-white/50">Facturas Pagadas</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-white/50">del mes actual</span>
              <span className="text-lg font-bold text-green-400">{porcentajeRecaudo}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10 hover:border-green-500/30 transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-green-500/20">
                <Clock className="h-6 w-6 text-green-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{stats?.facturas_pendientes || 0}</p>
                <p className="text-sm text-white/50">Pendientes</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-400" />
              <span className="text-green-400 font-medium">{formatCurrency(stats?.total_pendiente || 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10 hover:border-yellow-500/30 transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-yellow-500/20">
                <Zap className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{formatNumber(stats?.consumo_total_kwh || 0)}</p>
                <p className="text-sm text-white/50">kWh Consumidos</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-white/50">promedio</span>
              <span className="text-yellow-400 font-medium">{formatNumber(stats?.promedio_consumo_kwh || 0)} kWh</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recaudado */}
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Recaudado del Mes</h3>
              <DollarSign className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-4xl font-bold text-green-400 mb-2">{formatCurrency(stats?.total_recaudo || 0)}</p>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${porcentajeRecaudo}%` }}
              />
            </div>
            <p className="text-sm text-white/50 mt-2">{porcentajeRecaudo}% de facturación</p>
          </CardContent>
        </Card>

        {/* Facturas */}
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Facturas</h3>
              <FileText className="h-5 w-5 text-blue-400" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Total del mes</span>
                <span className="text-white font-medium">{stats?.facturas_mes_actual || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-green-400 text-sm">Pagadas</span>
                <span className="text-green-400 font-medium">{stats?.facturas_pagadas || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-green-400 text-sm">Pendientes</span>
                <span className="text-green-400 font-medium">{stats?.facturas_pendientes || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Acciones Rápidas</h3>
            <div className="space-y-3">
              <Link to="/lecturas">
                <Button variant="outline" className="w-full justify-between glass-button">
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Registrar Lecturas
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/registro-pagos">
                <Button variant="outline" className="w-full justify-between glass-button">
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Registrar Pago
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/facturas">
                <Button variant="outline" className="w-full justify-between glass-button">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Ver Facturas
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity / Alerts */}
      {(stats?.facturas_pendientes || 0) > 5 && (
        <Card className="glass-card border-green-500/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/20">
                <AlertCircle className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Atención Requerida</h3>
                <p className="text-white/60">
                  Hay {stats?.facturas_pendientes} facturas pendientes de pago. 
                  <Link to="/control-pagos" className="text-green-400 hover:underline ml-1">
                    Revisar ahora
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
        }

        .glass-button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
        }

        .glass-button:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
