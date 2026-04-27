import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { Search, CheckCircle, Clock, AlertCircle, DollarSign } from 'lucide-react';
import { Factura, Vivienda } from '@/types';

export default function ControlPagosPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const { ano: currentAno, mes: currentMes } = getCurrentPeriod();

  const [selectedAno, setSelectedAno] = useState(currentAno.toString());
  const [selectedMes, setSelectedMes] = useState(currentMes.toString());
  const [searchTerm, setSearchTerm] = useState('');
  const [cedulaFilter, setCedulaFilter] = useState('');
  const [pagosEditando, setPagosEditando] = useState<Record<number, { monto: string; metodo: string }>>({});

  const ano = parseInt(selectedAno);
  const mes = parseInt(selectedMes);

  const { data: facturas, isLoading } = useQuery<Factura[]>({
    queryKey: ['facturas', ano, mes],
    queryFn: () => api.get<Factura[]>(`/facturas?ano=${ano}&mes=${mes}`, token || undefined),
    enabled: !!token,
  });

  const { data: todasLasViviendas } = useQuery<Vivienda[]>({
    queryKey: ['todas-viviendas'],
    queryFn: () => api.get<Vivienda[]>('/viviendas', token || undefined),
    enabled: !!token,
  });

  const registrarPagoMutation = useMutation({
    mutationFn: ({ facturaId, data }: { facturaId: number; data: any }) =>
      api.post(`/facturas/${facturaId}/pago`, data, token || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
    },
  });

  const handlePagoChange = (facturaId: number, field: 'monto' | 'metodo', value: string) => {
    setPagosEditando(prev => ({
      ...prev,
      [facturaId]: {
        ...prev[facturaId],
        [field]: value,
      },
    }));
  };

  const handleRegistrarPagoRápido = (facturaId: number) => {
    const pago = pagosEditando[facturaId];
    if (!pago?.monto) return;

    registrarPagoMutation.mutate({
      facturaId,
      data: {
        monto: parseFloat(pago.monto),
        metodo_pago: pago.metodo || 'efectivo',
        fecha_pago: new Date().toISOString(),
        concepto: `Pago período ${getMonthName(mes)} ${ano}`,
      },
    });

    setPagosEditando(prev => {
      const newState = { ...prev };
      delete newState[facturaId];
      return newState;
    });
  };

  const handlePagoCompleto = (factura: Factura) => {
    const saldoPendiente = (factura.total || 0) - (factura.total_pagado || 0);
    setPagosEditando(prev => ({
      ...prev,
      [factura.id]: {
        monto: saldoPendiente.toString(),
        metodo: 'efectivo',
      },
    }));
  };

  const filteredFacturas = useMemo(() => {
    if (!facturas) return [];
    
    return facturas.filter(f => {
      const vivienda = todasLasViviendas?.find(v => v.id === f.vivienda_id);
      
      if (cedulaFilter) {
        const matchesCedula = vivienda?.cedula?.includes(cedulaFilter);
        if (!matchesCedula) return false;
      }
      
      if (!vivienda && !searchTerm) return true;
      
      const searchLower = searchTerm.toLowerCase();
      const matchesManzana = vivienda?.manzana_id?.toString()?.includes(searchLower);
      const matchesCasa = vivienda?.numero_casa?.toLowerCase().includes(searchLower);
      const matchesPropietario = vivienda?.propietario?.toLowerCase().includes(searchLower);
      const matchesCedula = vivienda?.cedula?.toLowerCase().includes(searchLower);
      
      return matchesManzana || matchesCasa || matchesPropietario || matchesCedula || !searchTerm;
    });
  }, [facturas, searchTerm, todasLasViviendas, cedulaFilter]);

  const getViviendaInfo = (id: number) => {
    return todasLasViviendas?.find(v => v.id === id);
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'pagada':
        return <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle className="h-4 w-4" /> Pagado</span>;
      case 'parcial':
        return <span className="flex items-center gap-1 text-green-600 text-sm"><Clock className="h-4 w-4" /> Abono</span>;
      case 'vencida':
        return <span className="flex items-center gap-1 text-red-600 text-sm"><AlertCircle className="h-4 w-4" /> Vencida</span>;
      default:
        return <span className="flex items-center gap-1 text-yellow-600 text-sm"><Clock className="h-4 w-4" /> Pendiente</span>;
    }
  };

  const totalFacturado = facturas?.reduce((sum, f) => sum + (f.total || 0), 0) || 0;
  const totalPagado = facturas?.reduce((sum, f) => sum + (f.total_pagado || 0), 0) || 0;
  const totalPendiente = totalFacturado - totalPagado;
  const facturasPagadas = facturas?.filter(f => f.estado === 'pagada').length || 0;
  const facturasPendientes = facturas?.filter(f => f.estado !== 'pagada').length || 0;
  const porcentajeRecaudo = totalFacturado > 0 ? (totalPagado / totalFacturado * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Control de Pagos</h1>
        <p className="text-muted-foreground">
          Período: {getMonthName(parseInt(selectedMes))} {selectedAno}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{facturas?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total Viviendas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalFacturado)}</p>
            <p className="text-xs text-muted-foreground">Total Facturado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPagado)}</p>
            <p className="text-xs text-muted-foreground">Total Recaudado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPendiente)}</p>
            <p className="text-xs text-muted-foreground">Total Pendiente</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{facturasPagadas}</p>
            <p className="text-xs text-muted-foreground">Pagados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{facturasPendientes}</p>
            <p className="text-xs text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de progreso */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Porcentaje de Recaudo</span>
            <span className="text-sm font-bold">{porcentajeRecaudo}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-4">
            <div
              className="bg-green-500 h-4 rounded-full transition-all"
              style={{ width: `${porcentajeRecaudo}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Año</label>
                <Select value={selectedAno} onValueChange={setSelectedAno}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentAno - 1, currentAno, currentAno + 1].map((a) => (
                      <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Mes</label>
                <Select value={selectedMes} onValueChange={setSelectedMes}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={m.toString()}>{getMonthName(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Cédula</label>
                <Input
                  placeholder="Buscar por cédula..."
                  value={cedulaFilter}
                  onChange={(e) => setCedulaFilter(e.target.value)}
                  className="w-[130px]"
                />
              </div>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por casa, propietario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Pagos */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Casa</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pagado</TableHead>
              <TableHead>Pendiente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Valor Pago</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <div className="flex justify-center">Cargando...</div>
                </TableCell>
              </TableRow>
            ) : filteredFacturas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No hay facturas para este período
                </TableCell>
              </TableRow>
            ) : (
              filteredFacturas.map((factura) => {
                const vivienda = getViviendaInfo(factura.vivienda_id);
                const saldoPendiente = (factura.total || 0) - (factura.total_pagado || 0);
                const pagoActual = pagosEditando[factura.id];

                return (
                  <TableRow
                    key={factura.id}
                    className={factura.estado === 'pagada' ? 'bg-green-50' : ''}
                  >
                    <TableCell className="font-medium">
                      MZ {vivienda?.manzana_id || factura.vivienda_id} - {vivienda?.numero_casa || '-'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{vivienda?.propietario || 'Sin nombre'}</p>
                        <p className="text-xs text-muted-foreground">{vivienda?.cedula || ''}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(factura.total || 0)}</TableCell>
                    <TableCell className="text-green-600">{formatCurrency(factura.total_pagado || 0)}</TableCell>
                    <TableCell className={saldoPendiente > 0 ? 'text-green-600 font-medium' : ''}>
                      {formatCurrency(saldoPendiente)}
                    </TableCell>
                    <TableCell>{getEstadoBadge(factura.estado)}</TableCell>
                    <TableCell>
                      {factura.estado !== 'pagada' ? (
                        <Input
                          type="number"
                          placeholder="0"
                          value={pagoActual?.monto || ''}
                          onChange={(e) => handlePagoChange(factura.id, 'monto', e.target.value)}
                          className="w-24"
                        />
                      ) : (
                        <span className="text-green-600 font-medium">COMPLETO</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {factura.estado !== 'pagada' ? (
                        <Select
                          value={pagoActual?.metodo || 'efectivo'}
                          onValueChange={(v) => handlePagoChange(factura.id, 'metodo', v)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="nequi">Nequi</SelectItem>
                            <SelectItem value="daviplata">Daviplata</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {factura.estado !== 'pagada' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePagoCompleto(factura)}
                            title="Pago completo"
                          >
                            <DollarSign className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleRegistrarPagoRápido(factura.id)}
                            disabled={!pagoActual?.monto || registrarPagoMutation.isPending}
                          >
                            Pagar
                          </Button>
                        </div>
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-600 ml-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

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
