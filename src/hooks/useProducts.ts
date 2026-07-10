import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { initDB, searchProducts, getUniqueBrands, getProductBySku } from '../utils/database';
import { ensureCatalogSynced, subscribeToCatalogUpdates, isCatalogSyncing } from '../services/catalogService';
import { ParsedProduct } from '../types';

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

  useEffect(() => {
    isMounted.current = true;
    cargarLogoRefreshKey();
    inicializar();

    // Esta pantalla NO decide cuándo sincronizar — solo escucha. La
    // sincronización del catálogo puede haber arrancado en el inicio de
    // la app (ver OfflineSyncContext), antes incluso de que el usuario
    // entre acá. Nos suscribimos para reflejar el progreso en tiempo real
    // sin importar quién la haya disparado.
    const unsubscribe = subscribeToCatalogUpdates(async () => {
      if (!isMounted.current) return;
      try {
        const m = await getUniqueBrands();
        if (isMounted.current) {
          setMarcas(m);
          setDbVersion(v => v + 1);
          setBgActualiz(isCatalogSyncing());
        }
      } catch (e: unknown) {
        console.log('Error refrescando marcas tras sync', e);
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, []);

  async function cargarLogoRefreshKey() {
    try {
      const savedKey = await AsyncStorage.getItem('@logo_refresh_key');
      if (savedKey) setLogoRefreshKey(savedKey);
    } catch (e: unknown) {}
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

      // Mostramos lo que YA esté en SQLite de entrada. Si el auto-sync del
      // arranque de la app (OfflineSyncContext) ya venía corriendo o ya
      // terminó, acá aparece de una — no hace falta esperar nada.
      const m = await getUniqueBrands();
      setMarcas(m);
      setProductosFiltrados([]); // Inicia vacío hasta que se pida catálogo
      setBgActualiz(isCatalogSyncing());

      // Por si esta pantalla es la primera parte de la app en montarse (o
      // el auto-sync del arranque no pudo correr por algún motivo, p.ej.
      // no había sesión todavía), esto también lo puede disparar. Si ya
      // hay uno en curso, ensureCatalogSynced() no arranca uno nuevo —
      // se engancha al mismo, no duplica descargas.
      if (isOnline) {
        ensureCatalogSynced(manifest)
          .then((result) => {
            if (result?.logoRefreshKey && isMounted.current) {
              setLogoRefreshKey(result.logoRefreshKey);
            }
          })
          .catch((e) => console.log('Fallo sincronización de catálogo', e));
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
    setBgActualiz(true);
    try {
      // skipVigenciaCheck: true → pull-to-refresh manual siempre consulta
      // ahora mismo, pero sigue siendo delta (solo lo nuevo) si ya existe
      // un timestamp de sync previo.
      const result = await ensureCatalogSynced(manifest, { skipVigenciaCheck: true });
      if (result?.logoRefreshKey && isMounted.current) {
        setLogoRefreshKey(result.logoRefreshKey);
      }
      const m = await getUniqueBrands();
      if (isMounted.current) setMarcas(m);
    } catch (e: unknown) {
      console.log('Error en onRefresh', e);
    } finally {
      if (isMounted.current) {
        setRefreshing(false);
        setBgActualiz(false);
      }
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
