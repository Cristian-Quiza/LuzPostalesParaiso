import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatNumber, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { FileText, Download, Mail, MessageCircle, Printer, Plus, CheckCircle, Clock, AlertCircle, Search, Eye, Receipt, Zap, Home } from 'lucide-react';
import { Factura, Vivienda } from '@/types';

const meses = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const anos = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

export default function FacturasPage() {
  const { token, usuario } = useAuthStore();
  const queryClient = useQueryClient();
  const currentPeriod = getCurrentPeriod();
  
  const [selectedAno, setSelectedAno] = useState(currentPeriod.ano.toString());
  const [selectedMes, setSelectedMes] = useState(currentPeriod.mes.toString());
  const [viviendaFilter, setViviendaFilter] = useState<string>('all');
  const [estadoFilter, setEstadoFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<Factura | null>(null);
  const [showFacturaModal, setShowFacturaModal] = useState(false);

  const ano = parseInt(selectedAno);
  const mes = parseInt(selectedMes);

  const { data: facturas, isLoading } = useQuery<Factura[]>({
    queryKey: ['facturas', ano, mes, estadoFilter],
    queryFn: () => {
      let url = `/facturas?ano=${ano}&mes=${mes}`;
      if (estadoFilter !== 'all') url += `&estado=${estadoFilter}`;
      return api.get<Factura[]>(url, token || undefined);
    },
    enabled: !!token,
  });

  const { data: viviendas } = useQuery<Vivienda[]>({
    queryKey: ['viviendas'],
    queryFn: () => api.get<Vivienda[]>('/viviendas', token || undefined),
    enabled: !!token,
  });

  const { data: manzanas } = useQuery<any[]>({
    queryKey: ['manzana'],
    queryFn: () => api.get<any[]>('/manzanas', token || undefined),
    enabled: !!token,
  });

  const generarMasivoMutation = useMutation({
    mutationFn: () => api.post<Factura[]>(`/facturas/generar-masivo?ano=${ano}&mes=${mes}`, {}, token || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
    },
  });

  const handleGenerarMasivo = async () => {
    if (!confirm('¿Generar facturas para todas las viviendas con lecturas?')) return;
    setGenerating(true);
    try {
      await generarMasivoMutation.mutateAsync();
      alert('Facturas generadas correctamente');
    } catch (error: any) {
      alert('Error al generar facturas: ' + (error?.message || 'Error desconocido'));
    }
    setGenerating(false);
  };

  const filteredFacturas = facturas?.filter((f) => {
    if (viviendaFilter !== 'all' && f.vivienda_id.toString() !== viviendaFilter) return false;
    if (estadoFilter !== 'all' && f.estado !== estadoFilter) return false;
    if (searchTerm) {
      const vivienda = viviendas?.find(v => v.id === f.vivienda_id);
      const searchLower = searchTerm.toLowerCase();
      const matchesPropietario = vivienda?.propietario.toLowerCase().includes(searchLower);
      const matchesCedula = vivienda?.cedula.toLowerCase().includes(searchLower);
      const matchesCasa = vivienda?.numero_casa.toLowerCase().includes(searchLower);
      const matchesFactura = f.numero_factura?.toLowerCase().includes(searchLower);
      if (!matchesPropietario && !matchesCedula && !matchesCasa && !matchesFactura) return false;
    }
    return true;
  });

  const getViviendaInfo = (id: number) => {
    return viviendas?.find(v => v.id === id);
  };

  const getManzanaInfo = (id: number) => {
    return manzanas?.find(m => m.id === id);
  };

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

  const getWhatsAppLink = (vivienda: Vivienda, factura: Factura) => {
    if (!vivienda.whatsapp) return '#';
    const tel = vivienda.whatsapp.replace('+', '');
    const mensaje = `Hola ${vivienda.propietario}, tu factura de ${getMonthName(mes)} ${ano} es: ${formatCurrency(factura.total)}. Gracias por su pago.`;
    return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
  };

  const abrirFactura = (factura: Factura) => {
    setFacturaSeleccionada(factura);
    setShowFacturaModal(true);
  };

  const imprimirFactura = () => {
    window.print();
  };

  const totalFacturado = filteredFacturas?.reduce((sum, f) => sum + (f.total || 0), 0) || 0;
  const totalPagado = filteredFacturas?.reduce((sum, f) => sum + (f.total_pagado || 0), 0) || 0;
  const totalPendiente = totalFacturado - totalPagado;
  const facturasPagadas = filteredFacturas?.filter(f => f.estado === 'pagada').length || 0;
  const facturasPendientes = filteredFacturas?.filter(f => f.estado !== 'pagada').length || 0;
  const porcentajeRecaudo = totalFacturado > 0 ? ((totalPagado / totalFacturado) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Facturas</h1>
          <p className="text-muted-foreground">
            {getMonthName(mes)} {ano}
          </p>
        </div>
        {(usuario?.rol === 'super_admin' || usuario?.rol === 'editor') && (
          <Button onClick={handleGenerarMasivo} disabled={generating}>
            <Plus className="h-4 w-4 mr-2" />
            {generating ? 'Generando...' : 'Generar Facturas'}
          </Button>
        )}
      </div>

      {/* Selector de Período */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label>Período</Label>
              <div className="flex gap-2 mt-1">
                <Select value={selectedMes} onValueChange={setSelectedMes}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meses.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedAno} onValueChange={setSelectedAno}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex-1">
              <Label>Buscar</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Factura, nombre o cédula..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-48">
              <Label>Estado</Label>
              <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="pagada">Pagada</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{filteredFacturas?.length || 0}</p>
            <p className="text-xs text-blue-600">Total Facturas</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPagado)}</p>
            <p className="text-xs text-green-600">Recaudado</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPendiente)}</p>
            <p className="text-xs text-green-600">Pendiente</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{facturasPagadas}</p>
            <p className="text-xs text-green-600">Pagadas</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{facturasPendientes}</p>
            <p className="text-xs text-yellow-600">Pendientes</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{porcentajeRecaudo}%</p>
            <p className="text-xs text-purple-600">% Recaudo</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factura</TableHead>
              <TableHead>Vivienda</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead className="text-right">Consumo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="flex justify-center">Cargando...</div>
                </TableCell>
              </TableRow>
            ) : filteredFacturas?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No hay facturas para este período
                </TableCell>
              </TableRow>
            ) : (
              filteredFacturas?.map((factura) => {
                const vivienda = getViviendaInfo(factura.vivienda_id);
                const manzana = vivienda ? getManzanaInfo(vivienda.manzana_id) : null;
                return (
                  <TableRow key={factura.id} className={factura.estado === 'pagada' ? 'bg-green-50' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {factura.numero_factura || `FAC-${factura.id}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Home className="h-4 w-4 text-muted-foreground" />
                        MZ {manzana?.codigo || vivienda?.manzana_id} C{vivienda?.numero_casa || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{vivienda?.propietario || 'Sin nombre'}</p>
                        <p className="text-xs text-muted-foreground">{vivienda?.cedula || ''}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Zap className="h-3 w-3 text-yellow-500" />
                        {formatNumber(factura.consumo || 0)} kWh
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(factura.total || 0)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(factura.total_pagado || 0)}</TableCell>
                    <TableCell className="text-center">{getEstadoBadge(factura.estado)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Ver Factura" onClick={() => abrirFactura(factura)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Imprimir" onClick={() => abrirFactura(factura)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        {vivienda?.whatsapp && (
                          <a href={getWhatsAppLink(vivienda, factura)} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" title="Enviar por WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        {vivienda?.email && (
                          <Button variant="ghost" size="icon" title="Enviar por Email">
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modal de Factura */}
      <Dialog open={showFacturaModal} onOpenChange={setShowFacturaModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {facturaSeleccionada && (() => {
            const vivienda = getViviendaInfo(facturaSeleccionada.vivienda_id);
            const manzana = vivienda ? getManzanaInfo(vivienda.manzana_id) : null;
            const saldoPendiente = (facturaSeleccionada.total || 0) - (facturaSeleccionada.total_pagado || 0);
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Factura {facturaSeleccionada.numero_factura || `FAC-${facturaSeleccionada.id}`}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4" id="factura-printable">
                  {/* Encabezado */}
                  <div className="text-center border-b pb-4">
                    <h2 className="text-xl font-bold">PORTALES DEL PARAÍSO</h2>
                    <p className="text-sm text-muted-foreground">Conjunto Residencial</p>
                    <p className="text-sm">NIT: 123456789</p>
                    <p className="text-sm">Período: {getMonthName(mes)} {ano}</p>
                  </div>

                  {/* Datos del cliente */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Datos del Cliente</p>
                      <p>Nombre: {vivienda?.propietario || 'N/A'}</p>
                      <p>Cédula: {vivienda?.cedula || 'N/A'}</p>
                      <p>Dirección: {vivienda?.direccion || `MZ ${manzana?.codigo || vivienda?.manzana_id} Casa ${vivienda?.numero_casa}`}</p>
                      <p>Teléfono: {vivienda?.telefono || vivienda?.whatsapp || 'N/A'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">Datos de la Factura</p>
                      <p>N°: {facturaSeleccionada.numero_factura || `FAC-${facturaSeleccionada.id}`}</p>
                      <p>Fecha: {new Date(facturaSeleccionada.fecha_emision || Date.now()).toLocaleDateString()}</p>
                      <p>Vence: {facturaSeleccionada.fecha_vencimiento ? new Date(facturaSeleccionada.fecha_vencimiento).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>

                  {/* Detalle de consumo */}
                  <div className="border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-2">Concepto</th>
                          <th className="text-right p-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="p-2">Consumo de Energía Eléctrica</td>
                          <td className="text-right p-2">{formatCurrency((facturaSeleccionada.costo_subsidiado || 0) + (facturaSeleccionada.costo_excedente || 0))}</td>
                        </tr>
                        <tr className="border-t">
                          <td className="p-2">  kWh consumidos: {formatNumber(facturaSeleccionada.consumo || 0)}</td>
                          <td className="text-right p-2 text-muted-foreground">
                            ({formatNumber(facturaSeleccionada.kwh_subsidiados || 0)} kWh subsidiados + {formatNumber(facturaSeleccionada.kwh_excedente || 0)} kWh excedente)
                          </td>
                        </tr>
                        {facturaSeleccionada.cargo_alumbrado > 0 && (
                          <tr className="border-t">
                            <td className="p-2">Alumbrado Público</td>
                            <td className="text-right p-2">{formatCurrency(facturaSeleccionada.cargo_alumbrado)}</td>
                          </tr>
                        )}
                        {facturaSeleccionada.cargo_seguridad > 0 && (
                          <tr className="border-t">
                            <td className="p-2">Seguridad</td>
                            <td className="text-right p-2">{formatCurrency(facturaSeleccionada.cargo_seguridad)}</td>
                          </tr>
                        )}
                        {facturaSeleccionada.cargo_administracion > 0 && (
                          <tr className="border-t">
                            <td className="p-2">Administración</td>
                            <td className="text-right p-2">{formatCurrency(facturaSeleccionada.cargo_administracion)}</td>
                          </tr>
                        )}
                        <tr className="border-t font-bold bg-muted">
                          <td className="p-2">TOTAL A PAGAR</td>
                          <td className="text-right p-2">{formatCurrency(facturaSeleccionada.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Estado de cuenta */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-muted p-3 rounded">
                      <p><span className="font-medium">Saldo Anterior:</span> {formatCurrency(facturaSeleccionada.saldo_anterior || 0)}</p>
                      <p><span className="font-medium">Total Facturado:</span> {formatCurrency(facturaSeleccionada.total)}</p>
                      <p className="font-bold"><span>Pagado:</span> {formatCurrency(facturaSeleccionada.total_pagado || 0)}</p>
                      <p className="font-bold text-green-600"><span>Saldo Pendiente:</span> {formatCurrency(saldoPendiente)}</p>
                    </div>
                    <div className="text-center flex items-center justify-center">
                      <div className={`px-4 py-2 rounded-full ${facturaSeleccionada.estado === 'pagada' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        <span className="font-bold">{facturaSeleccionada.estado.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Lecturas */}
                  <div className="text-sm text-muted-foreground text-center">
                    <p>Lectura Anterior: {formatNumber(facturaSeleccionada.lectura_anterior || 0)} | Lectura Actual: {formatNumber(facturaSeleccionada.lectura_actual || 0)} | Consumo: {formatNumber(facturaSeleccionada.consumo || 0)} kWh</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowFacturaModal(false)}>
                    Cerrar
                  </Button>
                  <Button onClick={imprimirFactura}>
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir Factura
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
        
        #factura-printable {
          background: white !important;
          color: #1e293b !important;
        }
        
        #factura-printable * {
          color: #1e293b !important;
        }
      `}</style>
    </div>
  );
}
