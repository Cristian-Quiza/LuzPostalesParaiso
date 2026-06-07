import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Loader2, History } from 'lucide-react';
import type { Configuracion, HistorialPeriodo } from '@/types';

const MESES = [
  { value: '01', label: 'ENERO' },
  { value: '02', label: 'FEBRERO' },
  { value: '03', label: 'MARZO' },
  { value: '04', label: 'ABRIL' },
  { value: '05', label: 'MAYO' },
  { value: '06', label: 'JUNIO' },
  { value: '07', label: 'JULIO' },
  { value: '08', label: 'AGOSTO' },
  { value: '09', label: 'SEPTIEMBRE' },
  { value: '10', label: 'OCTUBRE' },
  { value: '11', label: 'NOVIEMBRE' },
  { value: '12', label: 'DICIEMBRE' },
];

const AÑOS = Array.from({ length: 5 }, (_, i) => {
  const year = new Date().getFullYear() - 2 + i;
  return { value: year.toString(), label: year.toString() };
});

const PERIODOS = MESES.map((mes) => {
  const mesNum = parseInt(mes.value);
  const mesSiguienteNum = mesNum === 12 ? 1 : mesNum + 1;
  const mesSiguiente = MESES.find((m) => m.value === mesSiguienteNum.toString().padStart(2, '0'));
  return {
    value: mes.value,
    label: `${mes.label}01 - ${mesSiguiente?.label}01`,
  };
});

const CONFIG_KEYS = {
  nombre_barrio: 'nombre_barrio',
  lider_comunitario: 'lider_comunitario',
  macro_medidor: 'macro_medidor',
  codigo_cliente: 'codigo_cliente',
  limite_subsidio: 'limite_subsidio',
  precio_kwh_subsidiado: 'precio_kwh_subsidiado',
  precio_kwh_sin_subsidio: 'precio_kwh_sin_subsidio',
  costo_toma_lectura: 'costo_toma_lectura',
  costo_alumbrado: 'costo_alumbrado',
  costo_seguridad: 'costo_seguridad',
  periodo_actual: 'periodo_actual',
};

