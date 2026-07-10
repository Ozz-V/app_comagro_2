import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { initDB, searchProducts, getUniqueBrands, getProductBySku } from '../utils/database';
import { syncCatalog } from '../services/catalogService';
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

  const isMounted = useRef(true);
  const syncTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMounted.current = true;
    cargarLogoRefreshKey();
    inicializar();

    return () => {
      isMounted.current = false;
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
      }
    };
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
        setError('La base de datos local está corrupta o no pudo iniciarse. La aplicación no funcionará correctamente. Intente reiniciar su dispositivo o reinstalar la app.');
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
        if (isMounted.current) setBgActualiz(true);
        syncTimer.current = setTimeout(() => {
          sincronizarFondo(fechaCache);
        }, 1500);
      }
    } catch (err: unknown) {
      if (isMounted.current) setError('Error iniciando base de datos');
    } finally {
      if (isMounted.current) {
        setCargando(false);
        setRefreshing(false);
      }
    }
  }

  async function sincronizarFondo(fechaCache: string | null) {
    try {
      const result = await syncCatalog(fechaCache, manifest);

      if (result.logoRefreshKey && isMounted.current) {
        setLogoRefreshKey(result.logoRefreshKey);
      }
    } catch (e: unknown) {
      console.log('Fallo bgActualiz', e);
    } finally {
      if (isMounted.current) {
        setBgActualiz(false);
      }
      const m = await getUniqueBrands();
      if (isMounted.current) {
        setMarcas(m);
        setDbVersion(v => v + 1);
      }
    }
  }

  async function getProductBySkuSafe(sku: string) {
    try {
      return await getProductBySku(sku);
    } catch (e: unknown) {
      return null;
    }
  }

  async function onRefresh() {
    if (!isOnline) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const fechaCache = await AsyncStorage.getItem(CACHE_TIME_KEY);
      setBgActualiz(true);
      await sincronizarFondo(fechaCache);
    } catch (e: unknown) {
      console.log('Error en onRefresh', e);
    } finally {
      setRefreshing(false);
    }
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
