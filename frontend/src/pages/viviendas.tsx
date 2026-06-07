import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Toggle } from '@/components/ui/toggle';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Plus, Search, Phone, MessageCircle, Home as HomeIcon, Zap, Shield, Trash2, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Vivienda, Manzana } from '@/types';
import * as XLSX from 'xlsx';

const ITEMS_PER_PAGE = 7;

type ImportVivienda = Partial<Vivienda> & {
  manzana_codigo?: string;
};

type ExcelRow = Record<string, string | number | boolean | Date | null | undefined>;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return fallback;
};

export default function ViviendasPage() {
  const { token, usuario } = useAuthStore();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [manzanaFilter, setManzanaFilter] = useState<string>('all');
  const [estadoFilter, setEstadoFilter] = useState<string>('all');
  const [alumbradoFilter, setAlumbradoFilter] = useState<string>('all');
  const [seguridadFilter, setSeguridadFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [editingVivienda, setEditingVivienda] = useState<Vivienda | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmData, setDeleteConfirmData] = useState<{id: number; nombre: string; casa: string} | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importResult, setImportResult] = useState<{success: number; successList: string[]; errors: string[]} | null>(null);
  const [pendingImportRows, setPendingImportRows] = useState<ImportVivienda[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, manzanaFilter, estadoFilter, alumbradoFilter, seguridadFilter]);

  const canEdit = usuario?.rol === 'super_admin' || usuario?.rol === 'editor';

  const { data: viviendas, isLoading, error: viviendasError } = useQuery<Vivienda[]>({
    queryKey: ['viviendas', manzanaFilter],
    queryFn: () => {
      const url = manzanaFilter !== 'all' 
        ? `/viviendas?manzana_id=${manzanaFilter}` 
        : '/viviendas';
      return api.get<Vivienda[]>(url, token || undefined);
    },
    enabled: !!token,
  });

  const { data: manzanasData } = useQuery<Manzana[]>({
    queryKey: ['manzana'],
    queryFn: () => api.get<Manzana[]>('/manzanas', token || undefined),
    enabled: !!token,
  });

  const getManzanaLabelById = (id: number | string) => {
    const manzana = manzanasData?.find((m) => String(m.id) === String(id));
    return manzana?.codigo || `MZ ${id}`;
  };

  const sortByCasa = (a: Pick<Vivienda, 'manzana_id' | 'numero_casa'>, b: Pick<Vivienda, 'manzana_id' | 'numero_casa'>) => {
    const manzanaDiff = Number(a.manzana_id) - Number(b.manzana_id);
    if (manzanaDiff !== 0) return manzanaDiff;
    const casaDiff = Number(a.numero_casa) - Number(b.numero_casa);
    if (!Number.isNaN(casaDiff) && casaDiff !== 0) return casaDiff;
    return String(a.numero_casa).localeCompare(String(b.numero_casa), 'es', { numeric: true });
  };

  const normalizeHeader = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const getCellValue = (row: ExcelRow, aliases: string[]) => {
    const normalizedAliases = aliases.map(normalizeHeader);
    const key = Object.keys(row).find((header) =>
      normalizedAliases.includes(normalizeHeader(header))
    );
    return key ? row[key] : undefined;
  };

  const parseCasaReferencia = (value: unknown) => {
    const raw = String(value || '').trim().toUpperCase();
    const mzMatch = raw.match(/MZ\s*\.?\s*(\d+)/);
    const casaMatch = raw.match(/(?:CASA|C)\s*\.?\s*0*(\d+)/);
    return {
      manzanaNumero: mzMatch?.[1],
      numeroCasa: casaMatch?.[1] ? casaMatch[1].padStart(2, '0') : undefined,
    };
  };

  const resolveManzanaFromImport = (value: unknown, casaValue: unknown) => {
    const raw = String(value || '').trim();
    const casaParsed = parseCasaReferencia(casaValue);
    const manzanaNumero =
      parseCasaReferencia(raw).manzanaNumero ||
      casaParsed.manzanaNumero ||
      raw.match(/\d+/)?.[0];

    if (!manzanaNumero) {
      return { id: undefined, codigo: undefined };
    }

    const codigo = `MZ ${manzanaNumero}`;
    const existing = manzanasData?.find((m) => {
      const codigoNumero = m.codigo.match(/\d+/)?.[0];
      return (
        String(m.id) === raw ||
        normalizeHeader(m.codigo) === normalizeHeader(raw) ||
        codigoNumero === manzanaNumero
      );
    });

    return { id: existing?.id, codigo };
  };

  const normalizeCasaNumber = (value: unknown, casaValue: unknown) => {
    const parsed =
      parseCasaReferencia(casaValue).numeroCasa ||
      parseCasaReferencia(value).numeroCasa;
    if (parsed) return parsed;

    const raw = String(value || '').trim();
    const digits = raw.match(/\d+/)?.[0];
    return digits ? digits.padStart(2, '0') : raw;
  };

  const invalidateAllRelated = () => {
    queryClient.invalidateQueries({ queryKey: ['viviendas'] });
    queryClient.invalidateQueries({ queryKey: ['control-cobros-planilla'] });
    queryClient.invalidateQueries({ queryKey: ['control-cobros-facturas'] });
    queryClient.invalidateQueries({ queryKey: ['facturas'] });
    queryClient.invalidateQueries({ queryKey: ['lecturas'] });
    queryClient.invalidateQueries({ queryKey: ['planilla'] });
    queryClient.invalidateQueries({ queryKey: ['pagos'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<Vivienda>) => {
      const currentToken = useAuthStore.getState().token;
      if (!currentToken) throw new Error('No hay sesión activa');
      return api.post('/vivienda', data, currentToken);
    },
    onSuccess: () => {
      invalidateAllRelated();
      setIsDialogOpen(false);
      setEditingVivienda(null);
      setErrorMessage('');
    },
    onError: (error) => {
      setErrorMessage(getErrorMessage(error, 'Error al crear la vivienda'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Vivienda> }) => {
      const currentToken = useAuthStore.getState().token;
      if (!currentToken) throw new Error('No hay sesión activa');
      return api.put(`/viviendas/${id}`, data, currentToken);
    },
    onSuccess: () => {
      invalidateAllRelated();
      setIsDialogOpen(false);
      setEditingVivienda(null);
      setErrorMessage('');
    },
    onError: (error) => {
      const message = getErrorMessage(error, 'Error al actualizar la vivienda');
      setErrorMessage(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      const currentToken = useAuthStore.getState().token;
      if (!currentToken) throw new Error('No hay sesión activa');
      return api.delete(`/viviendas/${id}`, currentToken);
    },
    onSuccess: () => {
      invalidateAllRelated();
      setDeleteConfirmId(null);
      setDeleteConfirmData(null);
      setErrorMessage('');
    },
    onError: (error) => {
      setErrorMessage(getErrorMessage(error, 'Error al eliminar la vivienda'));
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: ImportVivienda[]) => {
      const currentToken = useAuthStore.getState().token;
      if (!currentToken) throw new Error('No hay sesión activa');
      const results = { 
        success: 0, 
        successList: [] as string[], 
        errors: [] as string[] 
      };
      const manzanaCache = new Map(
        (manzanasData || []).map((m) => [normalizeHeader(m.codigo), m])
      );

      const getOrCreateManzanaId = async (item: ImportVivienda) => {
        if (item.manzana_id) return item.manzana_id;
        if (!item.manzana_codigo) {
          throw new Error('La manzana no se pudo identificar');
        }

        const cacheKey = normalizeHeader(item.manzana_codigo);
        const cached = manzanaCache.get(cacheKey);
        if (cached) return cached.id;

        const created = await api.post<Manzana>(
          '/manzana',
          {
            codigo: item.manzana_codigo,
            nombre: item.manzana_codigo,
            descripcion: 'Creada automaticamente desde importacion de viviendas',
          },
          currentToken
        );
        manzanaCache.set(cacheKey, created);
        return created.id;
      };
      
      for (const item of data) {
        try {
          const manzanaId = await getOrCreateManzanaId(item);
          const { manzana_codigo, ...payload } = item;
          await api.post('/vivienda', { ...payload, manzana_id: manzanaId }, currentToken);
          results.success++;
          results.successList.push(`${item.propietario} (${item.manzana_codigo || getManzanaLabelById(manzanaId)} - C ${item.numero_casa})`);
        } catch (error) {
          const status = typeof error === 'object' && error && 'response' in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
          if (status === 400 || status === 409) {
            results.errors.push(`Omitido: ${item.propietario} (ya existe)`);
          } else {
            results.errors.push(`Error en ${item.propietario}: ${getErrorMessage(error, 'Error desconocido')}`);
          }
        }
      }
      return results;
    },
    onSuccess: (results) => {
      setImportResult(results);
      setPendingImportRows([]);
      setIsImporting(false);
      queryClient.invalidateQueries({ queryKey: ['viviendas'] });
      queryClient.invalidateQueries({ queryKey: ['manzana'] });
    },
    onError: (error) => {
      setImportResult({ success: 0, successList: [], errors: [getErrorMessage(error, 'Error al importar')] });
      setIsImporting(false);
    },
  });

  const exportToExcel = () => {
    const dataToExport = filteredViviendas?.map((v) => ({
      'Manzana': v.manzana_codigo || getManzanaLabelById(v.manzana_id),
      'Número Casa': v.numero_casa,
      'Propietario': v.propietario,
      'Cédula': v.cedula || '',
      'Teléfono': v.telefono || '',
      'WhatsApp': v.whatsapp || '',
      'Email': v.email || '',
      'Dirección': v.direccion || '',
      'Alumbrado': v.tiene_alumbrado ? 'Sí' : 'No',
      'Seguridad': v.tiene_seguridad ? 'Sí' : 'No',
      'Estado': v.estado === 'activo' ? 'Activo' : 'Inactivo',
    })) || [];

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Viviendas');
    
    const colWidths = [
      { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 30 },
      { wch: 10 }, { wch: 10 }, { wch: 10 },
    ];
    ws['!cols'] = colWidths;
    
    XLSX.writeFile(wb, `viviendas_portales_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Manzana': 183,
        'Número Casa': '01',
        'Propietario': 'Nombre del Propietario',
        'Cédula': '12345678',
        'Teléfono': '04121234567',
        'WhatsApp': '04121234567',
        'Email': 'email@ejemplo.com',
        'Dirección': 'Manzana 183 - Casa 01',
        'Alumbrado': 'Sí',
        'Seguridad': 'No',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    
    const colWidths = [
      { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 30 },
      { wch: 10 }, { wch: 10 },
    ];
    ws['!cols'] = colWidths;
    
    XLSX.writeFile(wb, 'plantilla_viviendas.xlsx');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

        {
          const headers = Object.keys(jsonData[0] || {});
          const hasColumn = (aliases: string[]) => {
            const normalizedAliases = aliases.map(normalizeHeader);
            return headers.some((header) => normalizedAliases.includes(normalizeHeader(header)));
          };

          if (!hasColumn(['Manzana', 'MZ', 'CASA', 'Casa']) || !hasColumn(['Propietario', 'Nombre', 'NOMBRE'])) {
            setImportResult({
              success: 0,
              successList: [],
              errors: ['El archivo debe tener columnas de casa/manzana y propietario/nombre. Puede usar la plantilla o el Excel de facturacion.']
            });
            setIsImporting(false);
            return;
          }

          const validData: ImportVivienda[] = [];
          const formatErrors: string[] = [];

          jsonData.forEach((row, index) => {
            const casaReferencia = getCellValue(row, ['CASA', 'Casa']);
            const manzanaValue = getCellValue(row, ['Manzana', 'MZ', 'Manzana ID']) || casaReferencia;
            const numeroCasaValue = getCellValue(row, ['Numero Casa', 'Numero de Casa', 'Número Casa', 'Casa Numero']) || casaReferencia;
            const propietario = String(getCellValue(row, ['Propietario', 'Nombre', 'NOMBRE']) || '').trim();
            const manzana = resolveManzanaFromImport(manzanaValue, casaReferencia);
            const numeroCasa = normalizeCasaNumber(numeroCasaValue, casaReferencia);

            if (!manzana.codigo) {
              formatErrors.push(`Fila ${index + 2}: Manzana invalida`);
              return;
            }
            if (!numeroCasa) {
              formatErrors.push(`Fila ${index + 2}: Numero de casa requerido`);
              return;
            }
            if (!propietario || propietario.length < 3) {
              formatErrors.push(`Fila ${index + 2}: Propietario requerido`);
              return;
            }

            const seguridadRaw = String(getCellValue(row, ['Seguridad', 'Seguri', 'SEGURIDAD']) || 'No').toLowerCase();
            const estadoRaw = String(getCellValue(row, ['Estado', 'ESTADO']) || 'activo').toLowerCase();

            validData.push({
              manzana_id: manzana.id,
              manzana_codigo: manzana.codigo,
              numero_casa: numeroCasa,
              propietario,
              cedula: String(getCellValue(row, ['Cedula', 'Cédula', 'C.C.', 'CC']) || '').trim() || undefined,
              telefono: String(getCellValue(row, ['Telefono', 'Teléfono', 'Celular', 'CEL', 'Contacto']) || '').trim() || undefined,
              whatsapp: String(getCellValue(row, ['WhatsApp', 'Whatsapp', 'Telefono', 'Teléfono', 'Celular', 'CEL']) || '').trim() || undefined,
              email: String(getCellValue(row, ['Email', 'Correo']) || '').trim() || undefined,
              direccion: String(getCellValue(row, ['Direccion', 'Dirección', 'DIRECCION']) || '').trim() || `${manzana.codigo} - Casa ${numeroCasa}`,
              tiene_alumbrado: String(getCellValue(row, ['Alumbrado', 'Alumbra', 'ALUMBRADO']) || 'Si').toLowerCase() !== 'no',
              tiene_seguridad: seguridadRaw === 'si' || seguridadRaw === 'sí' || seguridadRaw === 'true' || seguridadRaw === '1',
              estado: estadoRaw.includes('inactivo') ? 'inactivo' : 'activo',
            });
          });

          if (validData.length === 0) {
            setImportResult({
              success: 0,
              successList: [],
              errors: ['No se encontraron datos validos para importar.', ...formatErrors.slice(0, 20)]
            });
            setIsImporting(false);
            return;
          }

          setPendingImportRows(validData);
          setImportResult({
            success: validData.length,
            successList: validData.slice(0, 20).map((item) =>
              `${item.propietario} (${item.manzana_codigo || getManzanaLabelById(item.manzana_id || '')} - C ${item.numero_casa})`
            ),
            errors: formatErrors,
          });
          setIsImporting(false);
          return;
        }

        const requiredColumns = ['Manzana', 'Número Casa', 'Propietario'];
        const headers = Object.keys(jsonData[0] || {});
        
        const missingColumns = requiredColumns.filter((col) => !headers.some((header) => normalizeHeader(header) === normalizeHeader(col)));
        if (missingColumns.length > 0) {
          setImportResult({
            success: 0,
            successList: [],
            errors: [`Columnas requeridas faltantes: ${missingColumns.join(', ')}. Asegúrese de usar la plantilla correcta.`]
          });
          setIsImporting(false);
          return;
        }

        const validData: Partial<Vivienda>[] = [];
        const formatErrors: string[] = [];

        jsonData.forEach((row, index) => {
          const manzana = parseInt(String(getCellValue(row, ['Manzana']) || '0'));
          const numeroCasa = String(getCellValue(row, ['Número Casa', 'Numero Casa']) || '').trim();
          const propietario = String(getCellValue(row, ['Propietario']) || '').trim();

          if (!manzana || isNaN(manzana)) {
            formatErrors.push(`Fila ${index + 2}: Manzana inválida`);
            return;
          }
          if (!numeroCasa) {
            formatErrors.push(`Fila ${index + 2}: Número de casa requerido`);
            return;
          }
          if (!propietario || propietario.length < 3) {
            formatErrors.push(`Fila ${index + 2}: Propietario requerido (mínimo 3 caracteres)`);
            return;
          }

          const alumbrado = String(getCellValue(row, ['Alumbrado']) || 'Sí').toLowerCase();
          const seguridad = String(getCellValue(row, ['Seguridad']) || 'No').toLowerCase();
          validData.push({
            manzana_id: manzana,
            numero_casa: numeroCasa,
            propietario: propietario,
            cedula: String(getCellValue(row, ['Cédula', 'Cedula']) || '').trim() || undefined,
            telefono: String(getCellValue(row, ['Teléfono', 'Telefono']) || '').trim() || undefined,
            whatsapp: String(getCellValue(row, ['WhatsApp', 'Whatsapp']) || '').trim() || undefined,
            email: String(getCellValue(row, ['Email']) || '').trim() || undefined,
            direccion: String(getCellValue(row, ['Dirección', 'Direccion']) || '').trim() || `MZ ${manzana} - Casa ${numeroCasa}`,
            tiene_alumbrado: alumbrado === 'sí' || alumbrado === 'si' || alumbrado === 'yes' || alumbrado === 'true' || alumbrado === '1',
            tiene_seguridad: seguridad === 'sí' || seguridad === 'si' || seguridad === 'yes' || seguridad === 'true' || seguridad === '1',
            estado: 'activo',
          });
        });

        if (formatErrors.length > 0 && validData.length === 0) {
          setImportResult({
            success: 0,
            successList: [],
            errors: ['Error de formato:', ...formatErrors]
          });
          setIsImporting(false);
          return;
        }

        if (validData.length === 0) {
          setImportResult({
            success: 0,
            successList: [],
            errors: ['No se encontraron datos válidos para importar.']
          });
          setIsImporting(false);
          return;
        }

        setPendingImportRows(validData as ImportVivienda[]);
        setImportResult({
          success: validData.length,
          successList: (validData as ImportVivienda[]).slice(0, 20).map((item) =>
            `${item.propietario} (${getManzanaLabelById(item.manzana_id || '')} - C ${item.numero_casa})`
          ),
          errors: formatErrors,
        });
        setIsImporting(false);
      } catch (error) {
        setImportResult({
          success: 0,
          successList: [],
          errors: ['Error al leer el archivo. Asegúrese de que sea un archivo Excel válido (.xlsx)']
        });
        setIsImporting(false);
      }
    };

    reader.onerror = () => {
      setImportResult({
        success: 0,
        successList: [],
        errors: ['Error al leer el archivo']
      });
      setIsImporting(false);
    };

    reader.readAsBinaryString(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [formData, setFormData] = useState({
    numero_casa: '',
    manzana_id: '',
    propietario: '',
    cedula: '',
    telefono: '',
    whatsapp: '',
    email: '',
    direccion: '',
    tiene_alumbrado: true,
    tiene_seguridad: false,
    tiene_toma_lectura: true,
    tiene_administracion: false,
    estado: 'activo',
  });

  const openNewDialog = () => {
    setEditingVivienda(null);
    setErrorMessage('');
    setFormData({
      numero_casa: '',
      manzana_id: '',
      propietario: '',
      cedula: '',
      telefono: '',
      whatsapp: '',
      email: '',
      direccion: '',
      tiene_alumbrado: true,
      tiene_seguridad: false,
      tiene_toma_lectura: true,
      tiene_administracion: false,
      estado: 'activo',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (vivienda: Vivienda) => {
    setEditingVivienda(vivienda);
    setErrorMessage('');
    const manzana = manzanasData?.find((m) => m.id === vivienda.manzana_id)
      || manzanasData?.find((m) => normalizeHeader(m.codigo) === normalizeHeader(vivienda.manzana_codigo || `MZ ${vivienda.manzana_id}`));
    const manzanaLabel = manzana?.codigo || `MZ ${vivienda.manzana_id}`;
    const numCasa = vivienda.numero_casa.padStart(2, '0');
    const direccionAuto = `${manzanaLabel} - Casa ${numCasa}`;
    setFormData({
      numero_casa: numCasa,
      manzana_id: String(manzana?.id || vivienda.manzana_id),
      propietario: vivienda.propietario,
      cedula: vivienda.cedula || '',
      telefono: vivienda.telefono || '',
      whatsapp: vivienda.whatsapp || '',
      email: vivienda.email || '',
      direccion: direccionAuto,
      tiene_alumbrado: vivienda.tiene_alumbrado,
      tiene_seguridad: vivienda.tiene_seguridad,
      tiene_toma_lectura: vivienda.tiene_toma_lectura,
      tiene_administracion: vivienda.tiene_administracion,
      estado: vivienda.estado,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    setErrorMessage('');
    
    if (!formData.manzana_id) {
      setErrorMessage('Seleccione una manzana');
      return;
    }
    if (!formData.numero_casa.trim()) {
      setErrorMessage('Ingrese el número de casa');
      return;
    }
    if (!formData.propietario.trim()) {
      setErrorMessage('Ingrese el nombre del propietario');
      return;
    }
    
    const numManzana = parseInt(formData.manzana_id);
    const numCasa = formData.numero_casa;
    
    if (!editingVivienda) {
      const viviendaExistente = viviendas?.find(
        v => v.manzana_id === numManzana && v.numero_casa === numCasa
      );
      if (viviendaExistente) {
        setErrorMessage(`Ya existe la vivienda ${viviendaExistente.propietario} en ${getManzanaLabelById(numManzana)} - C ${numCasa}`);
        return;
      }
    }
    
    const dataToSend = {
      ...formData,
      manzana_id: numManzana,
    };
    
    if (editingVivienda) {
      updateMutation.mutate({ id: editingVivienda.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const toggleService = (vivienda: Vivienda, service: string) => {
    const updates: Record<string, boolean> = {
      tiene_alumbrado: !vivienda.tiene_alumbrado,
      tiene_seguridad: !vivienda.tiene_seguridad,
      tiene_toma_lectura: !vivienda.tiene_toma_lectura,
    };
    const currentToken = useAuthStore.getState().token;
    if (!currentToken) {
      setErrorMessage('No hay sesión activa');
      return;
    }
    api.put(`/viviendas/${vivienda.id}`, { [service]: updates[service] }, currentToken)
      .then(() => invalidateAllRelated())
      .catch((error) => {
        setErrorMessage(getErrorMessage(error, 'Error al actualizar'));
      });
  };

  const toggleEstado = (vivienda: Vivienda) => {
    const newEstado = vivienda.estado === 'activo' ? 'inactivo' : 'activo';
    const currentToken = useAuthStore.getState().token;
    if (!currentToken) {
      setErrorMessage('No hay sesión activa');
      return;
    }
    api.put(`/viviendas/${vivienda.id}`, { estado: newEstado }, currentToken)
      .then(() => invalidateAllRelated())
      .catch((error) => {
        setErrorMessage(getErrorMessage(error, 'Error al actualizar el estado'));
      });
  };

  const filteredViviendas = useMemo(() => {
    return viviendas?.filter((v) => {
      const matchesSearch = 
        v.propietario.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.numero_casa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.cedula?.includes(searchTerm);
      
      const matchesEstado = estadoFilter === 'all' || v.estado === estadoFilter;
      const matchesAlumbrado = alumbradoFilter === 'all' || 
        (alumbradoFilter === 'si' && v.tiene_alumbrado) ||
        (alumbradoFilter === 'no' && !v.tiene_alumbrado);
      const matchesSeguridad = seguridadFilter === 'all' || 
        (seguridadFilter === 'si' && v.tiene_seguridad) ||
        (seguridadFilter === 'no' && !v.tiene_seguridad);
      
      return matchesSearch && matchesEstado && matchesAlumbrado && matchesSeguridad;
    }).slice().sort(sortByCasa);
  }, [viviendas, searchTerm, estadoFilter, alumbradoFilter, seguridadFilter]);

  const isFilteredByManzana = manzanaFilter !== 'all';
  const totalPages = isFilteredByManzana ? 1 : Math.ceil((filteredViviendas?.length || 0) / ITEMS_PER_PAGE);
  
  const paginatedViviendas = useMemo(() => {
    if (!filteredViviendas) return [];
    if (isFilteredByManzana) {
      return filteredViviendas;
    }
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredViviendas.slice(startIndex, endIndex);
  }, [filteredViviendas, currentPage, isFilteredByManzana]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const getCasaLabel = (vivienda: Pick<Vivienda, 'manzana_id' | 'manzana_codigo' | 'numero_casa'>) => {
    const manzana = vivienda.manzana_codigo || getManzanaLabelById(vivienda.manzana_id);
    return `${manzana} - C ${vivienda.numero_casa.padStart(2, '0')}`;
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Registro Maestro de Viviendas y Servicios</h1>
          <p className="text-muted-foreground">Administra las viviendas y servicios del conjunto</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportToExcel} className="bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 hover:text-green-300">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={downloadTemplate} className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Plantilla
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => { setShowImportDialog(true); setImportResult(null); setPendingImportRows([]); }} className="bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300">
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
              <Button onClick={openNewDialog} className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Vivienda
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-purple-400" />
              Importar Viviendas desde Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-400 mb-2">Instrucciones:</h4>
              <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside">
                <li>Descargue la plantilla Excel usando el botón "Plantilla"</li>
                <li>Llene los datos siguiendo el formato de las columnas</li>
                <li>Guarde el archivo y selecciónelo aquí</li>
                <li>Los registros existentes serán omitidos automáticamente</li>
              </ol>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            
            <label
              htmlFor="file-upload"
              className="flex items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors"
            >
              <div className="text-center">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-purple-400 mb-2" />
                <p className="text-sm text-white/70">Haga clic o arrastre el archivo Excel</p>
                <p className="text-xs text-white/50 mt-1">(.xlsx, .xls)</p>
              </div>
            </label>

            {isImporting && (
              <div className="flex items-center justify-center gap-2 py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400"></div>
                <span className="text-sm text-white/70">
                  {importMutation.isPending ? 'Guardando viviendas...' : 'Leyendo archivo...'}
                </span>
              </div>
            )}

            {importResult && (
              <div className={`rounded-lg p-4 ${importResult.errors.length > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {importResult.errors.length > 0 ? (
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                  ) : (
                    <Check className="h-5 w-5 text-green-400" />
                  )}
                  <span className={`font-medium ${importResult.errors.length > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {pendingImportRows.length > 0
                      ? `${pendingImportRows.length} viviendas listas para guardar`
                      : `${importResult.success} viviendas importadas exitosamente`}
                  </span>
                </div>
                
                {importResult.successList.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-green-400 font-medium mb-1">
                      {pendingImportRows.length > 0 ? 'Registros detectados:' : 'Registros nuevos agregados:'}
                    </p>
                    <ul className="text-xs text-white/70 space-y-0.5 max-h-32 overflow-y-auto bg-green-500/10 rounded p-2">
                      {importResult.successList.map((item, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-green-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {importResult.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-yellow-400 font-medium mb-1">Registros omitidos o con errores:</p>
                    <ul className="text-xs text-white/60 space-y-0.5 max-h-32 overflow-y-auto">
                      {importResult.errors.slice(0, 10).map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                      {importResult.errors.length > 10 && (
                        <li className="text-yellow-400/70">... y {importResult.errors.length - 10} más</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false);
                setPendingImportRows([]);
                setImportResult(null);
              }}
              disabled={importMutation.isPending}
            >
              Cerrar
            </Button>
            {pendingImportRows.length > 0 && (
              <Button
                onClick={() => {
                  setIsImporting(true);
                  importMutation.mutate(pendingImportRows);
                }}
                disabled={importMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {importMutation.isPending ? 'Guardando...' : `Guardar importación (${pendingImportRows.length})`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por propietario, número o cédula..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Manzana</label>
                <Select value={manzanaFilter} onValueChange={setManzanaFilter}>
                  <SelectTrigger className="w-full sm:w-[140px]">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {manzanasData?.map((m: Manzana) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Estado</label>
                <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Alumbrado</label>
                <Select value={alumbradoFilter} onValueChange={setAlumbradoFilter}>
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="si">Paga</SelectItem>
                    <SelectItem value="no">No Paga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Seguridad</label>
                <Select value={seguridadFilter} onValueChange={setSeguridadFilter}>
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="si">Paga</SelectItem>
                    <SelectItem value="no">No Paga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {viviendasError && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-sm text-red-300">
              No se pudieron cargar las viviendas. {viviendasError instanceof Error ? viviendasError.message : 'Intenta iniciar sesion nuevamente.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-white/5">
              <TableHead className="text-white/70 font-semibold">Casa</TableHead>
              <TableHead className="text-white/70 font-semibold">Propietario</TableHead>
              <TableHead className="text-white/70 font-semibold hidden md:table-cell">Contacto</TableHead>
              <TableHead className="text-white/70 font-semibold text-center">Alumbra</TableHead>
              <TableHead className="text-white/70 font-semibold text-center">Seguri</TableHead>
              <TableHead className="text-white/70 font-semibold text-center hidden lg:table-cell">Estado</TableHead>
              {canEdit && <TableHead className="text-white/70 font-semibold text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedViviendas.map((vivienda) => (
              <TableRow key={vivienda.id} className={cn(
                "border-white/5 hover:bg-white/5 transition-colors",
                vivienda.estado !== 'activo' && 'opacity-50 bg-slate-900/50'
              )}>
                <TableCell className="font-medium py-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-green-500/10">
                      <HomeIcon className="h-4 w-4 text-green-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{getCasaLabel(vivienda)}</p>
                      <p className="text-xs text-white/50 md:hidden">{vivienda.propietario}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <div>
                    <p className="font-medium text-white">{vivienda.propietario}</p>
                    <p className="text-xs text-white/50">{vivienda.cedula || 'Sin cédula'}</p>
                  </div>
                </TableCell>
                <TableCell className="py-3 hidden md:table-cell">
                  <div className="flex flex-col gap-1">
                    {vivienda.telefono && (
                      <a href={`tel:${vivienda.telefono}`} className="flex items-center gap-1.5 text-sm text-white/70 hover:text-green-400 transition-colors">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{vivienda.telefono}</span>
                      </a>
                    )}
                    {vivienda.whatsapp && (
                      <a href={`https://wa.me/${vivienda.whatsapp.replace('+', '')}`} target="_blank" className="flex items-center gap-1.5 text-sm text-white/70 hover:text-green-400 transition-colors">
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>{vivienda.whatsapp}</span>
                      </a>
                    )}
                    {!vivienda.telefono && !vivienda.whatsapp && (
                      <span className="text-sm text-white/40">Sin contacto</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-3 text-center">
                  <Toggle
                    checked={vivienda.tiene_alumbrado}
                    onChange={() => toggleService(vivienda, 'tiene_alumbrado')}
                    size="sm"
                    activeColor="bg-green-500"
                    inactiveColor="bg-slate-700"
                  />
                </TableCell>
                <TableCell className="py-3 text-center">
                  <Toggle
                    checked={vivienda.tiene_seguridad}
                    onChange={() => toggleService(vivienda, 'tiene_seguridad')}
                    size="sm"
                    activeColor="bg-blue-500"
                    inactiveColor="bg-slate-700"
                  />
                </TableCell>
                <TableCell className="py-3 text-center hidden lg:table-cell">
                  <Toggle
                    checked={vivienda.estado === 'activo'}
                    onChange={() => toggleEstado(vivienda)}
                    size="sm"
                    activeColor="bg-green-500"
                    inactiveColor="bg-red-500"
                  />
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right py-3">
                    <div className="flex justify-end items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 px-2 text-white/70 hover:text-white hover:bg-white/10"
                        onClick={() => openEditDialog(vivienda)}
                      >
                        <Zap className="h-3.5 w-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0 text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => {
                          setDeleteConfirmId(vivienda.id);
                          setDeleteConfirmData({
                            id: vivienda.id,
                            nombre: vivienda.propietario,
                            casa: getCasaLabel(vivienda)
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredViviendas?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron viviendas
          </div>
        )}
        
        {/* Paginator */}
        {filteredViviendas && filteredViviendas.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-white/10">
            <p className="text-sm text-white/60">
              {isFilteredByManzana 
                ? `Mostrando ${filteredViviendas.length} viviendas de ${getManzanaLabelById(manzanaFilter)}`
                : `Mostrando ${(currentPage - 1) * ITEMS_PER_PAGE + 1} - ${Math.min(currentPage * ITEMS_PER_PAGE, filteredViviendas.length)} de ${filteredViviendas.length} viviendas`
              }
            </p>
            {!isFilteredByManzana && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {getPageNumbers().map((page, index) => (
                  typeof page === 'number' ? (
                    <Button
                      key={index}
                      variant={currentPage === page ? "default" : "ghost"}
                      size="sm"
                      onClick={() => handlePageChange(page)}
                      className={cn(
                        "h-8 min-w-[32px] px-2",
                        currentPage === page 
                          ? "bg-green-500 text-white hover:bg-green-600" 
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      )}
                    >
                      {page}
                    </Button>
                  ) : (
                    <span key={index} className="px-1 text-white/40">...</span>
                  )
                ))}
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteConfirmId(null);
            setDeleteConfirmData(null);
            setErrorMessage('');
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-red-500/20">
                <Trash2 className="h-6 w-6 text-red-400" />
              </div>
              Eliminar Vivienda
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-white/70 mb-4">
              ¿Estás seguro de que deseas eliminar esta vivienda? Esta acción no se puede deshacer.
            </p>
            {deleteConfirmData && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-white/50">Propietario:</span>
                  <span className="font-medium text-white">{deleteConfirmData.nombre}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/50">Casa:</span>
                  <span className="font-medium text-white">{deleteConfirmData.casa}</span>
                </div>
              </div>
            )}
            {errorMessage && (
              <div className="mt-4 bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm">
                {errorMessage}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteConfirmId(null);
                setDeleteConfirmData(null);
                setErrorMessage('');
              }}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) {
                  deleteMutation.mutate(deleteConfirmId);
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for add/edit */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVivienda ? 'Editar Vivienda' : 'Nueva Vivienda'}
            </DialogTitle>
          </DialogHeader>
          {errorMessage && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
              {errorMessage}
            </div>
          )}
          <div className="grid gap-4 py-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-sm font-medium text-white/70 mb-3">Ubicación de la Vivienda</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-xs text-white/60 mb-1 block">Manzana</Label>
                  <Select 
                    value={formData.manzana_id} 
                    onValueChange={(value) => {
                      const selected = manzanasData?.find((m) => String(m.id) === value);
                      setFormData({ 
                        ...formData, 
                        manzana_id: value,
                        direccion: `${selected?.codigo || `MZ ${value}`} - Casa ${formData.numero_casa.padStart(2, '0')}`
                      })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="MZ" />
                    </SelectTrigger>
                    <SelectContent>
                      {manzanasData?.map((m: Manzana) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.codigo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[100px]">
                  <Label className="text-xs text-white/60 mb-1 block">Casa #</Label>
                  <Input
                    value={formData.numero_casa}
                    onChange={(e) => {
                      const casa = e.target.value.replace(/\D/g, '').slice(0, 2);
                      const selected = manzanasData?.find((m) => String(m.id) === formData.manzana_id);
                      setFormData({ 
                        ...formData, 
                        numero_casa: casa,
                        direccion: `${selected?.codigo || 'MZ X'} - Casa ${casa.padStart(2, '0')}`
                      })
                    }}
                    placeholder="01"
                    className="w-full"
                  />
                </div>
                <div className="flex-[2] min-w-[200px]">
                  <Label className="text-xs text-white/60 mb-1 block">Dirección completa</Label>
                  <Input
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                    placeholder="Se genera automáticamente"
                    className="w-full bg-white/10"
                    readOnly
                  />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="propietario">Nombre del Propietario</Label>
                <Input
                  id="propietario"
                  value={formData.propietario}
                  onChange={(e) => setFormData({ ...formData, propietario: e.target.value })}
                  placeholder="Nombre completo"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cedula">Cédula</Label>
                <Input
                  id="cedula"
                  value={formData.cedula}
                  onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                  placeholder="Número de cédula"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  placeholder="Teléfono de contacto"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  placeholder="Número de WhatsApp"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="correo@email.com"
                />
              </div>
            </div>
            
            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.tiene_alumbrado}
                  onChange={(e) => setFormData({ ...formData, tiene_alumbrado: e.target.checked })}
                  className="rounded"
                />
                <Zap className="h-4 w-4" />
                Alumbrado
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.tiene_seguridad}
                  onChange={(e) => setFormData({ ...formData, tiene_seguridad: e.target.checked })}
                  className="rounded"
                />
                <Shield className="h-4 w-4" />
                Seguridad
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingVivienda ? 'Guardar' : 'Crear'}
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
        }
        
        .table-glass tr:hover td {
          background: rgba(255, 255, 255, 0.03);
        }
        
        input[type="checkbox"] {
          accent-color: #22c55e;
        }
        
        /* Tabla mejorada */
        table tbody tr {
          transition: all 0.15s ease;
        }
        
        table tbody tr:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        
        table tbody tr:last-child td {
          border-bottom: none;
        }
      `}</style>
    </div>
  );
}
