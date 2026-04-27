import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatNumber, getCurrentPeriod, getMonthName } from '@/lib/utils';
import { Plus, Zap, Wifi, WifiOff, Save, Search, Edit, Trash2, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Lectura, Vivienda } from '@/types';
import { saveLecturaOffline, addToSyncQueue } from '@/lib/indexeddb';
import { generateOfflineId } from '@/lib/utils';

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

export default function LecturasPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const currentPeriod = getCurrentPeriod();
  
  const [selectedAno, setSelectedAno] = useState(currentPeriod.ano.toString());
  const [selectedMes, setSelectedMes] = useState(currentPeriod.mes.toString());
  const [viviendaFilter, setViviendaFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLectura, setEditingLectura] = useState<Lectura | null>(null);
  const [formData, setFormData] = useState({
    vivienda_id: '',
    lectura_actual: '',
  });
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const ano = parseInt(selectedAno);
  const mes = parseInt(selectedMes);

  const { data: lecturas, isLoading } = useQuery<Lectura[]>({
    queryKey: ['lecturas', ano, mes],
    queryFn: () => api.get<Lectura[]>(`/lecturas?ano=${ano}&mes=${mes}`, token || undefined),
    enabled: !!token && isOnline,
    staleTime: isOnline ? 30000 : Infinity,
  });

  const { data: viviendas } = useQuery<Vivienda[]>({
    queryKey: ['viviendas'],
    queryFn: () => api.get<Vivienda[]>('/viviendas', token || undefined),
    enabled: !!token && isOnline,
    staleTime: isOnline ? 60000 : Infinity,
  });

  const createLecturaMutation = useMutation({
    mutationFn: (data: { vivienda_id: number; ano: number; mes: number; lectura_actual: number }) =>
      api.post<Lectura>('/lectura', data, token || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lecturas'] });
      setIsDialogOpen(false);
      setEditingLectura(null);
      setFormData({ vivienda_id: '', lectura_actual: '' });
      setErrorMessage('');
    },
    onError: (error: any) => {
      setErrorMessage(error?.message || 'Error al guardar la lectura');
    },
  });

  const updateLecturaMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.put(`/lecturas/${id}`, data, token || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lecturas'] });
      setIsDialogOpen(false);
      setEditingLectura(null);
      setFormData({ vivienda_id: '', lectura_actual: '' });
      setErrorMessage('');
    },
    onError: (error: any) => {
      setErrorMessage(error?.message || 'Error al actualizar la lectura');
    },
  });

  const deleteLecturaMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/lecturas/${id}`, token || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lecturas'] });
    },
  });

  const openNewDialog = () => {
    setEditingLectura(null);
    setFormData({ vivienda_id: '', lectura_actual: '' });
    setErrorMessage('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (lectura: Lectura) => {
    setEditingLectura(lectura);
    setFormData({
      vivienda_id: lectura.vivienda_id.toString(),
      lectura_actual: lectura.lectura_actual.toString(),
    });
    setErrorMessage('');
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    
    if (!formData.vivienda_id) {
      setErrorMessage('Seleccione una vivienda');
      return;
    }
    if (!formData.lectura_actual || parseInt(formData.lectura_actual) < 0) {
      setErrorMessage('Ingrese una lectura válida');
      return;
    }

    const lecturaData = {
      vivienda_id: parseInt(formData.vivienda_id),
      ano,
      mes,
      lectura_actual: parseInt(formData.lectura_actual),
    };

    if (isOnline) {
      if (editingLectura) {
        updateLecturaMutation.mutate({ id: editingLectura.id, data: lecturaData });
      } else {
        createLecturaMutation.mutate(lecturaData);
      }
    } else {
      try {
        const offlineId = generateOfflineId();
        await saveLecturaOffline({
          offline_id: offlineId,
          ...lecturaData,
          created_at: new Date().toISOString(),
        });
        await addToSyncQueue('lectura', lecturaData);
        setIsDialogOpen(false);
        setEditingLectura(null);
        setFormData({ vivienda_id: '', lectura_actual: '' });
        setErrorMessage('');
      } catch (error) {
        console.error('Error guardando offline:', error);
        setErrorMessage('Error al guardar offline. Intente de nuevo.');
      }
    }
  };

  const filteredLecturas = lecturas?.filter((l) => {
    if (viviendaFilter !== 'all' && l.vivienda_id.toString() !== viviendaFilter) return false;
    if (searchTerm) {
      const vivienda = viviendas?.find(v => v.id === l.vivienda_id);
      const searchLower = searchTerm.toLowerCase();
      const matchesPropietario = vivienda?.propietario.toLowerCase().includes(searchLower);
      const matchesCasa = vivienda?.numero_casa.toLowerCase().includes(searchLower);
      if (!matchesPropietario && !matchesCasa) return false;
    }
    return true;
  });

  const getViviendaInfo = (id: number) => {
    return viviendas?.find(v => v.id === id);
  };

  const getViviendaLabel = (id: number) => {
    const v = getViviendaInfo(id);
    return v ? `MZ ${v.manzana_id} Casa ${v.numero_casa} - ${v.propietario}` : `Casa #${id}`;
  };

  const getViviendaNumero = (id: number) => {
    const v = getViviendaInfo(id);
    return v ? `MZ ${v.manzana_id} C${v.numero_casa}` : `#${id}`;
  };

  const getViviendasSinLectura = () => {
    const viviendasConLectura = new Set(lecturas?.map(l => l.vivienda_id));
    return viviendas?.filter(v => !viviendasConLectura.has(v.id) && v.estado === 'activo') || [];
  };

  const viviendasSinLectura = getViviendasSinLectura();
  const totalConsumo = filteredLecturas?.reduce((sum, l) => sum + (l.consumo || 0), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Lecturas</h1>
          <p className="text-muted-foreground">
            Período: {getMonthName(mes)} {ano}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md">
                <Wifi className="h-3 w-3" />
                En línea
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-md">
                <WifiOff className="h-3 w-3" />
                Sin conexión
              </span>
            )}
          </div>
          <Button onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Lectura
          </Button>
        </div>
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
              <Label>Buscar vivienda</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre o número de casa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex-1">
              <Label>Filtrar por vivienda</Label>
              <Select value={viviendaFilter} onValueChange={setViviendaFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las viviendas</SelectItem>
                  {viviendas?.map((v) => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      {getViviendaLabel(v.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{filteredLecturas?.length || 0}</p>
            <p className="text-xs text-blue-600">Lecturas registradas</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatNumber(totalConsumo)}</p>
            <p className="text-xs text-green-600">kWh consumo total</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{viviendasSinLectura.length}</p>
            <p className="text-xs text-yellow-600">Sin lectura</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{filteredLecturas?.length ? Math.round(totalConsumo / filteredLecturas.length) : 0}</p>
            <p className="text-xs text-purple-600">kWh promedio</p>
          </CardContent>
        </Card>
      </div>

      {/* Viviendas sin lectura */}
      {viviendasSinLectura.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-4 w-4" />
              Viviendas sin lectura este período ({viviendasSinLectura.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {viviendasSinLectura.slice(0, 10).map((v) => (
                <span key={v.id} className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-md">
                  MZ {v.manzana_id} C{v.numero_casa}
                </span>
              ))}
              {viviendasSinLectura.length > 10 && (
                <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded-md">
                  +{viviendasSinLectura.length - 10} más
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Casa</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead className="text-right">Lectura Anterior</TableHead>
              <TableHead className="text-right">Lectura Actual</TableHead>
              <TableHead className="text-right">Consumo</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex justify-center">Cargando...</div>
                </TableCell>
              </TableRow>
            ) : filteredLecturas?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No hay lecturas registradas para este período
                </TableCell>
              </TableRow>
            ) : (
              filteredLecturas?.map((lectura) => {
                const vivienda = getViviendaInfo(lectura.vivienda_id);
                return (
                  <TableRow key={lectura.id} className={lectura.sincronizado ? '' : 'bg-yellow-50'}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        {getViviendaNumero(lectura.vivienda_id)}
                      </div>
                    </TableCell>
                    <TableCell>{vivienda?.propietario || '-'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {lectura.lectura_anterior ? formatNumber(lectura.lectura_anterior) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNumber(lectura.lectura_actual)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm">
                        {formatNumber(lectura.consumo || 0)} kWh
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {lectura.sincronizado ? (
                        <span className="flex items-center justify-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="h-4 w-4" /> Sincronizado
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-yellow-600 text-sm">
                          <Clock className="h-4 w-4" /> Pendiente
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(lectura)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            if (confirm('¿Eliminar esta lectura?')) {
                              deleteLecturaMutation.mutate(lectura.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingLectura ? 'Editar Lectura' : 'Nueva Lectura'}
            </DialogTitle>
          </DialogHeader>
          {errorMessage && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {errorMessage}
            </div>
          )}
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="vivienda_id">Vivienda</Label>
              <Select 
                value={formData.vivienda_id} 
                onValueChange={(value) => setFormData({ ...formData, vivienda_id: value })}
                disabled={!!editingLectura}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar vivienda" />
                </SelectTrigger>
                <SelectContent>
                  {viviendas?.filter(v => v.estado === 'activo').map((v) => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      {getViviendaLabel(v.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formData.vivienda_id && (
              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm text-muted-foreground">Lectura anterior:</p>
                <p className="font-medium">
                  {lecturas?.find(l => l.vivienda_id.toString() === formData.vivienda_id)?.lectura_anterior 
                    ? formatNumber(lecturas!.find(l => l.vivienda_id.toString() === formData.vivienda_id)!.lectura_anterior!)
                    : 'No hay lectura anterior'}
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="lectura_actual">Lectura Actual</Label>
              <Input
                id="lectura_actual"
                type="number"
                placeholder="Ingrese la lectura del medidor"
                value={formData.lectura_actual}
                onChange={(e) => setFormData({ ...formData, lectura_actual: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createLecturaMutation.isPending || updateLecturaMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {createLecturaMutation.isPending || updateLecturaMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
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
