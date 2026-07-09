import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, EDGE_URL } from '../supabase';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { initDB, searchProducts, getUniqueBrands, getProductBySku, insertProductsBatch } from '../utils/database';
import { ParsedProduct } from '../types';

const CACHE_TIME_KEY = 'comagro_productos_fecha_v3';
const HORAS_VIGENCIA = 24;

export function useProducts() {
  const { manifest, isOnline } = useOfflineSync();
  const [productosFiltrados, setProductosFiltrados] = useState<ParsedProduct[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bgActualiz, setBgActualiz] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoRefreshKey, setLogoRefreshKey] = useState('');
  const [dbVersion, setDbVersion] = useState(0);

  useEffect(() => {
    cargarLogoRefreshKey();
    inicializar();
  }, []);

  async function cargarLogoRefreshKey() {
    try {
      const savedKey = await AsyncStorage.getItem('@logo_refresh_key');
      if (savedKey) setLogoRefreshKey(savedKey);
    } catch(e: unknown) {}
  }

  // Nueva función limpia para realizar búsquedas sin cierres de estado (stale closures)
  const fetchCatalog = useCallback(async (marcaFiltro: string, subcatFiltro: string, busqueda: string) => {
    try {
      const resultados = await searchProducts(marcaFiltro, subcatFiltro, busqueda);
      setProductosFiltrados(resultados);
      const m = await getUniqueBrands();
      setMarcas(m);
    } catch (e: unknown) {
      console.log('Error buscando en DB', String(e));
    }
  }, []);

  async function inicializar() {
    setCargando(true);
    try {
      try {
        await initDB();
      } catch (e: unknown) {
        console.error('initDB falló críticamente', e);
        setError('Error crítico: La base de datos no pudo iniciar. Reinicie la aplicación.');
        setCargando(false);
        setRefreshing(false);
        return;
      }
      
      const m = await getUniqueBrands();
      setMarcas(m);
      setProductosFiltrados([]); // Inicia vacío hasta que se pida catálogo

      // Verificar si hay caché vigente
      const fechaCache = await AsyncStorage.getItem(CACHE_TIME_KEY);
      const cacheVigente = fechaCache && (Date.now() - parseInt(fechaCache)) < HORAS_VIGENCIA * 3600000;
      
      // Lanzar actualización en segundo plano
      if (!cacheVigente && isOnline) {
        setBgActualiz(true);
        sincronizarFondo(fechaCache);
      }
    } catch (err: unknown) {
      setError('Error iniciando base de datos');
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }

  async function sincronizarFondo(fechaCache: string | null) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let accessToken = session?.access_token;
      if (!accessToken) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        accessToken = refreshed?.session?.access_token;
      }
      
      const headers: any = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken || ''}` 
      };
      if (fechaCache) headers['X-Since'] = fechaCache;
      
      let page = 0;
      let hasMore = true;
      let totalNuevos = 0;

      while (hasMore) {
        const url = new URL(EDGE_URL);
        url.searchParams.append('page', page.toString());
        url.searchParams.append('limit', '500');

        const res = await fetch(url.toString(), { headers });
        if (!res.ok) {
           throw new Error(`HTTP Error: ${res.status}`);
        }
        
        const nuevosRows = await res.json();
        
        if (nuevosRows && Array.isArray(nuevosRows) && nuevosRows.length > 0) {
          const isDelta = !!fechaCache && page === 0; // Solo borrar tabla en la primera página si no es delta
          await insertProductsBatch(nuevosRows, manifest, isDelta || page > 0);
          totalNuevos += nuevosRows.length;
          
          if (nuevosRows.length < 500) {
             hasMore = false;
          } else {
             page++;
          }
        } else {
          hasMore = false;
        }
      }

      if (totalNuevos > 0 || !fechaCache) {
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        // Solo actualizamos la llave del logo si la red fue exitosa y hubo cambios (o fue primer sync)
        const newKey = Date.now().toString();
        setLogoRefreshKey(newKey);
        AsyncStorage.setItem('@logo_refresh_key', newKey).catch(()=>{});
      }
    } catch (e: unknown) {
      console.log('Fallo bgActualiz', e);
    } finally {
      setBgActualiz(false);
      // Tras terminar la actualización en segundo plano, recargamos las marcas
      // y subimos dbVersion para que la pantalla vuelva a pedir el catálogo
      const m = await getUniqueBrands();
      setMarcas(m);
      setDbVersion(v => v + 1);
    }
  }

  async function getProductBySkuSafe(sku: string) {
    try {
      return await getProductBySku(sku);
    } catch (e: unknown) {
      return null;
    }
  }

  function onRefresh() {
    if (!isOnline) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    
    AsyncStorage.removeItem(CACHE_TIME_KEY).then(() => {
      inicializar();
    });
  }

  return {
    productosFiltrados,
    marcas,
    cargando,
    refreshing,
    bgActualiz,
    error,
    logoRefreshKey,
    onRefresh,
    getProductBySkuSafe,
    fetchCatalog,
    dbVersion
  };
}
