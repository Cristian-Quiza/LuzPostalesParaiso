import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { LecturaOffline } from '@/types';

interface PortalesDB extends DBSchema {
  lecturas: {
    key: string;
    value: LecturaOffline;
    indexes: { 'by-vivienda': string };
  };
  sync_queue: {
    key: string;
    value: {
      id: string;
      type: 'lectura' | 'pago';
      data: unknown;
      created_at: string;
    };
  };
}

let db: IDBPDatabase<PortalesDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<PortalesDB>> {
  if (db) return db;
  
  try {
    db = await openDB<PortalesDB>('portales-offline', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('lecturas')) {
          const lecturaStore = database.createObjectStore('lecturas', { keyPath: 'offline_id' });
          lecturaStore.createIndex('by-vivienda', 'vivienda_id');
        }
        if (!database.objectStoreNames.contains('sync_queue')) {
          database.createObjectStore('sync_queue', { keyPath: 'id' });
        }
      },
    });
    console.log('IndexedDB initialized successfully');
    return db;
  } catch (error) {
    console.error('Error initializing IndexedDB:', error);
    throw new Error('No se pudo inicializar el almacenamiento offline');
  }
}

export async function saveLecturaOffline(lectura: LecturaOffline): Promise<void> {
  try {
    const database = await initDB();
    await database.put('lecturas', lectura);
    console.log('Lectura guardada offline:', lectura.offline_id);
  } catch (error) {
    console.error('Error guardando lectura offline:', error);
    throw error;
  }
}

export async function getLecturasOffline(): Promise<LecturaOffline[]> {
  try {
    const database = await initDB();
    return await database.getAll('lecturas');
  } catch (error) {
    console.error('Error obteniendo lecturas offline:', error);
    return [];
  }
}

export async function deleteLecturaOffline(offlineId: string): Promise<void> {
  try {
    const database = await initDB();
    await database.delete('lecturas', offlineId);
  } catch (error) {
    console.error('Error eliminando lectura offline:', error);
  }
}

export async function addToSyncQueue(type: 'lectura' | 'pago', data: unknown): Promise<void> {
  try {
    const database = await initDB();
    const queueId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await database.put('sync_queue', {
      id: queueId,
      type,
      data,
      created_at: new Date().toISOString(),
    });
    console.log('Agregado a cola de sincronización:', queueId);
  } catch (error) {
    console.error('Error agregando a cola de sincronización:', error);
    throw error;
  }
}

export async function getSyncQueue(): Promise<{ id: string; type: string; data: unknown; created_at: string }[]> {
  try {
    const database = await initDB();
    return await database.getAll('sync_queue');
  } catch (error) {
    console.error('Error obteniendo cola de sincronización:', error);
    return [];
  }
}

export async function clearSyncQueueItem(id: string): Promise<void> {
  try {
    const database = await initDB();
    await database.delete('sync_queue', id);
  } catch (error) {
    console.error('Error eliminando de cola de sincronización:', error);
  }
}

export async function hasPendingData(): Promise<boolean> {
  try {
    const database = await initDB();
    const lecturas = await database.count('lecturas');
    const queue = await database.count('sync_queue');
    return lecturas > 0 || queue > 0;
  } catch (error) {
    console.error('Error verificando datos pendientes:', error);
    return false;
  }
}