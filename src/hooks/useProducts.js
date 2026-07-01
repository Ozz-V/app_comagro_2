import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, EDGE_URL } from '../supabase';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { initDB, searchProducts, getUniqueBrands, getProductBySku, insertProductsBatch } from '../utils/database';

const CACHE_TIME_KEY = 'comagro_productos_fecha_v3';
const HORAS_VIGENCIA = 4;

export function useProducts(filtroMarca = '', filtroSubcategoria = '', busqueda = '') {
  const { manifest, isOnline } = useOfflineSync();
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [marcas, setMarcas]           = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [bgActualiz, setBgActualiz]   = useState(false);
  const [error, setError]             = useState(null);
  const [logoRefreshKey, setLogoRefreshKey] = useState('');

  useEffect(() => {
    cargarLogoRefreshKey();
    inicializarYBuscar();
  }, []);

  // Efecto para buscar en SQLite cuando cambian los filtros
  useEffect(() => {
    if (!cargando) {
      realizarBusquedaDB();
    }
  }, [filtroMarca, filtroSubcategoria, busqueda]);

  async function cargarLogoRefreshKey() {
    try {
      const savedKey = await AsyncStorage.getItem('@logo_refresh_key');
      if (savedKey) setLogoRefreshKey(savedKey);
    } catch(e) {}
  }

  async function realizarBusquedaDB() {
    try {
      const resultados = await searchProducts(filtroMarca, filtroSubcategoria, busqueda);
      setProductosFiltrados(resultados);
      const m = await getUniqueBrands();
      setMarcas(m);
    } catch (e) {
      console.log('Error buscando en DB', e);
    }
  }

  async function inicializarYBuscar() {
    setCargando(true);
    try {
      try {
        await initDB();
      } catch (e) {
        console.log('initDB falló (posiblemente ya inicializado o ocupado)', e);
      }
      
      // Verificar si hay caché vigente
      const fechaCache = await AsyncStorage.getItem(CACHE_TIME_KEY);
      const cacheVigente = fechaCache && (Date.now() - parseInt(fechaCache)) < HORAS_VIGENCIA * 3600000;
      
      // Lanzar actualización en segundo plano de forma verdaderamente asíncrona (sin await bloqueante)
      if (!cacheVigente && isOnline) {
        (async () => {
          setBgActualiz(true);
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
                const isDelta = !!fechaCache; // Si enviamos X-Since, recibimos Delta (no borrar DB)
                await insertProductsBatch(nuevosRows, manifest, isDelta);
                
                // Actualizar la vista automáticamente si llegaron cosas nuevas
                realizarBusquedaDB();
              }
              // Siempre actualizamos el reloj si el servidor respondió bien, aunque no haya cambios
              await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
            }
          } catch (e) {
            console.log('Fallo bgActualiz', e);
          } finally {
            setBgActualiz(false);
          }
        })();
      }
      
      await realizarBusquedaDB();
    } catch (err) {
      setError('Error iniciando base de datos');
    } finally {
      setCargando(false);
      setRefreshing(false);
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
    const newKey = Date.now().toString();
    setLogoRefreshKey(newKey);
    AsyncStorage.setItem('@logo_refresh_key', newKey).catch(()=>{});
    
    // Forzar actualización borrando fecha de caché temporalmente
    AsyncStorage.removeItem(CACHE_TIME_KEY).then(() => {
      inicializarYBuscar();
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
    getProductBySkuSafe
  };
}
