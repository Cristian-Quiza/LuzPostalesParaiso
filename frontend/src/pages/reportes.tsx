import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency, formatNumber, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { BarChart3, TrendingUp, PieChart, CheckCircle, Clock, AlertCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReporteCartera } from '@/types';

export default function ReportesPage() {
  const { token } = useAuthStore();
  const { ano } = getCurrentPeriod();
  
  const [anoReporte, setAnoReporte] = useState(ano.toString());

  const { data: reporteCartera, isLoading: loadingCartera } = useQuery<ReporteCartera[]>({
    queryKey: ['reporte-cartera', anoReporte],
    queryFn: () => api.get<ReporteCartera[]>(`/reportes/cartera?ano=${anoReporte}`, token || undefined),
    enabled: !!token,
  });

  const totales = reporteCartera?.reduce(
    (acc, r) => ({
      facturado: acc.facturado + r.total_facturado,
      pagado: acc.pagado + r.total_pagado,
      pendiente: acc.pendiente + r.total_pendiente,
      facturas: acc.facturas + r.numero_facturas,
      facturasPagadas: acc.facturasPagadas + r.facturas_pagadas,
      facturasPendientes: acc.facturasPendientes + r.facturas_pendientes,
    }),
    { facturado: 0, pagado: 0, pendiente: 0, facturas: 0, facturasPagadas: 0, facturasPendientes: 0 }
  );

  const porcentajeRecaudo = totales?.facturado && totales.facturado > 0 
    ? (totales.pagado / totales.facturado * 100).toFixed(1) 
    : '0';

  const disponibles = Array.from({ length: 5 }, (_, i) => (ano - i).toString());

  const getPorcentaje = (pagado: number, total: number) => {
    if (!total) return '0%';
    return `${((pagado / total) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Historial Consolidado</h1>
          <p className="text-muted-foreground">Resumen de todos los períodos con facturación y recaudación</p>
        </div>
        <Select value={anoReporte} onValueChange={setAnoReporte}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            {disponibles.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumen General */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totales?.facturado || 0)}</p>
            <p className="text-xs text-blue-600">Total Facturado</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totales?.pagado || 0)}</p>
            <p className="text-xs text-green-600">Total Recaudado</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totales?.pendiente || 0)}</p>
            <p className="text-xs text-green-600">Total Pendiente</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{totales?.facturasPagadas || 0}</p>
            <p className="text-xs text-green-600">Facturas Pagadas</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{totales?.facturasPendientes || 0}</p>
            <p className="text-xs text-yellow-600">Facturas Pendientes</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{porcentajeRecaudo}%</p>
            <p className="text-xs text-purple-600">% Recaudo</p>
          </CardContent>
        </Card>
      </div>

      {/* Historial Consolidado */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <CardTitle>Historial por Período</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCartera ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Facturas</TableHead>
                    <TableHead className="text-right">Facturado</TableHead>
                    <TableHead className="text-right">Recaudado</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead className="text-center">% Recaudo</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reporteCartera?.map((r) => {
                    const pctRecaudo = ((r.total_pagado / r.total_facturado) * 100).toFixed(1);
                    const estaVencido = r.mes < new Date().getMonth() + 1;
                    
                    return (
                      <TableRow key={`${r.ano}-${r.mes}`}>
                        <TableCell className="font-medium">
                          {getMonthName(r.mes)} {r.ano}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.facturas_pendientes === 0 ? (
                            <span className="flex items-center justify-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" /> Cerrado
                            </span>
                          ) : estaVencido ? (
                            <span className="flex items-center justify-center gap-1 text-red-600">
                              <AlertCircle className="h-4 w-4" /> Pendiente
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-yellow-600">
                              <Clock className="h-4 w-4" /> En curso
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-green-600 mr-1">{r.facturas_pagadas}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="ml-1">{r.numero_facturas}</span>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_facturado)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(r.total_pagado)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(r.total_pendiente)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 bg-muted rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  parseFloat(pctRecaudo) >= 90 ? 'bg-green-500' :
                                  parseFloat(pctRecaudo) >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${pctRecaudo}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{pctRecaudo}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              
              {reporteCartera?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay datos para el año seleccionado
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Más reportes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500/10">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Reporte de Consumo</p>
                <p className="text-sm text-muted-foreground">kWh consumidos por período y manzana</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <PieChart className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="font-medium">Reporte de Pagos</p>
                <p className="text-sm text-muted-foreground">Métodos de pago y facturación</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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