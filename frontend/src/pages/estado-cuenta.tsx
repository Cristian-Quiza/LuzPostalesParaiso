import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency, getMonthName, cn } from '@/lib/utils';
import { User, FileText, Search, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Vivienda, EstadoCuenta } from '@/types';

export default function EstadoCuentaPage() {
  const { token } = useAuthStore();
  const [viviendaSeleccionada, setViviendaSeleccionada] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const { data: viviendas } = useQuery<Vivienda[]>({
    queryKey: ['viviendas'],
    queryFn: () => api.get<Vivienda[]>('/viviendas', token || undefined),
    enabled: !!token,
  });

  const { data: estadoCuenta, isLoading } = useQuery<EstadoCuenta>({
    queryKey: ['estado-cuenta', viviendaSeleccionada],
    queryFn: () => api.get<EstadoCuenta>(`/reportes/estado-cuenta/${viviendaSeleccionada}`, token || undefined),
    enabled: !!token && !!viviendaSeleccionada,
  });

  const viviendasFiltradas = viviendas?.filter(v => 
    v.propietario.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.numero_casa.includes(busqueda) ||
    v.cedula?.includes(busqueda)
  );

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'pagada':
        return <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" /> Pagada</span>;
      case 'parcial':
        return <span className="flex items-center gap-1 text-green-600"><Clock className="h-4 w-4" /> Parcial</span>;
      case 'vencida':
        return <span className="flex items-center gap-1 text-red-600"><AlertCircle className="h-4 w-4" /> Vencida</span>;
      default:
        return <span className="flex items-center gap-1 text-yellow-600"><Clock className="h-4 w-4" /> Pendiente</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Estado de Cuenta</h1>
        <p className="text-muted-foreground">Consulta el historial completo de facturas por propietario</p>
      </div>

      {/* Selector de vivienda */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Propietario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Buscar por nombre, número de casa o cédula..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="mb-4"
          />
          
          {viviendasFiltradas && viviendasFiltradas.length > 0 && busqueda && (
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {viviendasFiltradas.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "p-3 hover:bg-muted cursor-pointer border-b last:border-b-0",
                    viviendaSeleccionada === v.id && "bg-primary/10"
                  )}
                  onClick={() => {
                    setViviendaSeleccionada(v.id);
                    setBusqueda('');
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Casa {v.numero_casa}</p>
                      <p className="text-sm text-muted-foreground">{v.propietario}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{v.cedula}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estado de cuenta */}
      {viviendaSeleccionada && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {estadoCuenta?.propietario}
                </CardTitle>
                <CardDescription>Casa {estadoCuenta?.numero_casa}</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Saldo Actual</p>
                <p className={cn(
                  "text-2xl font-bold",
                  (estadoCuenta?.saldo_actual || 0) > 0 ? "text-green-600" : "text-green-600"
                )}>
                  {formatCurrency(estadoCuenta?.saldo_actual || 0)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                {/* Resumen */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Facturado</p>
                    <p className="text-xl font-bold">{formatCurrency(estadoCuenta?.total_facturado || 0)}</p>
                  </div>
                  <div className="p-4 bg-green-500/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Pagado</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(estadoCuenta?.total_pagado || 0)}</p>
                  </div>
                  <div className="p-4 bg-green-500/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Pendiente</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(estadoCuenta?.saldo_actual || 0)}</p>
                  </div>
                </div>

                {/* Historial de facturas */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead className="text-right">Consumo</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Pagado</TableHead>
                      <TableHead className="text-right">Pendiente</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estadoCuenta?.facturas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">
                          {getMonthName(f.mes)} {f.ano}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{f.numero_factura}</TableCell>
                        <TableCell className="text-right">{f.consumo || 0} kWh</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(f.total)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(f.total_pagado)}</TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          f.pendiente > 0 ? "text-green-600" : "text-green-600"
                        )}>
                          {formatCurrency(f.pendiente)}
                        </TableCell>
                        <TableCell>{getEstadoBadge(f.estado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {estadoCuenta?.facturas.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay facturas registradas
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!viviendaSeleccionada && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Selecciona un propietario para ver su estado de cuenta</p>
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
        
        .table-glass th {
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
        }
        
        .table-glass td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: white;
        }
        
        .table-glass tr:hover td {
          background: rgba(255, 255, 255, 0.03);
        }
      `}</style>
    </div>
  );
}