import { useState, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { Search, Receipt, CheckCircle, Clock, AlertCircle, Phone, Home, User, DollarSign, Download, Upload, FileSpreadsheet, List } from 'lucide-react';
import { Factura, Vivienda, Pago } from '@/types';
import * as XLSX from 'xlsx';

export default function RegistroPagosPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const { ano: currentAno, mes: currentMes } = getCurrentPeriod();

  const [showTable, setShowTable] = useState(true);
  const [filterAno, setFilterAno] = useState(currentAno.toString());
  const [filterMes, setFilterMes] = useState(currentMes.toString());

  const [cedula, setCedula] = useState('');
  const [searchError, setSearchError] = useState('');

  const [pagoData, setPagoData] = useState({
    monto: '',
    metodo_pago: 'efectivo',
    hora: '',
    observaciones: '',
  });
  const [registroExitoso, setRegistroExitoso] = useState(false);

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importResult, setImportResult] = useState<{success: number; success_list: string[]; errors: string[]} | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filterAnoNum = parseInt(filterAno);
  const filterMesNum = parseInt(filterMes);

  const { data: facturas } = useQuery<Factura[]>({
    queryKey: ['facturas', filterAnoNum, filterMesNum],
    queryFn: () => api.get<Factura[]>(`/facturas?ano=${filterAnoNum}&mes=${filterMesNum}`, token || undefined),
    enabled: !!token,
  });

  const { data: pagos, isLoading: loadingPagos } = useQuery<Pago[]>({
    queryKey: ['pagos', filterAnoNum, filterMesNum],
    queryFn: () => {
      let url = '/pagos';
      const params = new URLSearchParams();
      if (filterAnoNum) params.append('ano', filterAnoNum.toString());
      if (filterMesNum) params.append('mes', filterMesNum.toString());
      const queryString = params.toString();
      return api.get<Pago[]>(queryString ? `${url}?${queryString}` : url, token || undefined);
    },
    enabled: !!token,
  });

  const { data: viviendas } = useQuery<Vivienda[]>({
    queryKey: ['viviendas'],
    queryFn: () => api.get<Vivienda[]>('/viviendas', token || undefined),
    enabled: !!token,
  });

  const registrarPagoMutation = useMutation({
    mutationFn: ({ facturaId, data }: { facturaId: number; data: any }) =>
      api.post(`/facturas/${facturaId}/pago`, data, token || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      setRegistroExitoso(true);
      setPagoData({ monto: '', metodo_pago: 'efectivo', hora: '', observaciones: '' });
      setCedula('');
    },
  });

  const importMutation = useMutation<{success: number; success_list: string[]; errors: string[]}, Error, any[]>({
    mutationFn: async (data: any[]) => {
      const currentToken = useAuthStore.getState().token;
      if (!currentToken) throw new Error('No hay sesión activa');
      return api.post('/pagos/importar', data, currentToken);
    },
    onSuccess: (results) => {
      setImportResult(results);
      setIsImporting(false);
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['pagos'] });
    },
    onError: (error: any) => {
      setImportResult({ success: 0, success_list: [], errors: [error?.message || 'Error al importar'] });
      setIsImporting(false);
    },
  });

  const exportToExcel = () => {
    const dataToExport = facturas?.map((f) => {
      const vivienda = viviendas?.find(v => v.id === f.vivienda_id);
      return {
        'Cuenta': '',
        'Cédula': vivienda?.cedula || '',
        'Propietario': vivienda?.propietario || '',
        'Manzana': vivienda?.manzana_id || '',
        'Casa': vivienda?.numero_casa || '',
        'Total': f.total || 0,
        'Pagado': f.total_pagado || 0,
        'Pendiente': (f.total || 0) - (f.total_pagado || 0),
        'Estado': f.estado,
        'Mes': f.mes,
        'Año': f.ano,
      };
    }) || [];

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
    XLSX.writeFile(wb, `pagos_${filterMesNum}_${filterAnoNum}.xlsx`);
  };

  const downloadTemplate = () => {
    const template = [
      {
        'cuenta': '458432252',
        'cliente': '12345678',
        'abono': 50000,
        'pin': 'ref123',
        'fecha_recaudo': '2026-01-02 10:50:00',
        'mes': 1,
        'ano': 2026,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
    XLSX.writeFile(wb, 'plantilla_pagos.xlsx');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImportResult(null);
    setParsedData(null);
    setParseErrors([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 2) {
          setParseErrors(['El archivo no contiene datos suficientes']);
          return;
        }

        const headers = jsonData[0].map((h: any) => String(h || '').trim().toLowerCase().replace(/\s+/g, '_'));
        
        const colIndex: Record<string, number> = {
          cuenta: headers.findIndex((h: string) => h.includes('cuenta')),
          cliente: headers.findIndex((h: string) => h.includes('cliente') || h.includes('cédula') || h.includes('cedula')),
          abono: headers.findIndex((h: string) => h.includes('abono') || h.includes('monto') || h.includes('pago')),
          pin: headers.findIndex((h: string) => h.includes('pin') || h.includes('ref') || h.includes('referencia')),
          fecha: headers.findIndex((h: string) => h.includes('fecha')),
          mes: headers.findIndex((h: string) => h === 'mes'),
          ano: headers.findIndex((h: string) => h === 'ano' || h === 'año'),
        };

        const missingColumns = Object.entries(colIndex).filter(([key, idx]) => idx === -1 && key !== 'pin').map(([key]) => key);
        
        if (missingColumns.length > 0) {
          setParseErrors([`Columnas requeridas faltantes: ${missingColumns.join(', ')}. Columnas encontradas: ${headers.join(', ')}`]);
          return;
        }

        const validData: any[] = [];
        const errors: string[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0 || !row.some((cell: any) => cell)) continue;

          const index = i + 1;
          
          const getValue = (key: string): any => {
            const idx = colIndex[key as keyof typeof colIndex];
            return idx !== -1 ? row[idx] : undefined;
          };

          let clienteRaw = getValue('cliente');
          let cliente = String(clienteRaw || '').trim();
          
          let abonoRaw = getValue('abono');
          let abono = typeof abonoRaw === 'number' ? abonoRaw : parseFloat(String(abonoRaw || '0').replace(/[^\d.-]/g, ''));
          
          let fechaRaw = getValue('fecha');
          let mesRaw = getValue('mes');
          let anoRaw = getValue('ano');
          let pinRaw = getValue('pin');
          let cuentaRaw = getValue('cuenta');

          if (!cliente) {
            errors.push(`Fila ${index}: Cédula requerida`);
            continue;
          }
          if (isNaN(abono) || abono <= 0) {
            errors.push(`Fila ${index}: Abono inválido (${abonoRaw})`);
            continue;
          }
          
          let mesNum = typeof mesRaw === 'number' ? mesRaw : parseInt(String(mesRaw || '0').replace(/[^\d]/g, ''));
          if (isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
            errors.push(`Fila ${index}: Mes inválido (${mesRaw})`);
            continue;
          }
          
          let anoNum = typeof anoRaw === 'number' ? anoRaw : parseInt(String(anoRaw || '0').replace(/[^\d]/g, ''));
          if (isNaN(anoNum) || anoNum < 2020) {
            errors.push(`Fila ${index}: Año inválido (${anoRaw})`);
            continue;
          }

          let fechaPago: string;
          try {
            let fechaStr = String(fechaRaw || '');
            let date: Date;
            
            if (typeof fechaRaw === 'number') {
              date = new Date((fechaRaw - 25569) * 86400 * 1000);
            } else if (fechaRaw instanceof Date) {
              date = fechaRaw;
            } else {
              fechaStr = fechaStr.trim();
              if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(fechaStr)) {
                const [d, m, y] = fechaStr.split(/[\/\s:]+/);
                date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
              } else {
                date = new Date(fechaStr.replace(' ', 'T'));
              }
            }
            
            if (isNaN(date.getTime())) {
              errors.push(`Fila ${index}: Fecha inválida (${fechaRaw})`);
              continue;
            }
            fechaPago = date.toISOString();
          } catch {
            errors.push(`Fila ${index}: Fecha inválida (${fechaRaw})`);
            continue;
          }

          validData.push({
            cuenta: String(cuentaRaw || '').trim() || '',
            cliente: cliente,
            abono: abono,
            pin: String(pinRaw || '').trim() || null,
            fecha_recaudo: fechaPago,
            mes: mesNum,
            ano: anoNum,
          });
        }

        if (validData.length === 0) {
          setParseErrors(errors.length > 0 ? errors.slice(0, 10) : ['No se encontraron datos válidos para importar.']);
          return;
        }

        setParsedData(validData);
        setParseErrors(errors);
      } catch (error) {
        setParseErrors(['Error al leer el archivo. Asegúrese de que sea un archivo Excel válido.']);
      }
    };

    reader.onerror = () => {
      setParseErrors(['Error al leer el archivo']);
    };

    reader.readAsBinaryString(file);
  };

  const handleImport = () => {
    if (parsedData && parsedData.length > 0) {
      setIsImporting(true);
      importMutation.mutate(parsedData);
    }
  };

  const viviendaEncontrada = viviendas?.find(v => v.cedula === cedula);
  const facturaEncontrada = facturas?.find(f => f.vivienda_id === viviendaEncontrada?.id);

  const handleBuscar = () => {
    setSearchError('');
    setRegistroExitoso(false);

    if (!cedula.trim()) {
      setSearchError('Ingrese un número de cédula');
      return;
    }

    if (!viviendaEncontrada) {
      setSearchError('No se encontró ninguna vivienda con esa cédula');
      return;
    }

    if (!facturaEncontrada) {
      setSearchError('Esta vivienda no tiene factura generada para este período');
      return;
    }
  };

  const handleRegistrarPago = () => {
    if (!facturaEncontrada || !pagoData.monto) return;

    const fechaHora = new Date();
    if (pagoData.hora) {
      const [horas, minutos] = pagoData.hora.split(':');
      fechaHora.setHours(parseInt(horas), parseInt(minutos));
    }

    registrarPagoMutation.mutate({
      facturaId: facturaEncontrada.id,
      data: {
        monto: parseFloat(pagoData.monto),
        metodo_pago: pagoData.metodo_pago,
        fecha_pago: fechaHora.toISOString(),
        concepto: pagoData.observaciones || `Pago período ${getMonthName(filterMesNum)} ${filterAnoNum}`,
      },
    });
  };

  const totalPagos = pagos?.reduce((sum, p) => sum + p.monto, 0) || 0;
  const getMetodoBadge = (metodo?: string) => {
    switch (metodo) {
      case 'efectivo':
        return <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">Efectivo</span>;
      case 'transferencia':
        return <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">Transferencia</span>;
      case 'nequi':
        return <span className="px-2 py-1 rounded text-xs bg-pink-500/20 text-pink-400">Nequi</span>;
      case 'daviplata':
        return <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">Daviplata</span>;
      default:
        return <span className="px-2 py-1 rounded text-xs bg-gray-500/20 text-gray-400">-</span>;
    }
  };

  const saldoPendiente = facturaEncontrada ? (facturaEncontrada.total || 0) - (facturaEncontrada.total_pagado || 0) : 0;
  const montoIngresado = parseFloat(pagoData.monto) || 0;
  const nuevoSaldo = saldoPendiente - montoIngresado;

  const getEstadoFactura = () => {
    if (!facturaEncontrada) return null;
    if (facturaEncontrada.estado === 'pagada') {
      return <span className="flex items-center gap-2 text-green-600"><CheckCircle className="h-5 w-5" /> PAGADO</span>;
    }
    if (facturaEncontrada.estado === 'parcial') {
      return <span className="flex items-center gap-2 text-green-600"><Clock className="h-5 w-5" /> ABONO PARCIAL</span>;
    }
    if (facturaEncontrada.estado === 'vencida') {
      return <span className="flex items-center gap-2 text-red-600"><AlertCircle className="h-5 w-5" /> VENCIDA</span>;
    }
    return <span className="flex items-center gap-2 text-yellow-600"><Clock className="h-5 w-5" /> PENDIENTE</span>;
  };

  const getResultadoPago = () => {
    if (!montoIngresado) return null;
    if (nuevoSaldo <= 0) {
      return (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">PAGADO COMPLETO</span>
          {nuevoSaldo < 0 && <span className="text-sm">(Saldo a favor: {formatCurrency(Math.abs(nuevoSaldo))})</span>}
        </div>
      );
    }
    return (
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-center gap-2">
        <Clock className="h-5 w-5" />
        <span className="font-medium">ABONO PARCIAL</span>
        <span className="text-sm">(Nuevo saldo: {formatCurrency(nuevoSaldo)})</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Registro de Pagos</h1>
          <p className="text-muted-foreground">
            Período: {getMonthName(filterMesNum)} {filterAnoNum}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
            <Button
              variant={showTable ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowTable(true)}
              className={showTable ? "bg-green-600" : "text-white/70"}
            >
              <List className="h-4 w-4 mr-1" />
              Ver Pagos
            </Button>
            <Button
              variant={!showTable ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowTable(false)}
              className={!showTable ? "bg-green-600" : "text-white/70"}
            >
              <DollarSign className="h-4 w-4 mr-1" />
              Registrar
            </Button>
          </div>
          <Button variant="outline" onClick={exportToExcel} className="bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={downloadTemplate} className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Plantilla
          </Button>
          <Button variant="outline" onClick={() => { setShowImportDialog(true); setImportResult(null); setSelectedFile(null); setParsedData(null); setParseErrors([]); }} className="bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20">
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" onClick={() => { if (confirm('¿Borrar TODOS los pagos importados? Esta acción no se puede deshacer.')) { api.delete('/pagos/all', token || undefined).then(() => { queryClient.invalidateQueries({ queryKey: ['pagos'] }); alert('Pagos eliminados'); }).catch((e) => alert('Error: ' + e.message)); } }} className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20">
            🗑️ Limpiar Pagos
          </Button>
        </div>
      </div>

      {/* Filtros de período */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50 font-medium">Año</label>
              <Select value={filterAno} onValueChange={setFilterAno}>
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
              <Select value={filterMes} onValueChange={setFilterMes}>
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
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Pagos */}
      {showTable && (
        <>
          <Card>
            <CardContent className="pt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">Pagos Registrados</h3>
                <p className="text-sm text-muted-foreground">
                  Total: <span className="text-green-500 font-medium">{formatCurrency(totalPagos)}</span> en {pagos?.length || 0} pagos
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Propietario</TableHead>
                    <TableHead>Casa</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Referencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPagos ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="flex justify-center items-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-500"></div>
                          <span>Cargando...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : pagos && pagos.length > 0 ? (
                    pagos.map((pago) => (
                      <TableRow key={pago.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="text-sm">
                          {new Date(pago.fecha_pago).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{pago.propietario || 'Sin nombre'}</p>
                            <p className="text-xs text-muted-foreground">{pago.cedula || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {pago.numero_casa ? `MZ ${pago.manzana_id} - ${pago.numero_casa}` : '-'}
                        </TableCell>
                        <TableCell>{getMetodoBadge(pago.metodo_pago)}</TableCell>
                        <TableCell className="text-right text-green-500 font-medium">
                          {formatCurrency(pago.monto)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {pago.referencia || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay pagos registrados para este período
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-purple-400" />
              Importar Pagos desde Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-400 mb-2">Formato requerido:</h4>
              <ul className="text-xs text-white/70 space-y-1">
                <li><strong>cuenta:</strong> Número de cuenta</li>
                <li><strong>cliente:</strong> Cédula del propietario</li>
                <li><strong>abono:</strong> Monto del pago</li>
                <li><strong>pin:</strong> Referencia (opcional)</li>
                <li><strong>fecha_recaudo:</strong> Fecha y Hora (YYYY-MM-DD HH:MM:SS)</li>
                <li><strong>mes:</strong> Mes (1-12)</li>
                <li><strong>ano:</strong> Año (ej: 2026)</li>
              </ul>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload-pagos"
            />
            
            {!selectedFile ? (
              <label
                htmlFor="file-upload-pagos"
                className="flex items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors"
              >
                <div className="text-center">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-purple-400 mb-2" />
                  <p className="text-sm text-white/70">Seleccione archivo Excel</p>
                  <p className="text-xs text-white/50 mt-1">(.xlsx, .xls)</p>
                </div>
              </label>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <FileSpreadsheet className="h-8 w-8 text-green-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-xs text-white/50">
                      {parsedData ? `${parsedData.length} registros encontrados` : 'Procesando...'}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => { setSelectedFile(null); setParsedData(null); setParseErrors([]); }}
                    className="text-white/50 hover:text-white"
                  >
                    ✕
                  </Button>
                </div>

                {parseErrors.length > 0 && !parsedData && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-xs text-red-400 font-medium mb-1">Errores al leer archivo:</p>
                    <ul className="text-xs text-white/60 space-y-0.5">
                      {parseErrors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedData && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-sm text-blue-400 font-medium">
                      {parsedData.length} registros listos para importar
                    </p>
                    {parseErrors.length > 0 && (
                      <p className="text-xs text-yellow-400 mt-1">
                        ⚠️ {parseErrors.length} errores de formato (se ignorarán al importar)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {isImporting && (
              <div className="flex items-center justify-center gap-2 py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400"></div>
                <span className="text-sm text-white/70">Importando pagos...</span>
              </div>
            )}

            {importResult && (
              <div className={`rounded-lg p-4 ${importResult.errors.length > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="font-medium text-green-400">
                    {importResult.success} pagos importados exitosamente
                  </span>
                </div>
                
                {importResult.success_list.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-green-400 font-medium mb-1">Registros importados:</p>
                    <ul className="text-xs text-white/70 space-y-0.5 max-h-48 overflow-y-auto bg-green-500/10 rounded p-2">
                      {importResult.success_list.map((item, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
                          <span className="truncate">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {importResult.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-yellow-400 font-medium mb-1">Pagos ignorados:</p>
                    <ul className="text-xs text-white/60 space-y-0.5 max-h-32 overflow-y-auto">
                      {importResult.errors.slice(0, 15).map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                      {importResult.errors.length > 15 && (
                        <li className="text-yellow-400/70">... y {importResult.errors.length - 15} más</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setShowImportDialog(false);
              setSelectedFile(null);
              setParsedData(null);
              setImportResult(null);
              setParseErrors([]);
            }}>
              Cerrar
            </Button>
            {parsedData && parsedData.length > 0 && !importResult && (
              <Button onClick={handleImport} disabled={isImporting} className="bg-green-600 hover:bg-green-700">
                {isImporting ? 'Importando...' : `Importar ${parsedData.length} pagos`}
              </Button>
            )}
            {selectedFile && parsedData && importResult && (
              <Button onClick={() => {
                setSelectedFile(null);
                setParsedData(null);
                setImportResult(null);
              }} className="bg-green-600 hover:bg-green-700">
                Importar más
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formulario de Registro (solo visible cuando no está en modo tabla) */}
      {!showTable && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Búsqueda por Cédula
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="cedula">Número de Cédula</Label>
                  <Input
                    id="cedula"
                    placeholder="Ingrese la cédula del cliente"
                    value={cedula}
                    onChange={(e) => {
                      setCedula(e.target.value);
                      setSearchError('');
                      setRegistroExitoso(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleBuscar} className="w-full sm:w-auto">
                    <Search className="h-4 w-4 mr-2" />
                    Buscar
                  </Button>
                </div>
              </div>
              {searchError && (
                <p className="text-red-500 text-sm mt-2">{searchError}</p>
              )}
            </CardContent>
          </Card>

          {/* Información del Cliente */}
          {viviendaEncontrada && facturaEncontrada && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Información del Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Nombre</p>
                        <p className="font-medium">{viviendaEncontrada.propietario}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Home className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Casa</p>
                        <p className="font-medium">MZ {viviendaEncontrada.manzana_id} - {viviendaEncontrada.numero_casa}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Phone className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Teléfono</p>
                        <p className="font-medium">{viviendaEncontrada.telefono || viviendaEncontrada.whatsapp || 'No registrado'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Receipt className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total a Pagar</p>
                        <p className="font-medium text-lg">{formatCurrency(facturaEncontrada.total || 0)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-muted-foreground">Ya Pagado</p>
                      <p className="text-lg font-medium text-green-600">{formatCurrency(facturaEncontrada.total_pagado || 0)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                      <p className="text-lg font-medium text-green-600">{formatCurrency(saldoPendiente)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Estado Actual</p>
                      <div className="mt-1">{getEstadoFactura()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Formulario de Pago */}
              {facturaEncontrada.estado !== 'pagada' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Registrar Pago
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {registroExitoso && (
                      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                        ¡Pago registrado exitosamente!
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="monto">Valor del Pago</Label>
                        <Input
                          id="monto"
                          type="number"
                          placeholder="0"
                          value={pagoData.monto}
                          onChange={(e) => setPagoData({ ...pagoData, monto: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="fecha">Fecha</Label>
                        <Input
                          id="fecha"
                          type="date"
                          value={new Date().toISOString().split('T')[0]}
                          disabled
                          className="mt-1 bg-muted"
                        />
                      </div>
                      <div>
                        <Label htmlFor="hora">Hora (HH:MM)</Label>
                        <Input
                          id="hora"
                          type="time"
                          value={pagoData.hora}
                          onChange={(e) => setPagoData({ ...pagoData, hora: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="metodo">Método de Pago</Label>
                        <Select value={pagoData.metodo_pago} onValueChange={(v) => setPagoData({ ...pagoData, metodo_pago: v })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="nequi">Nequi</SelectItem>
                            <SelectItem value="daviplata">Daviplata</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Label htmlFor="observaciones">Observaciones (opcional)</Label>
                      <Input
                        id="observaciones"
                        placeholder="Observaciones del pago"
                        value={pagoData.observaciones}
                        onChange={(e) => setPagoData({ ...pagoData, observaciones: e.target.value })}
                        className="mt-1"
                      />
                    </div>

                    {getResultadoPago()}

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCedula('');
                          setPagoData({ monto: '', metodo_pago: 'efectivo', hora: '', observaciones: '' });
                          setRegistroExitoso(false);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleRegistrarPago}
                        disabled={!pagoData.monto || registrarPagoMutation.isPending}
                      >
                        {registrarPagoMutation.isPending ? 'Registrando...' : 'Registrar Pago'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {facturaEncontrada.estado === 'pagada' && (
                <Card className="border-green-500">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center gap-3 text-green-600">
                      <CheckCircle className="h-8 w-8" />
                      <span className="text-xl font-medium">Esta factura ya está PAGADA</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
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
