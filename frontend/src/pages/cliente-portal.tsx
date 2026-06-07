import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle, Download, LogOut, Receipt, Search, Share2, UserCircle, WalletCards } from 'lucide-react';
import { api, apiUrl } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { ClienteFactura, ClientePerfil, ClienteResumen } from '@/types';
import { formatCurrency, formatKwh, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const meses = [
  { value: '0', label: 'Todos los meses' },
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ClientePortalPage() {
  const { token, usuario, logout } = useAuthStore();
  const current = getCurrentPeriod();
  const [selectedAno, setSelectedAno] = useState(String(current.ano));
  const [selectedMes, setSelectedMes] = useState('0');
  const [selectedFacturaId, setSelectedFacturaId] = useState<number | null>(null);
  const [showPerfil, setShowPerfil] = useState(false);

  const query = new URLSearchParams();
  if (selectedAno) query.set('ano', selectedAno);
  if (selectedMes !== '0') query.set('mes', selectedMes);

  const { data: perfil } = useQuery<ClientePerfil>({
    queryKey: ['cliente-perfil'],
    queryFn: () => api.get<ClientePerfil>('/cliente/perfil', token || undefined),
    enabled: !!token,
  });

  const { data: resumen, isLoading } = useQuery<ClienteResumen>({
    queryKey: ['cliente-resumen', selectedAno, selectedMes],
    queryFn: () => api.get<ClienteResumen>(`/cliente/resumen?${query.toString()}`, token || undefined),
    enabled: !!token,
  });

  const selectedFactura = useMemo<ClienteFactura | null>(() => {
    const rows = resumen?.facturas || [];
    return rows.find((factura) => factura.id === selectedFacturaId) || rows[0] || null;
  }, [resumen?.facturas, selectedFacturaId]);

  const fetchPdf = async (factura: ClienteFactura) => {
    if (!token) throw new Error('No hay sesión activa');
    const response = await fetch(apiUrl(`/api/v1/cliente/facturas/${factura.id}/pdf`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('No se pudo descargar la factura');
    const blob = await response.blob();
    const filename = `factura-${factura.numero_factura || factura.id}.pdf`;
    return { blob, filename };
  };

  const descargarPdf = async (factura: ClienteFactura) => {
    const { blob, filename } = await fetchPdf(factura);
    downloadBlob(blob, filename);
  };

  const compartirWhatsapp = async (factura: ClienteFactura) => {
    const message = `Factura ${factura.numero_factura} de ${getMonthName(factura.mes_cobro)} ${factura.ano_cobro}. Total: ${formatCurrency(factura.total)}. Saldo: ${formatCurrency(factura.saldo)}.`;
    try {
      const { blob, filename } = await fetchPdf(factura);
      const file = new File([blob], filename, { type: 'application/pdf' });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await navigator.share({ title: 'Factura Portales del Paraíso', text: message, files: [file] });
        return;
      }
      downloadBlob(blob, filename);
    } catch {
      // El fallback abre WhatsApp con el texto listo aunque el navegador no comparta archivos.
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_28%)]" />
      <main className="relative mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowPerfil((value) => !value)}
              className="h-11 w-11 rounded-full border-white/15 bg-white/10 p-0 text-white hover:bg-white/20"
              title="Ver perfil"
            >
              <UserCircle className="h-6 w-6" />
            </Button>
            {showPerfil && (
              <Card className="absolute left-0 top-14 z-20 w-80 border-white/10 bg-slate-900/95 text-white shadow-2xl backdrop-blur">
                <CardContent className="space-y-3 p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-emerald-300">Datos del propietario</p>
                  <div><span className="text-white/55">Nombre</span><p className="font-medium">{perfil?.nombre_completo || usuario?.nombre_completo || '-'}</p></div>
                  <div><span className="text-white/55">Cédula</span><p className="font-medium">{perfil?.cedula || '-'}</p></div>
                  <div><span className="text-white/55">Casa</span><p className="font-medium">{perfil?.casa || '-'}</p></div>
                  <div><span className="text-white/55">Contacto</span><p className="font-medium">{perfil?.telefono || perfil?.whatsapp || perfil?.email || '-'}</p></div>
                </CardContent>
              </Card>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-emerald-300">Portales del Paraíso</p>
            <h1 className="truncate text-2xl font-bold md:text-4xl">Mis facturas</h1>
          </div>
          <Button variant="outline" onClick={logout} className="border-white/15 bg-white/10 text-white hover:bg-white/20">
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </header>

        <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card className="border-white/10 bg-white/[0.08] backdrop-blur">
            <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_180px_180px] md:items-end">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm text-white/65"><Search className="h-4 w-4" /> Consulta por período</p>
                <p className="text-xl font-semibold text-white">{perfil?.nombre_completo || usuario?.nombre_completo}</p>
                <p className="text-sm text-white/55">{perfil?.casa || 'Casa registrada'} · {perfil?.cedula || ''}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-white/70">Año</p>
                <Select value={selectedAno} onValueChange={setSelectedAno}>
                  <SelectTrigger className="border-white/15 bg-slate-950/70 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{anos.map((ano) => <SelectItem key={ano} value={ano}>{ano}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-sm text-white/70">Mes</p>
                <Select value={selectedMes} onValueChange={setSelectedMes}>
                  <SelectTrigger className="border-white/15 bg-slate-950/70 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{meses.map((mes) => <SelectItem key={mes.value} value={mes.value}>{mes.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-400/20 bg-emerald-400/10 backdrop-blur">
            <CardContent className="p-4">
              <p className="text-sm text-emerald-200">Estado actual</p>
              <p className="text-2xl font-bold">{resumen?.al_dia ? 'Al día' : formatCurrency(resumen?.total_adeudado || 0)}</p>
              <p className="text-sm text-white/60">{resumen?.facturas.length || 0} factura(s) en la consulta</p>
            </CardContent>
          </Card>
        </section>

        <section className="mb-5 grid gap-4 md:grid-cols-4">
          <Card className="border-white/10 bg-white/[0.07]"><CardContent className="p-5"><WalletCards className="mb-3 h-6 w-6 text-cyan-300" /><p className="text-sm text-white/55">Total adeudado</p><p className="text-2xl font-bold">{formatCurrency(resumen?.total_adeudado || 0)}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.07]"><CardContent className="p-5"><Receipt className="mb-3 h-6 w-6 text-blue-300" /><p className="text-sm text-white/55">Pendientes</p><p className="text-2xl font-bold">{resumen?.facturas_pendientes || 0}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.07]"><CardContent className="p-5"><CalendarDays className="mb-3 h-6 w-6 text-amber-300" /><p className="text-sm text-white/55">Con abono</p><p className="text-2xl font-bold">{resumen?.facturas_parciales || 0}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.07]"><CardContent className="p-5"><CheckCircle className="mb-3 h-6 w-6 text-emerald-300" /><p className="text-sm text-white/55">Pagadas</p><p className="text-2xl font-bold">{resumen?.facturas_pagadas || 0}</p></CardContent></Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_420px]">
          <Card className="border-white/10 bg-white/[0.08] backdrop-blur">
            <CardHeader><CardTitle className="text-white">Facturas encontradas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isLoading && <p className="text-white/70">Cargando facturas...</p>}
              {!isLoading && resumen?.facturas.length === 0 && <p className="text-white/70">No hay facturas para el período seleccionado.</p>}
              {resumen?.facturas.map((factura) => (
                <button
                  key={factura.id}
                  type="button"
                  onClick={() => setSelectedFacturaId(factura.id)}
                  className={`w-full rounded-lg border p-4 text-left transition ${selectedFactura?.id === factura.id ? 'border-emerald-300 bg-emerald-300/10' : 'border-white/10 bg-slate-950/45 hover:bg-slate-900'}`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{factura.numero_factura || `Factura ${factura.id}`}</p>
                      <p className="text-sm text-white/60">{getMonthName(factura.mes_cobro)} {factura.ano_cobro} · {factura.casa}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-bold">{formatCurrency(factura.total)}</p>
                      <p className="text-sm text-white/55">Saldo {formatCurrency(factura.saldo)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-900/75 backdrop-blur">
            <CardHeader><CardTitle className="text-white">Detalle de factura</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {selectedFactura ? (
                <>
                  <div>
                    <p className="text-sm text-white/55">Factura</p>
                    <p className="text-xl font-bold">{selectedFactura.numero_factura}</p>
                    <p className="text-sm text-emerald-300">{getMonthName(selectedFactura.mes_cobro)} {selectedFactura.ano_cobro}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-white/[0.06] p-3"><p className="text-white/50">Consumo</p><p className="font-semibold">{formatKwh(selectedFactura.consumo)} kWh</p></div>
                    <div className="rounded-lg bg-white/[0.06] p-3"><p className="text-white/50">Estado</p><p className="font-semibold">{selectedFactura.estado}</p></div>
                    <div className="rounded-lg bg-white/[0.06] p-3"><p className="text-white/50">Pagado</p><p className="font-semibold text-emerald-300">{formatCurrency(selectedFactura.total_pagado)}</p></div>
                    <div className="rounded-lg bg-white/[0.06] p-3"><p className="text-white/50">Saldo</p><p className="font-semibold text-amber-300">{formatCurrency(selectedFactura.saldo)}</p></div>
                  </div>
                  <Button onClick={() => descargarPdf(selectedFactura)} className="w-full bg-blue-600 hover:bg-blue-700">
                    <Download className="mr-2 h-4 w-4" />
                    Descargar PDF
                  </Button>
                  <Button onClick={() => compartirWhatsapp(selectedFactura)} variant="outline" className="w-full border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20">
                    <Share2 className="mr-2 h-4 w-4" />
                    Compartir por WhatsApp
                  </Button>
                </>
              ) : (
                <p className="text-sm text-white/65">Selecciona una factura para ver el detalle.</p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
