import { useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { Layout } from '@/components/layout';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import ViviendasPage from '@/pages/viviendas';
import LecturasPage from '@/pages/lecturas';
import FacturasPage from '@/pages/facturas';
import ReportesPage from '@/pages/reportes';
import EstadoCuentaPage from '@/pages/estado-cuenta';
import PerfilPage from '@/pages/perfil';
import ConfiguracionPage from '@/pages/configuracion';
import RegistroPagosPage from '@/pages/registro-pagos';
import FacturacionPage from '@/pages/control-pagos';
import ControlCobrosPagosPage from '@/pages/control-cobros-pagos';
import ClientePortalPage from '@/pages/cliente-portal';
import UsuariosPage from '@/pages/usuarios';
import { api } from '@/lib/api';
import { getLecturasOffline, deleteLecturaOffline, getSyncQueue, clearSyncQueueItem } from '@/lib/indexeddb';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function SyncProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuthStore();

  const syncOfflineData = useCallback(async () => {
    if (!token || !isAuthenticated) return;

    try {
      const lecturasOffline = await getLecturasOffline();
      
      for (const lectura of lecturasOffline) {
        try {
          await api.post('/lectura', {
            vivienda_id: lectura.vivienda_id,
            ano: lectura.ano,
            mes: lectura.mes,
            lectura_actual: lectura.lectura_actual,
          }, token);
          await deleteLecturaOffline(lectura.offline_id);
        } catch (error) {
          console.error('Error syncing lectura:', error);
        }
      }

      const syncQueue = await getSyncQueue();
      
      for (const item of syncQueue) {
        try {
          if (item.type === 'lectura') {
            await api.post('/lectura', item.data, token);
          }
          await clearSyncQueueItem(item.id);
        } catch (error) {
          console.error('Error syncing queue item:', error);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['lecturas'] });
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
    } catch (error) {
      console.error('Sync error:', error);
    }
  }, [token, isAuthenticated, queryClient]);

  useEffect(() => {
    const handleOnline = () => {
      syncOfflineData();
    };

    window.addEventListener('online', handleOnline);
    
    if (navigator.onLine) {
      syncOfflineData();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [syncOfflineData]);

  return <>{children}</>;
}

function ProtectedRoute({ children, clienteOnly = false }: { children: React.ReactNode; clienteOnly?: boolean }) {
  const { isAuthenticated, usuario } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (clienteOnly && usuario?.rol !== 'cliente') {
    return <Navigate to="/dashboard" replace />;
  }
  if (!clienteOnly && usuario?.rol === 'cliente') {
    return <Navigate to="/cliente" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, usuario } = useAuthStore();
  if (isAuthenticated) {
    if (usuario?.rol === 'cliente') {
      return <Navigate to="/cliente" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  useEffect(() => {
    const releaseStalePointerLock = () => {
      const hasOpenDialog = !!document.querySelector('[role="dialog"]');
      if (!hasOpenDialog && document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    };

    releaseStalePointerLock();
    const intervalId = window.setInterval(releaseStalePointerLock, 500);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <SyncProvider>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/cliente" element={<ProtectedRoute clienteOnly><ClientePortalPage /></ProtectedRoute>} />
        <Route path="/" element={<ProtectedRoute><Layout><Navigate to="/dashboard" replace /></Layout></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
        <Route path="/viviendas" element={<ProtectedRoute><Layout><ViviendasPage /></Layout></ProtectedRoute>} />
        <Route path="/lecturas" element={<ProtectedRoute><Layout><LecturasPage /></Layout></ProtectedRoute>} />
        <Route path="/facturas" element={<ProtectedRoute><Layout><FacturasPage /></Layout></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute><Layout><ReportesPage /></Layout></ProtectedRoute>} />
        <Route path="/estado-cuenta" element={<ProtectedRoute><Layout><EstadoCuentaPage /></Layout></ProtectedRoute>} />
        <Route path="/perfil" element={<ProtectedRoute><Layout><PerfilPage /></Layout></ProtectedRoute>} />
        <Route path="/configuracion" element={<ProtectedRoute><Layout><ConfiguracionPage /></Layout></ProtectedRoute>} />
        <Route path="/registro-pagos" element={<ProtectedRoute><Layout><RegistroPagosPage /></Layout></ProtectedRoute>} />
        <Route path="/facturacion" element={<ProtectedRoute><Layout><FacturacionPage /></Layout></ProtectedRoute>} />
        <Route path="/control-pagos" element={<ProtectedRoute><Layout><ControlCobrosPagosPage /></Layout></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><Layout><UsuariosPage /></Layout></ProtectedRoute>} />
      </Routes>
    </SyncProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