export default function ConfiguracionPage() {
  const { token, usuario } = useAuthStore();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<string>('');

  const { data: configuraciones, isLoading } = useQuery<Configuracion[]>({
    queryKey: ['configuraciones'],
    queryFn: () => api.get<Configuracion[]>('/configuraciones', token || undefined),
    enabled: !!token,
  });

  const invalidateAllRelated = () => {
    queryClient.invalidateQueries({ queryKey: ['configuraciones'] });
    queryClient.invalidateQueries({ queryKey: ['historial-periodos'] });
    queryClient.invalidateQueries({ queryKey: ['tarifas'] });
    queryClient.invalidateQueries({ queryKey: ['facturas'] });
    queryClient.invalidateQueries({ queryKey: ['lecturas'] });
    queryClient.invalidateQueries({ queryKey: ['planilla'] });
    queryClient.invalidateQueries({ queryKey: ['control-cobros-planilla'] });
    queryClient.invalidateQueries({ queryKey: ['control-cobros-facturas'] });
    queryClient.invalidateQueries({ queryKey: ['viviendas'] });
    queryClient.invalidateQueries({ queryKey: ['pagos'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) =>
      api.put(`/configuraciones/${clave}`, { clave, valor }, token || undefined),
    onSuccess: () => {
      invalidateAllRelated();
      setIsEditing(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) =>
      api.post('/configuraciones', { clave, valor }, token || undefined),
    onSuccess: () => {
      invalidateAllRelated();
      setIsEditing(false);
    },
  });

  const getConfigValue = (clave: string): string => {
    const config = configuraciones?.find((c) => c.clave === clave);
    return config?.valor || '';
  };

  const [formData, setFormData] = useState({
    nombre_barrio: '',
    lider_comunitario: '',
    macro_medidor: '',
    codigo_cliente: '',
    limite_subsidio: '',
    precio_kwh_subsidiado: '',
    precio_kwh_sin_subsidio: '',
    costo_toma_lectura: '',
    costo_alumbrado: '',
    costo_seguridad: '',
  });

  const [periodoAnio, setPeriodoAnio] = useState(new Date().getFullYear().toString());
  const [periodoCorte, setPeriodoCorte] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));

  useEffect(() => {
    if (!configuraciones) return;
    setFormData({
      nombre_barrio: getConfigValue(CONFIG_KEYS.nombre_barrio),
      lider_comunitario: getConfigValue(CONFIG_KEYS.lider_comunitario),
      macro_medidor: getConfigValue(CONFIG_KEYS.macro_medidor),
      codigo_cliente: getConfigValue(CONFIG_KEYS.codigo_cliente),
      limite_subsidio: getConfigValue(CONFIG_KEYS.limite_subsidio),
      precio_kwh_subsidiado: getConfigValue(CONFIG_KEYS.precio_kwh_subsidiado),
      precio_kwh_sin_subsidio: getConfigValue(CONFIG_KEYS.precio_kwh_sin_subsidio),
      costo_toma_lectura: getConfigValue(CONFIG_KEYS.costo_toma_lectura),
      costo_alumbrado: getConfigValue(CONFIG_KEYS.costo_alumbrado),
      costo_seguridad: getConfigValue(CONFIG_KEYS.costo_seguridad),
    });
    setPeriodoAnio(getConfigValue('periodo_anio') || new Date().getFullYear().toString());
    setPeriodoCorte(getConfigValue('periodo_mes') || (new Date().getMonth() + 1).toString().padStart(2, '0'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuraciones]);

  const getPeriodoFacturacion = () => {
    const mesCorteNum = parseInt(periodoCorte);
    const mesFacturacionNum = mesCorteNum === 1 ? 12 : mesCorteNum - 1;
    
    const mesFacturacion = MESES.find(m => m.value === mesFacturacionNum.toString().padStart(2, '0'));
    const mesSiguiente = MESES.find(m => m.value === periodoCorte);
    
    return `${mesFacturacion?.label}01 - ${mesSiguiente?.label}01`;
  };

  const getMesRecibo = () => {
    const mesFacturacionNum = parseInt(periodoCorte) === 1 ? 12 : parseInt(periodoCorte) - 1;
    const mes = MESES.find(m => m.value === mesFacturacionNum.toString().padStart(2, '0'));
    return `Recibo de ${mes?.label}`;
  };

  const handleSave = async () => {
    setSaveError('');
    setSaveSuccess('');

    try {
      for (const [clave, valor] of Object.entries(formData)) {
        await updateMutation.mutateAsync({ clave, valor: String(valor ?? '') });
      }
      await updateMutation.mutateAsync({ clave: 'periodo_anio', valor: periodoAnio });
      await updateMutation.mutateAsync({ clave: 'periodo_mes', valor: periodoCorte });
      await updateMutation.mutateAsync({ clave: 'periodo_actual', valor: getPeriodoFacturacion() });
      setSaveSuccess('Configuración guardada correctamente.');
      setIsEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la configuración';
      const rol = usuario?.rol || 'desconocido';
      setSaveError(`${msg}. Rol actual: ${rol}.`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuración General</h1>
          <p className="text-muted-foreground">Administra la configuración del sistema</p>
        </div>
        <Button onClick={() => setIsEditing(!isEditing)} variant={isEditing ? 'default' : 'outline'}>
          <Settings className="h-4 w-4 mr-2" />
          {isEditing ? 'Cancelar' : 'Editar'}
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">Configuración General</TabsTrigger>
          <TabsTrigger value="periodos">Control de Períodos</TabsTrigger>
          <TabsTrigger value="historial">
            <History className="h-4 w-4 mr-2" />
            Historial de Períodos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Información del Barrio</CardTitle>
            <CardDescription>Datos generales del conjunto residencial</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="nombre_barrio">Nombre del Barrio</Label>
              <Input
                id="nombre_barrio"
                value={formData.nombre_barrio}
                onChange={(e) => setFormData({ ...formData, nombre_barrio: e.target.value })}
                disabled={!isEditing}
                placeholder="PORTALES DEL PARAISO"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lider_comunitario">Líder Comunitario</Label>
              <Input
                id="lider_comunitario"
                value={formData.lider_comunitario}
                onChange={(e) => setFormData({ ...formData, lider_comunitario: e.target.value })}
                disabled={!isEditing}
                placeholder="Nombre del líder"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="macro_medidor">Macro Medidor</Label>
              <Input
                id="macro_medidor"
                value={formData.macro_medidor}
                onChange={(e) => setFormData({ ...formData, macro_medidor: e.target.value })}
                disabled={!isEditing}
                placeholder="Número de macro medidor"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="codigo_cliente">Código de Cliente</Label>
              <Input
                id="codigo_cliente"
                value={formData.codigo_cliente}
                onChange={(e) => setFormData({ ...formData, codigo_cliente: e.target.value })}
                disabled={!isEditing}
                placeholder="Código de cliente"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tarifas y Valores Fijos</CardTitle>
            <CardDescription>Valores para el cálculo de facturas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="limite_subsidio">Límite Subsidio (kWh)</Label>
              <Input
                id="limite_subsidio"
                type="number"
                value={formData.limite_subsidio}
                onChange={(e) => setFormData({ ...formData, limite_subsidio: e.target.value })}
                disabled={!isEditing}
                placeholder="184"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="precio_kwh_subsidiado">Precio kWh Subsidiado ($)</Label>
              <Input
                id="precio_kwh_subsidiado"
                type="number"
                value={formData.precio_kwh_subsidiado}
                onChange={(e) => setFormData({ ...formData, precio_kwh_subsidiado: e.target.value })}
                disabled={!isEditing}
                placeholder="369.77"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="precio_kwh_sin_subsidio">Precio kWh Sin Subsidio ($)</Label>
              <Input
                id="precio_kwh_sin_subsidio"
                type="number"
                value={formData.precio_kwh_sin_subsidio}
                onChange={(e) => setFormData({ ...formData, precio_kwh_sin_subsidio: e.target.value })}
                disabled={!isEditing}
                placeholder="783.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="costo_toma_lectura">Costo Toma de Lectura ($)</Label>
              <Input
                id="costo_toma_lectura"
                type="number"
                value={formData.costo_toma_lectura}
                onChange={(e) => setFormData({ ...formData, costo_toma_lectura: e.target.value })}
                disabled={!isEditing}
                placeholder="4500"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="costo_alumbrado">Alumbrado Público ($)</Label>
              <Input
                id="costo_alumbrado"
                type="number"
                value={formData.costo_alumbrado}
                onChange={(e) => setFormData({ ...formData, costo_alumbrado: e.target.value })}
                disabled={!isEditing}
                placeholder="3000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="costo_seguridad">Seguridad ($)</Label>
              <Input
                id="costo_seguridad"
                type="number"
                value={formData.costo_seguridad}
                onChange={(e) => setFormData({ ...formData, costo_seguridad: e.target.value })}
                disabled={!isEditing}
                placeholder="2000"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Control de Períodos</CardTitle>
            <CardDescription>Período actual de facturación</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-2">
                <Label htmlFor="periodo_anio">Año</Label>
                <Select
                  value={periodoAnio}
                  onValueChange={setPeriodoAnio}
                  disabled={!isEditing}
                >
                  <SelectTrigger id="periodo_anio" className="w-[120px]">
                    <SelectValue placeholder="Seleccionar año" />
                  </SelectTrigger>
                  <SelectContent>
                    {AÑOS.map((año) => (
                      <SelectItem key={año.value} value={año.value}>
                        {año.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="periodo_corte">Período de Corte</Label>
                <Select
                  value={periodoCorte}
                  onValueChange={setPeriodoCorte}
                  disabled={!isEditing}
                >
                  <SelectTrigger id="periodo_corte" className="w-[200px]">
                    <SelectValue placeholder="Seleccionar período" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODOS.map((periodo) => (
                      <SelectItem key={periodo.value} value={periodo.value}>
                        {periodo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Período a Facturar</Label>
                <div className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium min-w-[200px]">
                  {getPeriodoFacturacion()}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Corresponde al Recibo de</Label>
                <div className="px-3 py-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 rounded-md text-sm font-medium min-w-[180px]">
                  {getMesRecibo()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="periodos">
          <Card>
            <CardHeader>
              <CardTitle>Control de Períodos</CardTitle>
              <CardDescription>Período actual de facturación</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="periodo_anio">Año</Label>
                  <Select
                    value={periodoAnio}
                    onValueChange={setPeriodoAnio}
                    disabled={!isEditing}
                  >
                    <SelectTrigger id="periodo_anio" className="w-[120px]">
                      <SelectValue placeholder="Seleccionar año" />
                    </SelectTrigger>
                    <SelectContent>
                      {AÑOS.map((año) => (
                        <SelectItem key={año.value} value={año.value}>
                          {año.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="periodo_corte">Período de Corte</Label>
                  <Select
                    value={periodoCorte}
                    onValueChange={setPeriodoCorte}
                    disabled={!isEditing}
                  >
                    <SelectTrigger id="periodo_corte" className="w-[200px]">
                      <SelectValue placeholder="Seleccionar período" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODOS.map((periodo) => (
                        <SelectItem key={periodo.value} value={periodo.value}>
                          {periodo.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Período a Facturar</Label>
                  <div className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium min-w-[200px]">
                    {getPeriodoFacturacion()}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Corresponde al Recibo de</Label>
                  <div className="px-3 py-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 rounded-md text-sm font-medium min-w-[180px]">
                    {getMesRecibo()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <HistorialPeriodos />
        </TabsContent>

      </Tabs>

      {isEditing && (
        <div className="space-y-3">
          {saveError && (
            <div className="text-sm text-red-600">{saveError}</div>
          )}
          {saveSuccess && (
            <div className="text-sm text-green-600">{saveSuccess}</div>
          )}
          <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending || createMutation.isPending}>
            {(updateMutation.isPending || createMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Guardar Cambios
          </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistorialPeriodos() {
  const { token } = useAuthStore();

  const { data: historial, isLoading } = useQuery<HistorialPeriodo[]>({
    queryKey: ['historial-periodos'],
    queryFn: () => api.get<HistorialPeriodo[]>('/configuraciones/historial-periodos', token || undefined),
    enabled: !!token,
  });

  const getLabelPeriodo = (mes: string) => {
    const periodo = PERIODOS.find(p => p.value === mes);
    return periodo?.label || mes;
  };

  const getMesReciboLabel = (mes: string) => {
    const mesNum = parseInt(mes);
    const mesFacturacionNum = mesNum === 1 ? 12 : mesNum - 1;
    const mesObj = MESES.find(m => m.value === mesFacturacionNum.toString().padStart(2, '0'));
    return `Recibo de ${mesObj?.label}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Períodos</CardTitle>
        <CardDescription>Auditoría de períodos de facturación configurados</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Año</TableHead>
              <TableHead>Período de Corte</TableHead>
              <TableHead>Período Facturado</TableHead>
              <TableHead>Recibo Correspondiente</TableHead>
              <TableHead>Fecha Inicio</TableHead>
              <TableHead>Fecha Fin</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historial?.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.anio || '-'}</TableCell>
                <TableCell className="font-medium">{getLabelPeriodo(item.periodo_mes || '')}</TableCell>
                <TableCell className="font-medium">{item.valor || '-'}</TableCell>
                <TableCell>{getMesReciboLabel(item.periodo_mes || '')}</TableCell>
                <TableCell>{item.fecha_inicio ? new Date(item.fecha_inicio).toLocaleString() : '-'}</TableCell>
                <TableCell>{item.fecha_fin ? new Date(item.fecha_fin as unknown as string).toLocaleString() : 'Activo'}</TableCell>
                <TableCell>
                  {item.activa ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Inactivo
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(!historial || historial.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No hay historial de períodos disponible
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

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
    </Card>
  );
}
