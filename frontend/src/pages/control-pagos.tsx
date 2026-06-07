import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { api, apiUrl } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LecturaPlanillaRow, Factura, Configuracion } from '@/types';
import { calcularCobroLectura } from '@/lib/cobros';
import { formatCurrency, formatKwh, formatReadingInputValue, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, FileSpreadsheet, MessageCircle, Printer, Save, Search, Trash2, Upload, AlertCircle, SlidersHorizontal, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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

const anos = Array.from({ length: 6 }, (_, i) => (new Date().getFullYear() - 2 + i).toString());

function getPeriodoConsumo(anoCobro: number, mesCobro: number) {
  if (mesCobro === 1) {
    return { ano: anoCobro - 1, mes: 12 };
  }
  return { ano: anoCobro, mes: mesCobro - 1 };
}

type ControlPagosPageProps = {
  variant?: 'facturacion' | 'lecturas';
};

export function ControlPagosPage({ variant = 'facturacion' }: ControlPagosPageProps) {
  const isLecturas = variant === 'lecturas';
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const { ano: currentAno, mes: currentMes } = getCurrentPeriod();

  const [selectedAnoCobro, setSelectedAnoCobro] = useState(String(currentAno));
  const [selectedMesCobro, setSelectedMesCobro] = useState(String(currentMes));
  const [searchTerm, setSearchTerm] = useState('');
  const [lecturasAnteriorForm, setLecturasAnteriorForm] = useState<Record<number, string>>({});
  const [lecturasForm, setLecturasForm] = useState<Record<number, string>>({});
  const [errorByVivienda, setErrorByVivienda] = useState<Record<number, string>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveSummary, setSaveSummary] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showPlanillaDialog, setShowPlanillaDialog] = useState(false);
  const [showQuickEditDialog, setShowQuickEditDialog] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState<LecturaPlanillaRow | null>(null);
  const [planillaFontSize, setPlanillaFontSize] = useState('grande');
  const [planillaFormato, setPlanillaFormato] = useState('excel');
  const [quickViviendaId, setQuickViviendaId] = useState('');
  const [quickLecturaActual, setQuickLecturaActual] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [showHistoricoDialog, setShowHistoricoDialog] = useState(false);
  const [historicoRows, setHistoricoRows] = useState<Record<string, unknown>[]>([]);
  const [historicoProcesando, setHistoricoProcesando] = useState(false);
  const [historicoResult, setHistoricoResult] = useState<{
    procesados: number;
    facturas_creadas: string[];
    tarifas_creadas: string[];
    advertencias_tarifa_existente: string[];
    diferencias_valor: { cedula: string; ano: number; mes: number; valor_hoja: number; valor_calculado: number; delta: number }[];
    errores: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const periodoInicializadoRef = useRef(false);
  const [showPazSalvoDialog, setShowPazSalvoDialog] = useState(false);
  const [pazSalvoSearch, setPazSalvoSearch] = useState('');

  const anoCobro = parseInt(selectedAnoCobro);
  const mesCobro = parseInt(selectedMesCobro);
  const periodoConsumo = getPeriodoConsumo(anoCobro, mesCobro);

  const { data: configuracionesActuales } = useQuery<Configuracion[]>({
    queryKey: ['configuraciones-actuales', 'control-pagos'],
    queryFn: () => api.get<Configuracion[]>('/configuraciones/actuales', token || undefined),
    enabled: !!token,
  });

  useEffect(() => {
    if (periodoInicializadoRef.current || !configuracionesActuales?.length) return;
    const anioConfig = configuracionesActuales.find((config) => config.clave === 'periodo_anio')?.valor;
    const mesConfig = configuracionesActuales.find((config) => config.clave === 'periodo_mes')?.valor;
    const anio = Number(anioConfig);
    const mes = Number(mesConfig);
    if (!Number.isNaN(anio) && anio > 0 && !Number.isNaN(mes) && mes >= 1 && mes <= 12) {
      setSelectedAnoCobro(String(anio));
      setSelectedMesCobro(String(mes));
    }
    periodoInicializadoRef.current = true;
  }, [configuracionesActuales]);

  const { data: planilla, isLoading, error } = useQuery<LecturaPlanillaRow[]>({
    queryKey: ['control-cobros-planilla', periodoConsumo.ano, periodoConsumo.mes],
    queryFn: () =>
      api.get<LecturaPlanillaRow[]>(
        `/lecturas/planilla?ano=${periodoConsumo.ano}&mes=${periodoConsumo.mes}`,
        token || undefined
      ),
    enabled: !!token,
  });

  const { data: facturas } = useQuery<Factura[]>({
    queryKey: ['control-cobros-facturas', anoCobro, mesCobro],
    queryFn: () =>
      api.get<Factura[]>(
        `/facturas?ano_cobro=${anoCobro}&mes_cobro=${mesCobro}`,
        token || undefined
      ),
    enabled: !!token,
  });

  const borrarRegistroMutation = useMutation({
    mutationFn: (payload: { vivienda_id: number; ano: number; mes: number }) =>
      api.delete(
        `/control-cobros/${payload.vivienda_id}?ano=${payload.ano}&mes=${payload.mes}`,
        token || undefined
      ),
    onSuccess: (_, payload) => {
      setLecturasForm((prev) => {
        const next = { ...prev };
        delete next[payload.vivienda_id];
        return next;
      });
      setLecturasAnteriorForm((prev) => {
        const next = { ...prev };
        delete next[payload.vivienda_id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['control-cobros-planilla'] });
      queryClient.invalidateQueries({ queryKey: ['control-cobros-facturas'] });
      queryClient.invalidateQueries({ queryKey: ['lecturas'] });
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['viviendas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pagos'] });
    },
  });

  const filteredRows = useMemo(() => {
    const source = (planilla || []).slice().sort((a, b) => {
      const manzanaDiff = Number(a.manzana_id) - Number(b.manzana_id);
      if (manzanaDiff !== 0) return manzanaDiff;
      const casaDiff = Number(a.numero_casa) - Number(b.numero_casa);
      if (!Number.isNaN(casaDiff) && casaDiff !== 0) return casaDiff;
      return String(a.numero_casa).localeCompare(String(b.numero_casa), 'es', { numeric: true });
    });
    if (!searchTerm.trim()) return source;
    const q = searchTerm.toLowerCase();
    return source.filter((row) =>
      row.propietario.toLowerCase().includes(q) ||
      row.numero_casa.toLowerCase().includes(q) ||
      (row.manzana_codigo || '').toLowerCase().includes(q) ||
      (row.telefono || '').toLowerCase().includes(q) ||
      String(row.manzana_id).includes(q) ||
      (row.cedula || '').toLowerCase().includes(q)
    );
  }, [planilla, searchTerm]);

  const getInputValue = (row: LecturaPlanillaRow) => {
    const draft = lecturasForm[row.vivienda_id];
    if (draft !== undefined) return draft;
    return formatReadingInputValue(row.lectura_actual);
  };

  const getLecturaAnteriorInputValue = (row: LecturaPlanillaRow) => {
    const draft = lecturasAnteriorForm[row.vivienda_id];
    if (draft !== undefined) return draft;
    return formatReadingInputValue(row.lectura_anterior ?? 0);
  };

  const getFactura = (viviendaId: number) =>
    facturas?.find((f) => f.vivienda_id === viviendaId);

  const getEstadoPago = (row: LecturaPlanillaRow) => {
    const factura = getFactura(row.vivienda_id);
    if (!factura && row.lectura_actual !== null && row.lectura_actual !== undefined) return 'acumulado';
    if (!factura) return row.estado_vivienda === 'activo' ? 'pendiente' : 'inactiva';
    return factura.estado;
  };

  const getValoresCalculados = (row: LecturaPlanillaRow) => {
    const factura = getFactura(row.vivienda_id);
    const pago = factura?.total_pagado || 0;
    const lecturaAnteriorInput = Number(getLecturaAnteriorInputValue(row));
    const lecturaActualInputRaw = getInputValue(row).trim();
    const lecturaActualInput = lecturaActualInputRaw === '' ? null : Number(lecturaActualInputRaw);

    let consumoKwh = row.consumo_kwh;
    let consumoSubsidiado = row.consumo_subsidiado;
    let consumoSinSubsidio = row.consumo_sin_subsidio;
    let valorSubsidio = row.precio_subsidiado;
    let valorSinSubsidio = row.precio_sin_subsidio;
    let totalFactura = row.total_factura;

    if (
      row.estado_vivienda === 'activo' &&
      lecturaActualInput !== null &&
      !Number.isNaN(lecturaActualInput) &&
      !Number.isNaN(lecturaAnteriorInput) &&
      lecturaActualInput >= lecturaAnteriorInput
    ) {
      const calculo = calcularCobroLectura({
        lecturaAnterior: lecturaAnteriorInput,
        lecturaActual: lecturaActualInput,
        cargosFijosTotal: row.cobros_fijos || 0,
        configuracion: {
          anio: periodoConsumo.ano,
          mes: periodoConsumo.mes,
          limiteSubsidio: row.limite_subsidio || 184,
          tarifaSubsidiada: row.tarifa_subsidiada || 0,
          tarifaPlena: row.tarifa_plena || 0,
        },
      });
      consumoKwh = calculo.consumoTotal;
      consumoSubsidiado = calculo.consumoConSubsidio;
      consumoSinSubsidio = calculo.consumoSinSubsidio;
      valorSubsidio = calculo.valorSubsidiado;
      valorSinSubsidio = calculo.valorSinSubsidio;
      totalFactura = calculo.totalCobrar;
      if (!factura && calculo.consumoTotal < 6) {
        valorSubsidio = 0;
        valorSinSubsidio = 0;
        totalFactura = 0;
      }
    }

    return {
      factura,
      pago,
      lecturaAnteriorInput,
      lecturaActualInput,
      consumoKwh,
      consumoSubsidiado,
      consumoSinSubsidio,
      valorSubsidio,
      valorSinSubsidio,
      totalFactura,
      saldo: (totalFactura || 0) - pago,
      descuentoPct: 0,
      descuentoValor: 0,
      estado: getEstadoPago(row),
    };
  };

  const getCasaLabel = (row: LecturaPlanillaRow) => {
    const manzana = row.manzana_codigo || `MZ ${row.manzana_id}`;
    return `${manzana} - C ${row.numero_casa.padStart(2, '0')}`;
  };

  const getFacturaFilename = (row: LecturaPlanillaRow) => {
    const cedula = (row.cedula || 'sin-cedula').replace(/[^\w-]/g, '');
    return `factura-${cedula} ${getMonthName(mesCobro)} - ${anoCobro}.pdf`;
  };

  const normalizarCelularColombia = (telefono?: string) => {
    const digits = String(telefono || '').replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    if (digits.length === 12 && digits.startsWith('57')) return digits;
    return '';
  };

  const buildLecturaPayload = (row: LecturaPlanillaRow) => {
    const raw = getInputValue(row).trim();
    const lecturaActual = raw === '' ? null : Number(raw);
    const lecturaAnterior = Number(getLecturaAnteriorInputValue(row));

    if (lecturaActual !== null && Number.isNaN(lecturaActual)) {
      return { error: 'La lectura actual debe ser numérica' };
    }
    if (lecturaActual !== null && lecturaActual < 0) {
      return { error: 'No se permiten lecturas negativas' };
    }
    if (Number.isNaN(lecturaAnterior) || lecturaAnterior < 0) {
      return { error: 'Lectura anterior invalida' };
    }
    if (lecturaActual !== null && lecturaActual < lecturaAnterior) {
      return { error: `Debe ser >= lectura anterior (${lecturaAnterior})` };
    }

    return {
      payload: {
        vivienda_id: row.vivienda_id,
        ano: periodoConsumo.ano,
        mes: periodoConsumo.mes,
        lectura_anterior: lecturaAnterior,
        lectura_actual: lecturaActual,
        estado: isLecturas ? 'pendiente_revision' : 'facturada',
      },
    };
  };
  const hasPendingChanges = (row: LecturaPlanillaRow) =>
    lecturasForm[row.vivienda_id] !== undefined ||
    lecturasAnteriorForm[row.vivienda_id] !== undefined;

  const pendingRows = useMemo(
    () => (planilla || []).filter((row) => row.estado_vivienda === 'activo' && hasPendingChanges(row)),
    [planilla, lecturasForm, lecturasAnteriorForm]
  );

  const guardarCambiosPendientes = async () => {
    if (!pendingRows.length) {
      setSaveSummary('No hay cambios pendientes para guardar.');
      toast.info('No hay cambios pendientes para guardar.');
      return;
    }

    setIsSavingAll(true);
    setSaveSummary('');
    const errors: Record<number, string> = {};
    const savedRows: Array<{ row: LecturaPlanillaRow; payload: { lectura_anterior: number; lectura_actual: number | null } }> = [];
    let saved = 0;

    for (const row of pendingRows) {
      const result = buildLecturaPayload(row);
      if ('error' in result) {
        errors[row.vivienda_id] = result.error || 'No se pudo validar la lectura';
        continue;
      }
      try {
        await api.post(
          isLecturas ? '/lecturas/borrador' : '/facturacion/aprobar',
          result.payload,
          token || undefined
        );
        savedRows.push({
          row,
          payload: {
            lectura_anterior: result.payload.lectura_anterior,
            lectura_actual: result.payload.lectura_actual,
          },
        });
        saved += 1;
      } catch (error) {
        errors[row.vivienda_id] = error instanceof Error ? error.message : 'No se pudo guardar';
      }
    }

    setErrorByVivienda(errors);
    setIsSavingAll(false);

    if (saved > 0) {
      queryClient.setQueryData<LecturaPlanillaRow[]>(
        ['control-cobros-planilla', periodoConsumo.ano, periodoConsumo.mes],
        (current) => {
          if (!current) return current;
          return current.map((row) => {
            const savedRow = savedRows.find((item) => item.row.vivienda_id === row.vivienda_id);
            if (!savedRow) return row;

            const lecturaActualGuardada = savedRow.payload.lectura_actual;
            const hasActual = lecturaActualGuardada !== null;
            const consumo = hasActual ? lecturaActualGuardada - savedRow.payload.lectura_anterior : 0;
            const consumoSubsidiado = Math.min(consumo, row.limite_subsidio || 184);
            const consumoSinSubsidio = Math.max(consumo - (row.limite_subsidio || 184), 0);
            const precioSubsidiado = consumoSubsidiado * (row.tarifa_subsidiada || 0);
            const precioSinSubsidio = consumoSinSubsidio * (row.tarifa_plena || 0);
            const debeAcumular = !row.factura_id && consumo < 6;
            const totalFactura = !hasActual || debeAcumular ? 0 : precioSubsidiado + precioSinSubsidio + (row.cobros_fijos || 0);

            return {
              ...row,
              lectura_anterior: savedRow.payload.lectura_anterior,
              lectura_actual: savedRow.payload.lectura_actual,
              consumo_kwh: consumo,
              consumo_subsidiado: consumoSubsidiado,
              consumo_sin_subsidio: consumoSinSubsidio,
              precio_subsidiado: debeAcumular ? 0 : precioSubsidiado,
              precio_sin_subsidio: debeAcumular ? 0 : precioSinSubsidio,
              total_factura: totalFactura,
              lectura_estado: isLecturas ? 'pendiente_revision' : 'facturada',
              requiere_lectura: false,
            };
          });
        }
      );
      setLecturasForm((prev) => {
        const next = { ...prev };
        pendingRows.forEach((row) => {
          if (!errors[row.vivienda_id]) delete next[row.vivienda_id];
        });
        return next;
      });
      setLecturasAnteriorForm((prev) => {
        const next = { ...prev };
        pendingRows.forEach((row) => {
          if (!errors[row.vivienda_id]) delete next[row.vivienda_id];
        });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['control-cobros-planilla'] });
      queryClient.invalidateQueries({ queryKey: ['control-cobros-facturas'] });
      queryClient.invalidateQueries({ queryKey: ['lecturas'] });
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['viviendas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pagos'] });
    }

    const failed = Object.keys(errors).length;
    setSaveSummary(
      failed
        ? `Se guardaron ${saved} registros y ${failed} quedaron con errores.`
        : `Se guardaron ${saved} registros correctamente.`
    );
    if (failed) {
      toast.warning('Guardado parcial', {
        description: `Se guardaron ${saved} registros y ${failed} quedaron con errores.`,
      });
    } else {
      toast.success('Lecturas guardadas', {
        description: `Se guardaron ${saved} registros correctamente.`,
      });
    }
  };

  const descargarFacturaPdf = async (row: LecturaPlanillaRow) => {
    const facturaId = row.factura_id;
    if (!facturaId) return;
    if (!token) return;
    const response = await fetch(apiUrl(`/api/v1/facturas/${facturaId}/pdf`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      toast.error('No se pudo descargar el PDF individual.');
      throw new Error(`No se pudo descargar la factura PDF (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFacturaFilename(row);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('PDF individual descargado.');
  };

  const enviarFacturaWhatsApp = async (row: LecturaPlanillaRow) => {
    if (!row.factura_id) {
      toast.error('No existe factura para este registro.');
      return;
    }
    const telefono = normalizarCelularColombia(row.telefono);
    if (!telefono) {
      toast.error('El propietario no tiene celular valido para WhatsApp.');
      return;
    }

    toast.info('Se descargará el recibo. Luego adjúntalo en WhatsApp.');
    await descargarFacturaPdf(row);
    const total = formatCurrency(getValoresCalculados(row).totalFactura || 0);
    const mensaje = [
      `Hola ${row.propietario}, te compartimos el recibo PDF del servicio de energía correspondiente al periodo ${getMonthName(mesCobro)} - ${anoCobro}.`,
      `Total a pagar: ${total}.`,
      'Comunidad Portales del Paraíso.',
      'Adjunta el PDF descargado en este chat.'
    ].join('\n');
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
    toast.success('WhatsApp preparado', {
      description: 'Se descargo el PDF y se abrio WhatsApp con el mensaje listo.',
    });
  };

  const descargarFacturaPdfSoloMes = async (row: LecturaPlanillaRow) => {
    const facturaId = row.factura_id;
    if (!facturaId) return;
    if (!token) return;
    const response = await fetch(apiUrl(`/api/v1/facturas/${facturaId}/pdf-mes`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      toast.error('No se pudo descargar el PDF (solo mes).');
      throw new Error(`No se pudo descargar la factura PDF solo mes (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solo-mes-${getFacturaFilename(row)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('PDF (solo mes) descargado.');
  };

  const descargarPdfMasivoSoloMes = async () => {
    if (!token) return;
    const response = await fetch(
      apiUrl(`/api/v1/facturas/pdf-masivo-mes?ano=${periodoConsumo.ano}&mes=${periodoConsumo.mes}&ano_cobro=${anoCobro}&mes_cobro=${mesCobro}`),
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      toast.error('No se pudo descargar el PDF masivo (solo mes).');
      throw new Error(`No se pudo descargar el PDF masivo solo mes (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibos-solo-mes_${anoCobro}_${String(mesCobro).padStart(2, '0')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('PDF masivo (solo mes) generado.');
  };

  const descargarPazSalvo = async (row: LecturaPlanillaRow) => {
    if (!token) return;
    try {
      const response = await fetch(apiUrl(`/api/v1/viviendas/${row.vivienda_id}/paz-y-salvo`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        toast.error('No se pudo generar el paz y salvo.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cedula = (row.cedula || 'sincedula').replace(/\s+/g, '');
      a.href = url;
      a.download = `paz-y-salvo-${cedula}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Paz y salvo generado para ${row.propietario}`);
    } catch {
      toast.error('Error al generar el paz y salvo.');
    }
  };

  const pazSalvoMatches = (() => {
    const term = pazSalvoSearch.trim().toLowerCase();
    if (!term || !planilla) return [];
    return planilla
      .filter((r) =>
        (r.cedula || '').toLowerCase().includes(term) ||
        (r.propietario || '').toLowerCase().includes(term) ||
        String(r.numero_casa || '').toLowerCase().includes(term)
      )
      .slice(0, 8);
  })();

  const descargarPlantillaHistorico = async () => {
    if (!token) return;
    const response = await fetch(apiUrl(`/api/v1/facturas/importar-historico/plantilla`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      toast.error('No se pudo descargar la plantilla.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_historico.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const cargarArchivoHistorico = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        setHistoricoRows(parsed);
        setHistoricoResult(null);
        toast.success(`${parsed.length} filas leídas. Revisa y procesa.`);
      } catch {
        toast.error('No se pudo leer el archivo.');
        setHistoricoRows([]);
      } finally {
        if (event.target) event.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const procesarHistorico = async () => {
    if (!token || historicoRows.length === 0) return;
    const num = (v: unknown, def: number | null = 0): number | null => {
      if (v === '' || v === null || v === undefined) return def;
      const n = Number(String(v).replace(/[, $]/g, ''));
      return Number.isNaN(n) ? def : n;
    };
    const payload = historicoRows.map((r) => ({
      cedula: String(r.CEDULA ?? r.cedula ?? '').trim(),
      ano: Number(r.ANO ?? r['AÑO'] ?? r.ano ?? 0),
      mes_consumo: Number(r.MES_CONSUMO ?? r.mes_consumo ?? 0),
      lectura_anterior: num(r.L_ANTERIOR ?? r.lectura_anterior, null),
      lectura_actual: num(r.L_ACTUAL ?? r.lectura_actual, 0),
      precio_kwh_subsidiado: num(r.PRECIO_KWH_SUBSIDIADO ?? r.precio_kwh_subsidiado, 0),
      precio_kwh_no_subsidiado: num(r.PRECIO_KWH_NO_SUBSIDIADO ?? r.precio_kwh_no_subsidiado, 0),
      limite_subsidio: num(r.LIMITE_SUBSIDIO ?? r.limite_subsidio, 184),
      cargo_toma_lectura: num(r.CARGO_TOMA_LECTURA ?? r.cargo_toma_lectura, 0),
      cargo_alumbrado: num(r.CARGO_ALUMBRADO ?? r.cargo_alumbrado, 0),
      cargo_seguridad: num(r.CARGO_SEGURIDAD ?? r.cargo_seguridad, 0),
      cargo_administracion: num(r.CARGO_ADMINISTRACION ?? r.cargo_administracion, 0),
      valor_pagado: num(r.VALOR_PAGADO ?? r.valor_pagado, 0),
      fecha_pago: r.FECHA_PAGO || r.fecha_pago || null,
      valor_cobrado_hoja: num(r.VALOR_COBRADO_HOJA ?? r.valor_cobrado_hoja, null),
    }));

    setHistoricoProcesando(true);
    try {
      const response = await fetch(apiUrl('/api/v1/facturas/importar-historico'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        toast.error(`Error: ${response.status}`);
        setHistoricoResult({ procesados: 0, facturas_creadas: [], tarifas_creadas: [], advertencias_tarifa_existente: [], diferencias_valor: [], errores: [text] });
        return;
      }
      const data = await response.json();
      setHistoricoResult(data);
      toast.success(`${data.procesados} filas procesadas.`);
    } catch (err) {
      toast.error('Error de red al importar.');
      setHistoricoResult({ procesados: 0, facturas_creadas: [], tarifas_creadas: [], advertencias_tarifa_existente: [], diferencias_valor: [], errores: [String(err)] });
    } finally {
      setHistoricoProcesando(false);
    }
  };

  const descargarPdfMasivo = async () => {
    if (!token) return;
    const response = await fetch(
      apiUrl(`/api/v1/facturas/pdf-masivo?ano=${periodoConsumo.ano}&mes=${periodoConsumo.mes}&ano_cobro=${anoCobro}&mes_cobro=${mesCobro}`),
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      toast.error('No se pudo descargar el PDF masivo.');
      throw new Error(`No se pudo descargar el PDF masivo (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibos-formato-nuevo_${anoCobro}_${String(mesCobro).padStart(2, '0')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('PDF masivo generado', {
      description: 'Se descargaron los recibos para impresión.',
    });
  };

  const exportarTablaExcel = () => {
    const sourceRows = isLecturas ? (planilla || []) : filteredRows;
    const data = sourceRows.map((row) => {
      const valores = getValoresCalculados(row);
      return {
        CASA: getCasaLabel(row),
        NOMBRE: row.propietario,
        CEDULA: row.cedula || '',
        ESTADO_VIVIENDA: row.estado_vivienda,
        L_ANTERIOR: valores.lecturaAnteriorInput,
        L_ACTUAL: valores.lecturaActualInput ?? '',
        CONSUMO_KWH: valores.consumoKwh,
        CONSUMO_SUBSIDIO: valores.consumoSubsidiado,
        CONSUMO_SIN_SUBSIDIO: valores.consumoSinSubsidio,
        VALOR_SUBSIDIO: valores.valorSubsidio,
        VALOR_SIN_SUBSIDIO: valores.valorSinSubsidio,
        TOMA_LECTURA: row.cargo_toma_lectura || 0,
        ALUMBRADO: row.cargo_alumbrado || 0,
        SEGURIDAD: row.cargo_seguridad || 0,
        SUBTOTAL: valores.totalFactura || 0,
        DESCUENTO_PORCENTAJE: valores.descuentoPct,
        VALOR_DESCUENTO: valores.descuentoValor,
        TOTAL_A_PAGAR: valores.totalFactura || 0,
        ESTADO: valores.estado,
        PAGO: valores.pago,
        SALDO: valores.saldo,
      };
    });
    const header = [
      ['Mes de Cobro', getMonthName(mesCobro)],
      ['Año de Cobro', anoCobro],
      ['Período de Consumo', `${getMonthName(periodoConsumo.mes)} ${periodoConsumo.ano}`],
      [],
    ];
    const ws = XLSX.utils.aoa_to_sheet(header);
    XLSX.utils.sheet_add_json(ws, data, { origin: 'A5' });
    ws['!cols'] = Object.keys(data[0] || {}).map((key) => ({ wch: Math.max(14, key.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isLecturas ? 'Lecturas' : 'Facturacion');
    XLSX.writeFile(wb, `${isLecturas ? 'lecturas' : 'facturacion'}_${selectedAnoCobro}_${selectedMesCobro.padStart(2, '0')}.xlsx`);
    toast.success('Exportación lista', {
      description: `${data.length} registros exportados a Excel.`,
    });
  };

  const imprimirPlanillaLecturas = () => {
    const fontMap: Record<string, string> = {
      pequena: '10px',
      mediana: '12px',
      grande: '15px',
      muy_grande: '18px',
    };
    const rowsHtml = (planilla || []).map((row) => {
      const valores = getValoresCalculados(row);
      return `
        <tr>
          <td>${getCasaLabel(row)}</td>
          <td>${row.propietario}</td>
          <td>${row.cedula || ''}</td>
          <td>${getLecturaAnteriorInputValue(row)}</td>
          <td>${getInputValue(row)}</td>
          <td>${formatKwh(valores.consumoKwh)}</td>
          <td>${formatCurrency(valores.totalFactura || 0)}</td>
        </tr>`;
    }).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Planilla lecturas ${getMonthName(mesCobro)} ${anoCobro}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 18px; font-size: ${fontMap[planillaFontSize] || '15px'}; }
            h1 { color: #1d4ed8; margin: 0 0 8px; }
            .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
            .meta div { border: 1px solid #99f6e4; background: #ecfeff; padding: 8px; border-radius: 6px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #1d4ed8; color: white; padding: 7px; text-align: left; }
            td { border: 1px solid #cbd5e1; padding: 6px; }
            tr:nth-child(even) { background: #f8fafc; }
            @page { size: A4 landscape; margin: 8mm; }
          </style>
        </head>
        <body>
          <h1>Planilla de lecturas</h1>
          <div class="meta">
            <div><strong>Mes de Cobro</strong><br>${getMonthName(mesCobro)}</div>
            <div><strong>Año de Cobro</strong><br>${anoCobro}</div>
            <div><strong>Período de Consumo</strong><br>${getMonthName(periodoConsumo.mes)} ${periodoConsumo.ano}</div>
          </div>
          <table>
            <thead><tr><th>Casa</th><th>Propietario</th><th>Cédula</th><th>L. anterior</th><th>L. actual</th><th>Consumo</th><th>Total estimado</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const descargarPlanillaLecturas = () => {
    if (planillaFormato === 'excel') {
      exportarTablaExcel();
    } else {
      imprimirPlanillaLecturas();
    }
    setShowPlanillaDialog(false);
  };

  const descargarPlantilla = () => {
    const data = filteredRows.map((row) => ({
      vivienda_id: row.vivienda_id,
      casa: getCasaLabel(row),
      cedula: row.cedula || '',
      nombre: row.propietario,
      lectura_anterior: getLecturaAnteriorInputValue(row),
      lectura_actual: getInputValue(row),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Lecturas');
    XLSX.writeFile(wb, `plantilla_lecturas_${selectedAnoCobro}_${selectedMesCobro.padStart(2, '0')}.xlsx`);
    toast.success('Plantilla descargada', {
      description: 'Completa las lecturas actuales y vuelve a importarla.',
    });
  };

  const normalizar = (value: unknown) => String(value || '').trim().toLowerCase();

  const importarLecturas = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const byId = new Map(filteredRows.map((row) => [String(row.vivienda_id), row]));
        const byCedula = new Map(filteredRows.filter((row) => row.cedula).map((row) => [normalizar(row.cedula), row]));
        const byCasa = new Map(filteredRows.map((row) => [normalizar(getCasaLabel(row)), row]));
        const nextAnterior: Record<number, string> = {};
        const nextActual: Record<number, string> = {};
        let imported = 0;
        const errors: string[] = [];

        rows.forEach((item, index) => {
          const viviendaId = String(item.vivienda_id || item.VIVIENDA_ID || '').trim();
          const cedula = normalizar(item.cedula || item.CEDULA);
          const casa = normalizar(item.casa || item.CASA);
          const row = byId.get(viviendaId) || byCedula.get(cedula) || byCasa.get(casa);
          if (!row) {
            errors.push(`Fila ${index + 2}: no se encontró vivienda (${casa || cedula || viviendaId || 'sin referencia'})`);
            return;
          }
          const lecturaAnterior = item.lectura_anterior ?? item.L_ANTERIOR ?? item['L.ANTERIOR'];
          const lecturaActual = item.lectura_actual ?? item.L_ACTUAL ?? item['L.ACTUAL'];
          if (lecturaAnterior !== undefined && lecturaAnterior !== '') {
            nextAnterior[row.vivienda_id] = String(lecturaAnterior);
          }
          if (lecturaActual !== undefined && lecturaActual !== '') {
            nextActual[row.vivienda_id] = String(lecturaActual);
          }
          imported += 1;
        });

        setLecturasAnteriorForm((prev) => ({ ...prev, ...nextAnterior }));
        setLecturasForm((prev) => ({ ...prev, ...nextActual }));
        setImportResult({ imported, errors });
        setSaveSummary(
          errors.length
            ? `${imported} filas cargadas. ${errors.length} filas no se pudieron asociar.`
            : `${imported} filas cargadas desde Excel. Revisa y presiona ${isLecturas ? 'Guardar lecturas' : 'Guardar cambios'}.`
        );
        if (errors.length) {
          toast.warning('Importación parcial', {
            description: `${imported} filas cargadas y ${errors.length} con errores.`,
          });
        } else {
          toast.success('Lecturas importadas', {
            description: `${imported} filas cargadas desde Excel.`,
          });
        }
      } catch {
        setSaveSummary('No se pudo leer el archivo Excel.');
        setImportResult({ imported: 0, errors: ['No se pudo leer el archivo Excel.'] });
        toast.error('No se pudo leer el archivo Excel.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const confirmarBorradoRegistro = async () => {
    if (!rowPendingDelete) return;
    try {
      await borrarRegistroMutation.mutateAsync({
        vivienda_id: rowPendingDelete.vivienda_id,
        ano: periodoConsumo.ano,
        mes: periodoConsumo.mes,
      });
      setRowPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo borrar el registro');
    }
  };

  const resumen = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.total += row.total_factura || 0;
        if (row.estado_vivienda === 'activo') acc.activas += 1;
        else acc.inactivas += 1;
        return acc;
      },
      { total: 0, activas: 0, inactivas: 0 }
    );
  }, [filteredRows]);

  const manzanasDisponibles = useMemo(() => {
    const map = new Map<number, string>();
    filteredRows.forEach((row) => map.set(row.manzana_id, row.manzana_codigo || `MZ ${row.manzana_id}`));
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [filteredRows]);

  const quickRow = useMemo(
    () => filteredRows.find((row) => String(row.vivienda_id) === quickViviendaId),
    [filteredRows, quickViviendaId]
  );

  const aplicarEdicionRapida = () => {
    if (!quickRow) {
      toast.error('Selecciona una vivienda.');
      return;
    }
    if (quickLecturaActual.trim() !== '' && Number.isNaN(Number(quickLecturaActual))) {
      toast.error('La lectura debe ser numérica.');
      return;
    }
    setLecturasForm((prev) => ({ ...prev, [quickRow.vivienda_id]: quickLecturaActual.trim() }));
    setShowQuickEditDialog(false);
    toast.success('Lectura aplicada en la tabla', {
      description: 'Revisa el cálculo y presiona Guardar cambios para aprobar.',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{isLecturas ? 'Lecturas' : 'Facturación'}</h1>
          <p className="text-muted-foreground">
            {isLecturas
              ? 'Planilla mensual para registrar lecturas y revisar consumos'
              : 'Planilla mensual para registrar lecturas, calcular consumos y generar cobros'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          {isLecturas ? (
            <>
            <Button
              onClick={guardarCambiosPendientes}
              disabled={isSavingAll || pendingRows.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSavingAll ? 'Guardando...' : 'Guardar lecturas'}
            </Button>
            <Button variant="outline" onClick={() => setShowPlanillaDialog(true)} disabled={(planilla || []).length === 0} className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300">
              <Download className="h-4 w-4 mr-2" />
              Descargar planilla
            </Button>
            </>
          ) : (
            <>
          <Button variant="outline" onClick={() => setShowQuickEditDialog(true)} disabled={filteredRows.length === 0} className="bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Edición rápida
          </Button>
          <Button variant="outline" onClick={exportarTablaExcel} disabled={filteredRows.length === 0} className="bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 hover:text-green-300">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={descargarPlantilla} className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Plantilla
          </Button>
          <Button variant="outline" onClick={() => { setShowImportDialog(true); setImportResult(null); }} className="bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300">
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" onClick={() => { setShowHistoricoDialog(true); setHistoricoRows([]); setHistoricoResult(null); }} className="bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/20 hover:text-fuchsia-200" title="Cargar historial de meses anteriores desde Excel/CSV">
            <Upload className="h-4 w-4 mr-2" />
            Importar histórico
          </Button>
          <Button variant="outline" onClick={() => { setShowPazSalvoDialog(true); setPazSalvoSearch(''); }} className="bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200" title="Generar Paz y Salvo en PDF">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Paz y Salvo
          </Button>
          <Button onClick={descargarPdfMasivo} disabled={!facturas?.length} className="bg-green-600 hover:bg-green-700">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir recibos PDF
          </Button>
          <Button onClick={descargarPdfMasivoSoloMes} disabled={!facturas?.length} className="bg-amber-600 hover:bg-amber-700" title="Recibo masivo con consumo SOLO del mes (sin arrastre)">
            <Printer className="h-4 w-4 mr-2" />
            Recibos solo mes
          </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isLecturas ? 'Planilla de Lecturas' : 'Planilla de Facturación'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Mes de Cobro</Label>
              <Select value={selectedMesCobro} onValueChange={setSelectedMesCobro}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Año de Cobro</Label>
              <Select value={selectedAnoCobro} onValueChange={setSelectedAnoCobro}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anos.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Período de Consumo</Label>
              <div className="mt-1 h-10 px-3 rounded-md border border-input flex items-center text-sm">
                {getMonthName(periodoConsumo.mes)} {periodoConsumo.ano}
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Ejemplo: Cobro enero 2026 corresponde a consumo diciembre 2025.
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Buscar por casa, manzana, propietario o cédula"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{filteredRows.length}</p>
                <p className="text-xs text-muted-foreground">Total viviendas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{resumen.activas}</p>
                <p className="text-xs text-muted-foreground">Activas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{resumen.inactivas}</p>
                <p className="text-xs text-muted-foreground">Inactivas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{formatCurrency(resumen.total)}</p>
                <p className="text-xs text-muted-foreground">Total a cobrar</p>
              </CardContent>
            </Card>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={importarLecturas}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          {isLoading && <p>Cargando tabla de cobros...</p>}
          {error && <p className="text-red-600">Error: {(error as Error).message}</p>}
          {!isLoading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CASA</TableHead>
                  <TableHead>NOMBRE</TableHead>
                  <TableHead>CÉDULA</TableHead>
                  <TableHead>ESTADO VIVIENDA</TableHead>
                  <TableHead className="text-right">L.ANTERIOR</TableHead>
                  <TableHead className="text-right">L.ACTUAL</TableHead>
                  <TableHead className="text-right">CONSUMO</TableHead>
                  <TableHead className="text-right">CON.SUBSIDIO</TableHead>
                  <TableHead className="text-right">CON.SIN SUB</TableHead>
                  <TableHead className="text-right">VALOR SUBSIDIO</TableHead>
                  <TableHead className="text-right">VALOR SIN SUB</TableHead>
                  <TableHead className="text-right">TOMA LECTURA</TableHead>
                  <TableHead className="text-right">ALUMBRADO</TableHead>
                  <TableHead className="text-right">SEGURIDAD</TableHead>
                  <TableHead className="text-right">SUBTOTAL</TableHead>
                  <TableHead className="text-right">DESCUENTO %</TableHead>
                  <TableHead className="text-right">VALOR DESC.</TableHead>
                  <TableHead className="text-right">TOTAL A PAGAR</TableHead>
                  <TableHead className="text-right">ESTADO</TableHead>
                  <TableHead className="text-right">PAGO</TableHead>
                  <TableHead className="text-right">SALDO</TableHead>
                  {!isLecturas && <TableHead className="text-right">ACCIONES</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const {
                    pago,
                    lecturaAnteriorInput,
                    consumoKwh,
                    consumoSubsidiado,
                    consumoSinSubsidio,
                    valorSubsidio,
                    valorSinSubsidio,
                    totalFactura,
                    saldo,
                    descuentoPct,
                    descuentoValor,
                    estado,
                  } = getValoresCalculados(row);
                  const editable = row.estado_vivienda === 'activo';

                  return (
                    <TableRow key={row.vivienda_id} className={!editable ? 'opacity-60 bg-muted/30' : ''}>
                      <TableCell className="font-medium">{getCasaLabel(row)}</TableCell>
                      <TableCell>{row.propietario}</TableCell>
                      <TableCell>{row.cedula || '-'}</TableCell>
                      <TableCell>{row.estado_vivienda.toUpperCase()}</TableCell>
                      <TableCell className="text-right min-w-[130px]">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          disabled={!editable}
                          value={getLecturaAnteriorInputValue(row)}
                          onChange={(e) => {
                            setLecturasAnteriorForm((prev) => ({ ...prev, [row.vivienda_id]: e.target.value }));
                            setErrorByVivienda((prev) => ({ ...prev, [row.vivienda_id]: '' }));
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right min-w-[130px]">
                        <Input
                          type="number"
                          min={lecturaAnteriorInput || 0}
                          step="any"
                          disabled={!editable}
                          value={getInputValue(row)}
                          onChange={(e) => {
                            setLecturasForm((prev) => ({ ...prev, [row.vivienda_id]: e.target.value }));
                            setErrorByVivienda((prev) => ({ ...prev, [row.vivienda_id]: '' }));
                          }}
                        />
                        {errorByVivienda[row.vivienda_id] && (
                          <p className="text-xs text-red-600 mt-1">{errorByVivienda[row.vivienda_id]}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatKwh(consumoKwh)}</TableCell>
                      <TableCell className="text-right">{formatKwh(consumoSubsidiado)}</TableCell>
                      <TableCell className="text-right">{formatKwh(consumoSinSubsidio)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(valorSubsidio)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(valorSinSubsidio)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.cargo_toma_lectura || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.cargo_alumbrado || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.cargo_seguridad || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalFactura || 0)}</TableCell>
                      <TableCell className="text-right">{descuentoPct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(descuentoValor)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(totalFactura)}</TableCell>
                      <TableCell className="text-right uppercase">{estado}</TableCell>
                      <TableCell className="text-right text-blue-600">{formatCurrency(pago)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(saldo)}</TableCell>
                      {!isLecturas && <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!row.factura_id}
                            onClick={() => descargarFacturaPdf(row)}
                            className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!row.factura_id}
                            onClick={() => descargarFacturaPdfSoloMes(row)}
                            className="bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
                            title="PDF con consumo SOLO del mes (sin arrastre)"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Solo mes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!row.factura_id}
                            onClick={() => enviarFacturaWhatsApp(row)}
                            className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                          >
                            <MessageCircle className="h-4 w-4 mr-1" />
                            WhatsApp
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={borrarRegistroMutation.isPending}
                            onClick={() => setRowPendingDelete(row)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Borrar
                          </Button>
                        </div>
                      </TableCell>}
                    </TableRow>
                  );
                })}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isLecturas ? 21 : 22} className="text-center py-8 text-muted-foreground">
                      No hay viviendas para mostrar en este período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {!isLoading && !error && (
            <div className="sticky bottom-0 mt-4 flex flex-col gap-3 border-t bg-background/95 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground">
                {pendingRows.length > 0
                  ? `${pendingRows.length} fila${pendingRows.length === 1 ? '' : 's'} con cambios pendientes`
                  : 'No hay cambios pendientes'}
                {saveSummary && <span className="ml-2 font-medium text-foreground">{saveSummary}</span>}
              </div>
              <Button
                onClick={guardarCambiosPendientes}
                disabled={isSavingAll || pendingRows.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSavingAll ? 'Guardando...' : (isLecturas ? 'Guardar lecturas' : 'Guardar cambios')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showPlanillaDialog} onOpenChange={setShowPlanillaDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descargar planilla de lecturas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm">
              <div><strong>Mes de Cobro:</strong> {getMonthName(mesCobro)}</div>
              <div><strong>Año de Cobro:</strong> {anoCobro}</div>
              <div><strong>Período de Consumo:</strong> {getMonthName(periodoConsumo.mes)} {periodoConsumo.ano}</div>
            </div>
            <div>
              <Label>Formato</Label>
              <Select value={planillaFormato} onValueChange={setPlanillaFormato}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel organizado</SelectItem>
                  <SelectItem value="pdf">PDF / imprimir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tamaño de letra</Label>
              <Select value={planillaFontSize} onValueChange={setPlanillaFontSize}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pequena">Pequeña</SelectItem>
                  <SelectItem value="mediana">Mediana</SelectItem>
                  <SelectItem value="grande">Grande</SelectItem>
                  <SelectItem value="muy_grande">Muy grande</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanillaDialog(false)}>Cancelar</Button>
            <Button onClick={descargarPlanillaLecturas} className="bg-blue-600 hover:bg-blue-700">
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickEditDialog} onOpenChange={setShowQuickEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edición rápida de lectura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Manzana</Label>
              <Select
                value={quickRow ? String(quickRow.manzana_id) : ''}
                onValueChange={(value) => {
                  const row = filteredRows.find((item) => String(item.manzana_id) === value);
                  if (row) {
                    setQuickViviendaId(String(row.vivienda_id));
                    setQuickLecturaActual(getInputValue(row));
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona manzana" /></SelectTrigger>
                <SelectContent>
                  {manzanasDisponibles.map((manzana) => (
                    <SelectItem key={manzana.id} value={String(manzana.id)}>{manzana.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Casa y propietario</Label>
              <Select
                value={quickViviendaId}
                onValueChange={(value) => {
                  const row = filteredRows.find((item) => String(item.vivienda_id) === value);
                  setQuickViviendaId(value);
                  setQuickLecturaActual(row ? getInputValue(row) : '');
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona casa o persona" /></SelectTrigger>
                <SelectContent>
                  {filteredRows
                    .filter((row) => !quickRow || row.manzana_id === quickRow.manzana_id)
                    .map((row) => (
                      <SelectItem key={row.vivienda_id} value={String(row.vivienda_id)}>
                        {getCasaLabel(row)} - {row.propietario}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lectura actual</Label>
              <Input
                className="mt-1"
                inputMode="decimal"
                value={quickLecturaActual}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/^\d*([.,]\d*)?$/.test(value) || value === '') {
                    setQuickLecturaActual(value.replace(',', '.'));
                  }
                }}
                placeholder="Ingrese lectura actual"
              />
              <p className="mt-2 text-xs text-muted-foreground">Puedes dejarla vacía para limpiar el dato antes de aprobar.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickEditDialog(false)}>Cancelar</Button>
            <Button onClick={aplicarEdicionRapida} className="bg-cyan-600 hover:bg-cyan-700">
              Aplicar en tabla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rowPendingDelete} onOpenChange={(open) => !open && setRowPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Borrar registro de cobro</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {rowPendingDelete
              ? `Se borrará el registro de ${getCasaLabel(rowPendingDelete)} para ${getMonthName(periodoConsumo.mes)} ${periodoConsumo.ano}.`
              : 'Se borrará el registro seleccionado.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRowPendingDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarBorradoRegistro} disabled={borrarRegistroMutation.isPending}>
              {borrarRegistroMutation.isPending ? 'Borrando...' : 'Borrar registro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-purple-400" />
              Importar lecturas desde Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-400 mb-2">Instrucciones:</h4>
              <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside">
                <li>Descargue la plantilla desde el botón "Plantilla".</li>
                <li>Complete o corrija las columnas lectura_anterior y lectura_actual.</li>
                <li>Seleccione el archivo aquí para cargarlo en la tabla.</li>
                <li>Revise los datos y luego presione "{isLecturas ? 'Guardar lecturas' : 'Guardar cambios'}".</li>
              </ol>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-purple-500/30 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors"
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-purple-400" />
              <p className="text-sm font-medium">Haga clic o arrastre el archivo Excel</p>
              <p className="text-xs text-white/50 mt-1">(.xlsx, .xls)</p>
            </div>

            {importResult && (
              <div className={`rounded-lg p-4 ${importResult.errors.length ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className={`h-4 w-4 ${importResult.errors.length ? 'text-yellow-400' : 'text-green-400'}`} />
                  <span className="text-sm font-medium">
                    {importResult.imported} registros cargados en la tabla
                  </span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-xs text-yellow-200 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 8).map((err, idx) => (
                      <p key={`${err}-${idx}`}>• {err}</p>
                    ))}
                    {importResult.errors.length > 8 && <p>... y {importResult.errors.length - 8} más</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cerrar
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} className="bg-purple-600 hover:bg-purple-700">
              <Upload className="h-4 w-4 mr-2" />
              Seleccionar archivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoricoDialog} onOpenChange={setShowHistoricoDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar histórico de facturación
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-white/70">
              Carga meses anteriores desde un Excel/CSV. El sistema crea la Tarifa del mes (si no existe), la Lectura, recalcula la Factura y registra el Pago si se indica.
              No se sobrescribe ninguna tarifa ya existente: solo se reporta como advertencia.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={descargarPlantillaHistorico} className="bg-blue-500/10 border-blue-500/30 text-blue-300">
                <Download className="h-4 w-4 mr-2" />
                Descargar plantilla
              </Button>
              <label className="inline-flex items-center justify-center gap-2 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200 cursor-pointer hover:bg-fuchsia-500/20">
                <Upload className="h-4 w-4" />
                Seleccionar archivo (.xlsx / .csv)
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={cargarArchivoHistorico} />
              </label>
            </div>

            {historicoRows.length > 0 && (
              <div className="rounded-lg border border-white/10 p-3 bg-black/20">
                <div className="text-sm mb-2">
                  <strong>{historicoRows.length}</strong> filas listas para procesar. Vista previa de las primeras 5:
                </div>
                <div className="overflow-x-auto max-h-48">
                  <table className="text-xs w-full">
                    <thead className="text-white/60">
                      <tr>
                        <th className="text-left pr-3">CEDULA</th>
                        <th className="text-left pr-3">ANO</th>
                        <th className="text-left pr-3">MES</th>
                        <th className="text-left pr-3">L_ANT</th>
                        <th className="text-left pr-3">L_ACT</th>
                        <th className="text-left pr-3">P_SUB</th>
                        <th className="text-left pr-3">P_NOSUB</th>
                        <th className="text-left pr-3">PAGADO</th>
                        <th className="text-left pr-3">V_HOJA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicoRows.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          <td className="pr-3">{String(r.CEDULA ?? r.cedula ?? '')}</td>
                          <td className="pr-3">{String(r.ANO ?? r['AÑO'] ?? r.ano ?? '')}</td>
                          <td className="pr-3">{String(r.MES_CONSUMO ?? r.mes_consumo ?? '')}</td>
                          <td className="pr-3">{String(r.L_ANTERIOR ?? r.lectura_anterior ?? '')}</td>
                          <td className="pr-3">{String(r.L_ACTUAL ?? r.lectura_actual ?? '')}</td>
                          <td className="pr-3">{String(r.PRECIO_KWH_SUBSIDIADO ?? r.precio_kwh_subsidiado ?? '')}</td>
                          <td className="pr-3">{String(r.PRECIO_KWH_NO_SUBSIDIADO ?? r.precio_kwh_no_subsidiado ?? '')}</td>
                          <td className="pr-3">{String(r.VALOR_PAGADO ?? r.valor_pagado ?? '')}</td>
                          <td className="pr-3">{String(r.VALOR_COBRADO_HOJA ?? r.valor_cobrado_hoja ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {historicoResult && (
              <div className="space-y-2 text-sm">
                <div className="rounded-lg p-3 bg-green-500/10 border border-green-500/30">
                  <div><strong>{historicoResult.procesados}</strong> filas procesadas.</div>
                  <div>{historicoResult.facturas_creadas.length} facturas creadas/actualizadas, {historicoResult.tarifas_creadas.length} tarifas nuevas.</div>
                </div>
                {historicoResult.advertencias_tarifa_existente.length > 0 && (
                  <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/30 max-h-40 overflow-auto">
                    <div className="font-semibold text-amber-300 mb-1">Tarifas no sobrescritas:</div>
                    {historicoResult.advertencias_tarifa_existente.map((w, i) => <div key={i} className="text-xs">⚠ {w}</div>)}
                  </div>
                )}
                {historicoResult.diferencias_valor.length > 0 && (
                  <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/30 max-h-40 overflow-auto">
                    <div className="font-semibold text-red-300 mb-1">Diferencias vs valor de la hoja:</div>
                    {historicoResult.diferencias_valor.map((d, i) => (
                      <div key={i} className="text-xs">
                        {d.cedula} {d.ano}-{String(d.mes).padStart(2,'0')}: hoja ${d.valor_hoja.toLocaleString()} vs calculado ${d.valor_calculado.toLocaleString()} (Δ ${d.delta.toLocaleString()})
                      </div>
                    ))}
                  </div>
                )}
                {historicoResult.errores.length > 0 && (
                  <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/30 max-h-40 overflow-auto">
                    <div className="font-semibold text-red-300 mb-1">Errores:</div>
                    {historicoResult.errores.map((e, i) => <div key={i} className="text-xs">✗ {e}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoricoDialog(false)}>Cerrar</Button>
            <Button onClick={procesarHistorico} disabled={historicoRows.length === 0 || historicoProcesando} className="bg-fuchsia-600 hover:bg-fuchsia-700">
              {historicoProcesando ? 'Procesando…' : `Procesar ${historicoRows.length} filas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPazSalvoDialog} onOpenChange={setShowPazSalvoDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Generar Paz y Salvo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-white/70">
              Busca por cédula, nombre o número de casa y descarga el PDF. Se genera sin validar estado de cuenta (lleva sello "PAGADO" como marca de agua).
            </p>
            <Input
              autoFocus
              placeholder="Cédula, propietario o casa..."
              value={pazSalvoSearch}
              onChange={(e) => setPazSalvoSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-auto rounded-md border border-white/10 divide-y divide-white/10">
              {pazSalvoSearch.trim() === '' ? (
                <div className="p-3 text-sm text-white/50">Empieza a escribir para buscar.</div>
              ) : pazSalvoMatches.length === 0 ? (
                <div className="p-3 text-sm text-white/50">Sin resultados.</div>
              ) : (
                pazSalvoMatches.map((r) => (
                  <div key={r.vivienda_id} className="flex items-center justify-between p-3 gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{r.propietario}</div>
                      <div className="text-xs text-white/60">
                        Cédula {r.cedula || '—'} · MZ {r.manzana_codigo || r.manzana_id} Casa {r.numero_casa}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => descargarPazSalvo(r)} className="bg-emerald-600 hover:bg-emerald-700">
                      <ShieldCheck className="h-4 w-4 mr-1" />
                      Descargar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPazSalvoDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ControlPagosPage;

