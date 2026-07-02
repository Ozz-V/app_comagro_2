import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, EDGE_URL } from '../supabase';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { initDB, searchProducts, getUniqueBrands, getProductBySku, insertProductsBatch } from '../utils/database';

const CACHE_TIME_KEY = 'comagro_productos_fecha_v3';
const HORAS_VIGENCIA = 24;

export function useProducts() {
  const { manifest, isOnline } = useOfflineSync();
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bgActualiz, setBgActualiz] = useState(false);
  const [error, setError] = useState(null);
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
    } catch(e) {}
  }

  // Nueva función limpia para realizar búsquedas sin cierres de estado (stale closures)
  const fetchCatalog = useCallback(async (marcaFiltro, subcatFiltro, busqueda) => {
    try {
      const resultados = await searchProducts(marcaFiltro, subcatFiltro, busqueda);
      setProductosFiltrados(resultados);
      const m = await getUniqueBrands();
      setMarcas(m);
    } catch (e) {
      console.log('Error buscando en DB', String(e));
    }
  }, []);

  async function inicializar() {
    setCargando(true);
    try {
      try {
        await initDB();
      } catch (e) {
        console.log('initDB falló (posiblemente ya inicializado o ocupado)', e);
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
    } catch (err) {
      setError('Error iniciando base de datos');
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }

  async function sincronizarFondo(fechaCache) {
    try {
      let { data: { session } } = await supabase.auth.getSession();
      let accessToken = session?.access_token;
      if (!accessToken) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        accessToken = refreshed?.session?.access_token;
      }
      
      const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken || ''}` 
      };
      if (fechaCache) headers['X-Since'] = fechaCache;
      
      const res = await fetch(EDGE_URL, { headers });
      if (res.ok) {
        const nuevosRows = await res.json();
        if (nuevosRows && nuevosRows.length > 0) {
          const isDelta = !!fechaCache;
          await insertProductsBatch(nuevosRows, manifest, isDelta);
        }
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        
        // Solo actualizamos la llave del logo si la red fue exitosa
        const newKey = Date.now().toString();
        setLogoRefreshKey(newKey);
        AsyncStorage.setItem('@logo_refresh_key', newKey).catch(()=>{});
      }
    } catch (e) {
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

  async function getProductBySkuSafe(sku) {
    try {
      return await getProductBySku(sku);
    } catch (e) {
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
