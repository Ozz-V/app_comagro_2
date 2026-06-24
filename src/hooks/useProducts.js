import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, EDGE_URL } from '../supabase';
import { useOfflineSync } from '../contexts/OfflineSyncContext';

const CACHE_KEY      = 'comagro_productos_v3';
const CACHE_TIME_KEY = 'comagro_productos_fecha_v3';
const HORAS_VIGENCIA = 4;

const COLS_EXCLUIDAS = new Set([
  'SKU','imagen 1','imagen 2','imagen 3','imagen 4','imagen 5',
  'Brand','Marca','id','ID','Tipo de Producto','Categoria Magento',
  'url_key','visibility','status','price','Precio',
]);

function esColumnaPermitida(col) {
  return !COLS_EXCLUIDAS.has(col) && !col.startsWith('_');
}

function esValorValido(val) {
  if (val === null || val === undefined || val === '') return false;
  const s = String(val).trim().toLowerCase();
  if (s.length === 0) return false;
  if (/^0([.,]0+)?$/.test(s)) return false;
  const basura = ['n/a','na','n.a','n.a.','no aplica','sin dato','sin datos',
    'no','no tiene','no disponible','pim','-','--','---','st','sin información',
    'no corresponde','sin especificar','sin info'];
  if (basura.includes(s)) return false;
  return true;
}

export function useProducts() {
  const { manifest, isOnline } = useOfflineSync();
  const [allProducts, setAllProducts] = useState([]);
  const [marcas, setMarcas]           = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [bgActualiz, setBgActualiz]   = useState(false);
  const [error, setError]             = useState(null);
  const [logoRefreshKey, setLogoRefreshKey] = useState('');

  useEffect(() => {
    cargarLogoRefreshKey();
    cargarDatos(false);
  }, []);

  async function cargarLogoRefreshKey() {
    try {
      const savedKey = await AsyncStorage.getItem('@logo_refresh_key');
      if (savedKey) setLogoRefreshKey(savedKey);
    } catch(e) {}
  }

  function procesarDatos(rows) {
    const productos = rows.map(row => {
      const imagen = (row['imagen 1'] || '').toString().trim();
      if (!imagen || !/^https?:\/\//i.test(imagen)) return null;
      const marca = (row['Brand'] || row['Marca'] || '').toString().trim().toUpperCase();
      if (!marca) return null;
      const subcategoria = (row['Tipo de Producto'] || row['Categoria Magento'] || 'General').toString().trim().toUpperCase();
      const specs = [];
      for (const [col, val] of Object.entries(row)) {
        if (esColumnaPermitida(col) && esValorValido(val)) specs.push([col, String(val).trim()]);
      }
      return { modelo: (row['SKU'] || '').toString().trim(), marca, subcategoria, imagen, specs };
    }).filter(p => p && p.modelo);

    setAllProducts(productos);
    setMarcas([...new Set(productos.map(p => p.marca))].sort());
    return productos;
  }

  async function cargarDatos(forzar = false) {
    setError(null);
    let rawCacheado = null;
    let fechaCache = null;

    try {
      rawCacheado = await AsyncStorage.getItem(CACHE_KEY);
      if (rawCacheado) {
        try { 
          const parsed = JSON.parse(rawCacheado).map(p => ({
            ...p,
            imagenOriginal: p.imagenOriginal || p.imagen,
            imagen: (manifest && p.SKU && manifest[p.SKU + '.jpg']) || p.imagenOriginal || p.imagen
          }));
          procesarDatos(parsed); 
        } catch (_) {}
      }
      fechaCache  = await AsyncStorage.getItem(CACHE_TIME_KEY);
    } catch (_) {}

    if (rawCacheado) {
      setCargando(false);
      const cacheVigente = fechaCache && (Date.now() - parseInt(fechaCache)) < HORAS_VIGENCIA * 3600000;
      if (cacheVigente && !forzar) {
        setRefreshing(false);
        return;
      }
      setBgActualiz(true);
    } else {
      setCargando(true);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token || ''}` };

      if (fechaCache && !forzar) {
        headers['X-Since'] = fechaCache;
      }

      const res = await fetch(EDGE_URL, { headers });
      if (!res.ok) throw new Error(await res.text() || 'Error en conexión');
      const nuevosRows = await res.json();

      let rowsBase = [];
      if (rawCacheado) {
        try { rowsBase = JSON.parse(rawCacheado); } catch (_) {}
      }

      const mapa = {};
      rowsBase.forEach(r => { if (r.SKU) mapa[r.SKU] = r; });
      nuevosRows.forEach(r => { if (r.SKU) mapa[r.SKU] = r; });

      const merged = Object.values(mapa).map(p => ({
        ...p,
        imagenOriginal: p.imagenOriginal || p.imagen,
        imagen: (manifest && p.SKU && manifest[p.SKU + '.jpg']) || p.imagenOriginal || p.imagen
      }));

      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      } catch (_) {}

      const procesadosFinal = procesarDatos(merged);
      return procesadosFinal;
    } catch (e) {
      if (!rawCacheado) setError(e.message || 'Error desconocido');
    } finally {
      setCargando(false);
      setRefreshing(false);
      setBgActualiz(false);
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
    cargarDatos(true);
  }

  return {
    allProducts,
    marcas,
    cargando,
    refreshing,
    bgActualiz,
    error,
    logoRefreshKey,
    cargarDatos,
    onRefresh
  };
}
