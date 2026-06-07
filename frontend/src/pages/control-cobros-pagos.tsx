import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Home, Receipt, Save, Search, User, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Configuracion, Factura, Pago, Vivienda } from '@/types';
import { formatCurrency, formatDateTime, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

const anos = Array.from({ length: 7 }, (_, i) => (new Date().getFullYear() - 2 + i).toString());

function getPeriodoConsumo(anoCobro: number, mesCobro: number) {
  if (mesCobro === 1) return { ano: anoCobro - 1, mes: 12 };
  return { ano: anoCobro, mes: mesCobro - 1 };
}

function normalizeManzana(value?: string | number | null) {
  const raw = String(value || '').trim();
  if (!raw) return 'MZ';
  return /^mz\b/i.test(raw) ? raw.replace(/\s+/g, ' ') : `MZ ${raw}`;
}

function getCasaLabel(vivienda?: Vivienda) {
  if (!vivienda) return '-';
  return `${normalizeManzana(vivienda.manzana_codigo || vivienda.manzana_id)} - C ${String(vivienda.numero_casa).padStart(2, '0')}`;
}

function getEstadoLabel(factura: Factura) {
  const total = factura.total || 0;
  const pagado = factura.total_pagado || 0;
  const saldo = total - pagado;
  if (saldo < 0) return 'SOBREPAGO';
  if (saldo <= 1) return 'PAGADO';
  if (pagado > 0) return 'ABONO';
  return 'PENDIENTE';
}

function buildReferencePreview(factura?: Factura | null) {
  if (!factura) return '';
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `REC-${factura.numero_factura || `FAC-${factura.id}`}-${stamp}`;
}

export default function ControlCobrosPagosPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const currentPeriod = getCurrentPeriod();
  const periodoInicializadoRef = useRef(false);

  const [selectedAno, setSelectedAno] = useState(currentPeriod.ano.toString());
  const [selectedMes, setSelectedMes] = useState(currentPeriod.mes.toString());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFacturaId, setSelectedFacturaId] = useState<number | null>(null);
  const [pagoData, setPagoData] = useState({
    tipo_pago: 'abono',
    monto: '',
    metodo_pago: 'efectivo',
    observaciones: '',
  });
  const [message, setMessage] = useState('');

  const ano = Number(selectedAno);
  const mes = Number(selectedMes);
  const periodoConsumo = getPeriodoConsumo(ano, mes);

  const { data: configuracionesActuales } = useQuery<Configuracion[]>({
    queryKey: ['configuraciones-actuales', 'control-cobros-pagos'],
    queryFn: () => api.get<Configuracion[]>('/configuraciones/actuales', token || undefined),
    enabled: !!token,
  });

  useEffect(() => {
    if (periodoInicializadoRef.current || !configuracionesActuales?.length) return;
    const anioConfig = configuracionesActuales.find((config) => config.clave === 'periodo_anio')?.valor;
    const mesConfig = configuracionesActuales.find((config) => config.clave === 'periodo_mes')?.valor;
    const anio = Number(anioConfig);
    const mesConfigNumber = Number(mesConfig);
    if (!Number.isNaN(anio) && anio > 0 && !Number.isNaN(mesConfigNumber) && mesConfigNumber >= 1 && mesConfigNumber <= 12) {
      setSelectedAno(String(anio));
      setSelectedMes(String(mesConfigNumber));
    }
    periodoInicializadoRef.current = true;
  }, [configuracionesActuales]);

  const { data: facturas, isLoading: loadingFacturas } = useQuery<Factura[]>({
    queryKey: ['control-cobros-pagos-facturas', ano, mes],
    queryFn: () => api.get<Factura[]>(`/facturas?ano_cobro=${ano}&mes_cobro=${mes}`, token || undefined),
    enabled: !!token,
  });

  const { data: viviendas } = useQuery<Vivienda[]>({
    queryKey: ['viviendas'],
    queryFn: () => api.get<Vivienda[]>('/viviendas', token || undefined),
    enabled: !!token,
  });

  const { data: pagos } = useQuery<Pago[]>({
    queryKey: ['control-cobros-pagos-pagos', periodoConsumo.ano, periodoConsumo.mes, searchTerm],
    queryFn: () => {
      const params = new URLSearchParams({ ano: String(periodoConsumo.ano), mes: String(periodoConsumo.mes) });
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      return api.get<Pago[]>(`/pagos?${params.toString()}`, token || undefined);
    },
    enabled: !!token,
  });

  const registrarPagoMutation = useMutation({
    mutationFn: ({ facturaId, data }: { facturaId: number; data: Record<string, unknown> }) =>
      api.post(`/facturas/${facturaId}/pago`, data, token || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-cobros-pagos-facturas'] });
      queryClient.invalidateQueries({ queryKey: ['control-cobros-pagos-pagos'] });
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['pagos'] });
      setPagoData({ tipo_pago: 'abono', monto: '', metodo_pago: 'efectivo', observaciones: '' });
      setMessage('Pago registrado y tabla actualizada.');
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el pago.');
    },
  });

  const viviendasById = useMemo(() => new Map((viviendas || []).map((vivienda) => [vivienda.id, vivienda])), [viviendas]);

  const filteredFacturas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const rows = facturas || [];
    if (!q) return rows;
    return rows.filter((factura) => {
      const vivienda = viviendasById.get(factura.vivienda_id);
      const casa = getCasaLabel(vivienda).toLowerCase();
      return (
        factura.numero_factura?.toLowerCase().includes(q) ||
        vivienda?.propietario?.toLowerCase().includes(q) ||
        vivienda?.cedula?.toLowerCase().includes(q) ||
        vivienda?.numero_casa?.toLowerCase().includes(q) ||
        casa.includes(q) ||
        String(vivienda?.manzana_id || '').includes(q)
      );
    });
  }, [facturas, searchTerm, viviendasById]);

  const selectedFactura = useMemo(() => (facturas || []).find((factura) => factura.id === selectedFacturaId) || null, [facturas, selectedFacturaId]);
  const selectedVivienda = selectedFactura ? viviendasById.get(selectedFactura.vivienda_id) : undefined;
  const saldoActual = selectedFactura ? Math.max((selectedFactura.total || 0) - (selectedFactura.total_pagado || 0), 0) : 0;
  const monto = Number(pagoData.monto || 0);
  const saldoDespues = saldoActual - monto;

  useEffect(() => {
    if (!selectedFactura) return;
    setMessage('');
    setPagoData((prev) => ({
      ...prev,
      monto: prev.tipo_pago === 'pago_total' ? String(Math.round(saldoActual)) : prev.monto,
    }));
  }, [selectedFactura, saldoActual]);

  useEffect(() => {
    if (pagoData.tipo_pago !== 'pago_total') return;
    setPagoData((prev) => ({ ...prev, monto: String(Math.round(saldoActual)) }));
  }, [pagoData.tipo_pago, saldoActual]);

  const resumen = useMemo(() => {
    return (facturas || []).reduce(
      (acc, factura) => {
        const total = factura.total || 0;
        const pagado = factura.total_pagado || 0;
        acc.facturado += total;
        acc.pagado += pagado;
        acc.pendiente += total - pagado;
        return acc;
      },
      { facturado: 0, pagado: 0, pendiente: 0 }
    );
  }, [facturas]);

  const handleRegistrarPago = () => {
    setMessage('');
    if (!selectedFactura) {
      setMessage('Selecciona una factura para registrar el pago.');
      return;
    }
    if (!monto || Number.isNaN(monto) || monto <= 0) {
      setMessage('Ingresa un valor de pago valido.');
      return;
    }

    registrarPagoMutation.mutate({
      facturaId: selectedFactura.id,
      data: {
        monto,
        tipo_pago: pagoData.tipo_pago,
        metodo_pago: pagoData.metodo_pago,
        referencia: buildReferencePreview(selectedFactura),
        fecha_pago: new Date().toISOString(),
        concepto:
          pagoData.observaciones ||
          `${pagoData.tipo_pago === 'pago_total' ? 'Pago total' : 'Abono'} ${getMonthName(mes)} ${ano} - ${selectedVivienda?.propietario || selectedFactura.numero_factura}`,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Control de Cobros y Pagos</h1>
        <p className="text-muted-foreground">Consulta por periodo, busca por cedula, nombre, casa, factura o referencia y registra pagos.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Facturado</p><p className="text-2xl font-bold">{formatCurrency(resumen.facturado)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Recaudado</p><p className="text-2xl font-bold text-emerald-500">{formatCurrency(resumen.pagado)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pendiente</p><p className="text-2xl font-bold text-amber-500">{formatCurrency(resumen.pendiente)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Filtros</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <Label>Mes de cobro</Label>
              <Select value={selectedMes} onValueChange={setSelectedMes}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{meses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano de cobro</Label>
              <Select value={selectedAno} onValueChange={setSelectedAno}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{anos.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Buscar por manzana, cedula, nombre, casa, factura o referencia</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-10" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Ej: MZ 184, 40361567, Claudia, FAC..." />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" /> Registrar pago</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {selectedFactura ? (
              <>
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <p className="flex items-center gap-2"><Home className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{getCasaLabel(selectedVivienda)}</span></p>
                  <p className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{selectedVivienda?.propietario || '-'} · {selectedVivienda?.cedula || '-'}</p>
                  <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />{getMonthName(mes)} {ano}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-md border p-3"><p className="text-muted-foreground">Saldo actual</p><p className="font-bold">{formatCurrency(saldoActual)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-muted-foreground">Saldo despues</p><p className={saldoDespues <= 0 ? 'font-bold text-emerald-600' : 'font-bold text-amber-600'}>{formatCurrency(saldoDespues)}</p></div>
                  <div className="rounded-md border p-3 md:col-span-2"><p className="text-muted-foreground">Referencia automatica</p><p className="truncate font-mono text-xs">{buildReferencePreview(selectedFactura)}</p></div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={pagoData.tipo_pago} onValueChange={(value) => setPagoData((prev) => ({ ...prev, tipo_pago: value }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="abono">Abono</SelectItem>
                        <SelectItem value="pago_total">Pago total</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor recibido</Label>
                    <Input className="mt-1" type="number" min={0} step="100" value={pagoData.monto} onChange={(event) => setPagoData((prev) => ({ ...prev, monto: event.target.value }))} placeholder="0" />
                  </div>
                  <div>
                    <Label>Metodo</Label>
                    <Select value={pagoData.metodo_pago} onValueChange={(value) => setPagoData((prev) => ({ ...prev, metodo_pago: value }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="nequi">Nequi</SelectItem>
                        <SelectItem value="daviplata">Daviplata</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Observacion</Label>
                    <Input className="mt-1" value={pagoData.observaciones} onChange={(event) => setPagoData((prev) => ({ ...prev, observaciones: event.target.value }))} placeholder="Opcional" />
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">{message || 'El monto queda editable aunque selecciones pago total.'}</p>
                  <Button onClick={handleRegistrarPago} disabled={registrarPagoMutation.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    Guardar pago
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Selecciona un recibo de la tabla inferior para registrar un abono o pago total.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ultimos pagos del periodo</CardTitle></CardHeader>
          <CardContent className="max-h-[295px] space-y-3 overflow-y-auto">
            {(pagos || []).slice(0, 8).map((pago) => (
              <div key={pago.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{pago.propietario || pago.cedula || 'Pago'}</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(pago.monto)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{pago.referencia || pago.numero_factura || 'Sin referencia'} · {pago.metodo_pago || 'Sin metodo'} · {formatDateTime(pago.fecha_pago)}</div>
              </div>
            ))}
            {(pagos || []).length === 0 && <p className="text-sm text-muted-foreground">No hay pagos registrados para este periodo.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Recibos del periodo</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {loadingFacturas ? (
            <p>Cargando facturas...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Casa</TableHead>
                  <TableHead>Propietario</TableHead>
                  <TableHead>Cedula</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFacturas.map((factura) => {
                  const vivienda = viviendasById.get(factura.vivienda_id);
                  const saldo = (factura.total || 0) - (factura.total_pagado || 0);
                  const selected = factura.id === selectedFacturaId;
                  return (
                    <TableRow key={factura.id} className={selected ? 'bg-emerald-500/10' : undefined}>
                      <TableCell className="font-medium">{getCasaLabel(vivienda)}</TableCell>
                      <TableCell>{vivienda?.propietario || '-'}</TableCell>
                      <TableCell>{vivienda?.cedula || '-'}</TableCell>
                      <TableCell>{factura.numero_factura || `FAC-${factura.id}`}</TableCell>
                      <TableCell className="text-right">{formatCurrency(factura.total || 0)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{formatCurrency(factura.total_pagado || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(saldo)}</TableCell>
                      <TableCell>{getEstadoLabel(factura)}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant={selected ? 'default' : 'outline'} onClick={() => setSelectedFacturaId(factura.id)}>Seleccionar</Button></TableCell>
                    </TableRow>
                  );
                })}
                {filteredFacturas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No hay facturas para los filtros seleccionados.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
