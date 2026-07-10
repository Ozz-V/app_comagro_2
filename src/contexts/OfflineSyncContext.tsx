import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import NetInfo from '@react-native-community/netinfo';
import { supabase, EDGE_URL } from '../supabase';
import { initDB, insertProductsBatch } from '../utils/database';
import { ensureCatalogSynced } from '../services/catalogService';

export interface OfflineGroups {
  catalogos: boolean;
  fichas: boolean;
  productos: boolean;
}

export interface SyncProgress {
  current: number;
  total: number;
  currentItem: string;
}

export interface SyncAlert {
  title: string;
  message: string;
}

export interface OfflineSyncContextProps {
  isSyncing: boolean;
  isPaused: boolean;
  progress: SyncProgress;
  manifest: Record<string, string>;
  manifestReady: boolean;
  isOnline: boolean;
  syncAlert: SyncAlert | null;
  setSyncAlert: (alert: SyncAlert | null) => void;
  startSync: (groups: OfflineGroups) => Promise<void>;
  pauseSync: () => void;
  selectedGroups: OfflineGroups;
}

const OfflineSyncContext = createContext<OfflineSyncContextProps | undefined>(undefined);

export function useOfflineSync(): OfflineSyncContextProps {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within an OfflineSyncProvider');
  }
  return context;
}

const OFFLINE_DIR = FileSystem.documentDirectory + 'offline_cache/';
const CACHE_KEY_PRODUCTS = '@productos_cache';
const CACHE_TIME_KEY = '@productos_cache_time';
const MANIFEST_KEY = '@offline_manifest';

