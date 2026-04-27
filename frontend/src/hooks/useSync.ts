import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { getLecturasOffline, deleteLecturaOffline, getSyncQueue, clearSyncQueueItem } from '@/lib/indexeddb';
import { useQueryClient } from '@tanstack/react-query';

export function useSync() {
  const { token, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

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

  return { syncOfflineData };
}