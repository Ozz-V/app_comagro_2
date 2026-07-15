import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
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

  const cargarLogoRefreshKey = useCallback(async () => {
    try {
      const savedKey = await AsyncStorage.getItem('@logo_refresh_key');
      if (savedKey) setLogoRefreshKey(savedKey);
    } catch (e: unknown) {
      // Silently handle errors
    }
  }, []);

  const inicializar = useCallback(async () => {
    setCargando(true);
    try {
      try {
        await initDB();
      } catch (e: unknown) {
        // Si initDB() llega hasta acá es porque YA intentó reparar la base
        // sola (borrar y recrear) y aun así falló — algo más serio pasa
        // (ej. sin espacio de almacenamiento, o permisos del sistema de
        // archivos), y ahí sí es correcto avisarle al usuario.
        console.error('initDB falló incluso tras intentar reparar la base local', e);
        Sentry.captureException(e, { tags: { context: 'initDB_fatal' } });
        setError('No se pudo iniciar el catálogo local. Verifique que tenga espacio de almacenamiento libre y vuelva a intentar. Si persiste, reinicie su dispositivo.');
        setCargando(false);
        setRefreshing(false);
        return;
      }

      // Mostramos lo que YA est�� en SQLite de entrada. Si el auto-sync del
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
          .catch((e) => {
            Sentry.captureException(e);
            Sentry.captureException(e, { tags: { context: 'ensureCatalogSynced_background' } });
          });
      }
    } catch (err: unknown) {
      if (isMounted.current) setError('Error iniciando base de datos');
    } finally {
      if (isMounted.current) {
        setCargando(false);
        setRefreshing(false);
      }
    }
  }, [isOnline, manifest]);

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
        Sentry.captureException(e);
      }
    });

    return () => {
      isMounted.current = false;

      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [cargarLogoRefreshKey, inicializar]);

  // Guard contra respuestas fuera de orden: cuando el filtro "Productos"/"Accesorios"
  // está activo, la consulta SQL es más pesada (escanea search_text con varios LIKE),
  // por lo que tarda más que la de "Todos". Si el usuario sigue escribiendo, cada
  // letra dispara una nueva búsqueda async y, sin este guard, una respuesta vieja
  // puede llegar DESPUÉS que una más nueva y pisar el resultado correcto — dando la
  // sensación de que "el buscador no funciona" solo en Productos/Accesorios.
  const searchSeq = useRef(0);

  // Nueva función limpia para realizar búsquedas sin cierres de estado (stale closures)
  const fetchCatalog = useCallback(async (marcaFiltro: string, subcatFiltro: string, busqueda: string) => {
    const mySeq = ++searchSeq.current;
    try {
      const resultados = await searchProducts(marcaFiltro, subcatFiltro, busqueda);
      if (mySeq !== searchSeq.current) return; // Llegó una búsqueda más reciente antes: descartar esta respuesta obsoleta
      setProductosFiltrados(resultados);
      const m = await getUniqueBrands();
      if (mySeq !== searchSeq.current) return;
      setMarcas(m);
    } catch (e: unknown) {
      console.log('Error buscando en DB', String(e));
    }
  }, []);

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
      Sentry.captureException(e);
      Sentry.captureException(e, { tags: { context: 'onRefresh' } });
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