// Helpers
async function ensureDirExists() {
  const info = await FileSystem.getInfoAsync(OFFLINE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
  }
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  // state: { catalogos: boolean, fichas: boolean, productos: boolean } - if selected
  const [selectedGroups, setSelectedGroups] = useState<OfflineGroups>({ catalogos: false, fichas: false, productos: false });
  // isSyncing: boolean
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const [progress, setProgress] = useState<SyncProgress>({ current: 0, total: 0, currentItem: '' });
  const [manifest, setManifest] = useState<Record<string, string>>({});
  const [manifestReady, setManifestReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Nuevo estado para reemplazar Alert.alert con un modal UI propio
  const [syncAlert, setSyncAlert] = useState<SyncAlert | null>(null);

  const cancelFlag = useRef(false);
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;

  useEffect(() => {
    // Escuchar el estado de red globalmente
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected && state.isInternetReachable !== false);
    });

    loadManifest();
    ensureDirExists();

    return () => {
      unsubscribe();
    };
  }, []);

  // ─── AUTO-SYNC DEL CATÁLOGO ──────────────────────────────────────────────
  // Este es el disparador "de verdad" de la descarga del catálogo: arranca
  // solo, apenas hay sesión iniciada y conexión, SIN que el usuario tenga
  // que entrar nunca a la pantalla de "Todos los productos". Como este
  // Provider envuelve toda la app (ver App.tsx) y no se desmonta al
  // navegar entre pantallas, la sincronización sigue corriendo en segundo
  // plano pase lo que pase mientras la app siga abierta.
  //
  // ensureCatalogSynced() ya se encarga de no duplicar: si ya hay una
  // sincronización en curso (arrancada acá o desde useProducts), no
  // arranca otra.
  useEffect(() => {
    if (!isOnline) return;

    let cancelado = false;

    async function intentarAutoSync() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelado) return;
        await ensureCatalogSynced(manifestRef.current);
      } catch (e) {
        console.log('[OfflineSync] auto-sync de catálogo falló', e);
      }
    }

    intentarAutoSync();

    // También reintentar cada vez que cambia el estado de auth (por si el
    // login termina DESPUÉS de que este efecto corrió la primera vez).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) intentarAutoSync();
    });

    return () => {
      cancelado = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function loadManifest() {
    try {
      const raw = await AsyncStorage.getItem(MANIFEST_KEY);
      if (raw) setManifest(JSON.parse(raw));
    } catch (e) {}
    finally { setManifestReady(true); }
  }

  async function saveManifest(newManifest: Record<string, string>) {
    try {
      setManifest(newManifest);
      await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(newManifest));
    } catch (e) {}
  }

  // Comienza o reanuda la descarga
  async function startSync(groups: OfflineGroups) {
    if (isSyncing) return;
    setIsSyncing(true);
    setIsPaused(false);
    cancelFlag.current = false;
    setSelectedGroups(groups);
    
    const totalItems: any[] = [];
    let fetchedProducts = null;

    try {
      await ensureDirExists();
      const currentManifest = { ...manifest };

      // 0. Asegurar sesión activa antes de consultar Storage o la API
      let accessToken = null;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        accessToken = session.access_token;
      } else {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          accessToken = refreshed.session.access_token;
        }
      }
      if (!accessToken) {
        throw new Error('No hay sesión activa para descargar archivos. Por favor cierra y vuelve a iniciar sesión en la app.');
      }

      // 1. Obtener lista de Catálogos
      if (groups.catalogos) {
        const { data, error } = await supabase.storage.from('catalogos').list('', { limit: 1000 });
        if (error) throw new Error('Error listando catálogos: ' + error.message);
        if (data) {
          data.forEach(file => {
            if (file.name === '.emptyFolderPlaceholder') return;
            totalItems.push({ type: 'catalogo', name: file.name, bucket: 'catalogos' });
          });
        }
      }

      // 2. Obtener lista de Fichas
      if (groups.fichas) {
        const { data: folders, error: fError } = await supabase.storage.from('Fichas').list('', { limit: 100 });
        if (fError) throw new Error('Error listando carpetas de Fichas: ' + fError.message);
        if (folders) {
          for (const folder of folders) {
            if (folder.name === '.emptyFolderPlaceholder') continue;
            const { data: files } = await supabase.storage.from('Fichas').list(folder.name, { limit: 1000 });
            if (files) {
              files.forEach(file => {
                if (file.name === '.emptyFolderPlaceholder') return;
                totalItems.push({ type: 'ficha', name: file.name, path: `${folder.name}/${file.name}`, bucket: 'Fichas' });
              });
            }
          }
        }
      }

      // 3. Obtener Productos y sus imágenes
      if (groups.productos) {
        const headers = { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}` 
        };
        
        let offset = 0;
        const limit = 500;
        let hasMore = true;
        const todosNuevosRows: any[] = [];

        setProgress(prev => ({ ...prev, currentItem: 'Descargando catálogo...' }));

        while (hasMore) {
          if (cancelFlag.current) break;
          
          const url = new URL(EDGE_URL);
          url.searchParams.append('offset', offset.toString());
          url.searchParams.append('limit', limit.toString());

          const res = await fetch(url.toString(), { headers });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error('Error descargando lista de productos desde el servidor: ' + errText);
          }
          
          const pageRows = await res.json();
          if (pageRows && Array.isArray(pageRows) && pageRows.length > 0) {
            todosNuevosRows.push(...pageRows);
            if (pageRows.length < limit) {
              hasMore = false;
            } else {
              offset += limit;
            }
          } else {
            hasMore = false;
          }
        }
        
        const nuevosRows = todosNuevosRows;

        // 3.5. Obtener los "sales_pitch" para uso offline
        const { data: aiData } = await supabase.from('productos_ai_data').select('sku, sales_pitch');
        if (aiData) {
          const aiMap: Record<string, string> = {};
          aiData.forEach(r => aiMap[r.sku] = r.sales_pitch);
          nuevosRows.forEach((prod: any) => {
            const sku = String(prod.SKU || prod.sku).trim();
            prod.sales_pitch = aiMap[sku] || '';
          });
        }

        fetchedProducts = nuevosRows;

        nuevosRows.forEach((prod: any) => {
          const imgUrl = prod['imagen 1'] || prod.imagen;
          if (imgUrl) {
            totalItems.push({ type: 'imagen', name: prod.SKU + '.jpg', url: imgUrl });
          }
        });
      }

      // Filtrar los que ya están en el manifiesto
      const pendingItems = totalItems.filter(item => {
        const key = item.type === 'imagen' ? item.name : (item.path || item.name);
        return !currentManifest[key];
      });

      if (totalItems.length === 0) {
        console.log('[OfflineSync] totalItems=0. groups:', JSON.stringify(groups));
        const gruposNombres = [
          groups.catalogos ? 'Catálogos' : null,
          groups.fichas ? 'Fichas' : null,
          groups.productos ? 'Productos' : null,
        ].filter(Boolean).join(', ');
        setSyncAlert({
          title: 'Aviso',
          message: `No se encontraron archivos para: ${gruposNombres}.\n\nVerificá que los buckets en Supabase Storage tengan archivos y que los nombres coincidan exactamente ("catalogos" y "Fichas").`
        });
        return;
      }

      if (pendingItems.length === 0) {
        setSyncAlert({
          title: '¡Todo al día!',
          message: 'Todos los archivos que seleccionaste ya están descargados en tu dispositivo. Podés usar la app sin conexión tranquilamente.'
        });
        setProgress({ current: totalItems.length, total: totalItems.length, currentItem: '¡Todo al día!' });
        return;
      }

      setProgress({ current: totalItems.length - pendingItems.length, total: totalItems.length, currentItem: 'Iniciando...' });

      // Comenzar a descargar uno por uno
      let count = totalItems.length - pendingItems.length;

      for (const item of pendingItems) {
        if (cancelFlag.current) break; // Pause or cancel

        setProgress(prev => ({ ...prev, currentItem: item.name }));

        const key = item.type === 'imagen' ? item.name : (item.path || item.name);
        const safeName = key.replace(/[^a-zA-Z0-9._\-]/g, '_');
        const localUri = OFFLINE_DIR + safeName;

        try {
          if (item.type === 'imagen') {
            // Descargar imagen
            const tmpUri = OFFLINE_DIR + 'tmp_' + safeName;
            const res = await FileSystem.createDownloadResumable(item.url, tmpUri, {}).downloadAsync();
            if (res && res.uri) {
              // Redimensionar para ahorrar espacio
              const manip = await ImageManipulator.manipulateAsync(
                res.uri,
                [{ resize: { width: 500 } }],
                { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
              );
              // Mover al destino final
              await FileSystem.moveAsync({ from: manip.uri, to: localUri });
              // Borrar tmp original
              await FileSystem.deleteAsync(res.uri, { idempotent: true });
              
              currentManifest[key] = localUri;
            }
          } else {
            // Descargar PDF de Supabase
            // Primero conseguir URL firmada
            const pathToSign = item.path || item.name;
            const { data } = await supabase.storage.from(item.bucket).createSignedUrl(pathToSign, 60 * 60 * 24);
            if (data && data.signedUrl) {
              const safeSignedUrl = data.signedUrl.replace(/ /g, '%20');
              const res = await FileSystem.createDownloadResumable(safeSignedUrl, localUri, {}).downloadAsync();
              if (res && res.uri) {
                const info = await FileSystem.getInfoAsync(res.uri);
                if (info.exists && info.size > 0) {
                  currentManifest[key] = localUri;
                } else {
                  await FileSystem.deleteAsync(res.uri, { idempotent: true });
                }
              }
            }
          }

          // Guardar cada 5 items para no saturar AsyncStorage
          count++;
          if (count % 5 === 0) {
            await saveManifest(currentManifest);
          }
          setProgress(prev => ({ ...prev, current: count }));

        } catch (err) {
          console.log('Error descargando', item.name, err);
          // Continúa con el siguiente
        }
      }

      await saveManifest(currentManifest);

      if (fetchedProducts) {
        setProgress(prev => ({ ...prev, currentItem: 'Optimizando base de datos...' }));
        await initDB();
        await insertProductsBatch(fetchedProducts, currentManifest);
        fetchedProducts = null; // GARBAGE COLLECTION para evitar OutOfMemory crash
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      }

    } catch (e: any) {
      console.log('Error general sync', e);
      setSyncAlert({
        title: 'Error de descarga',
        message: e.message || String(e)
      });
    } finally {
      if (!cancelFlag.current) {
        setIsSyncing(false);
        setIsPaused(false);
      }
    }
  }

  function pauseSync() {
    cancelFlag.current = true;
    setIsSyncing(false);
    setIsPaused(true);
  }

  return (
    <OfflineSyncContext.Provider value={{
      isSyncing,
      isPaused,
      progress,
      manifest,
      manifestReady,
      isOnline,
      syncAlert,
      setSyncAlert,
      startSync,
      pauseSync,
      selectedGroups
    }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}
