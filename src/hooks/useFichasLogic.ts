import { useEffect, useState, useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../supabase';
import { useOfflineSync } from '../contexts/OfflineSyncContext';

export interface Ficha {
  name: string;
  fullName: string;
  size: number;
  path: string;
}

export interface ListItem {
  type: 'folder' | 'label' | 'item' | 'file';
  key: string;
  cat?: string;
  path?: string;
  name?: string;
  label?: string;
  size?: number;
}

const LOGO = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };
const BUCKET = 'Fichas';



export function useFichasLogic() {
  const [allFiles, setAllFiles]       = useState<Record<string, Ficha[]>>({});
  const [categorias, setCategorias]   = useState<string[]>([]);
  const [catActual, setCatActual]     = useState('TODAS');
  const [busqueda, setBusqueda]       = useState('');
  const [cargando, setCargando]       = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [abriendo, setAbriendo]       = useState<string | null>(null);
  const [pdfModal, setPdfModal]       = useState<{ visible: boolean; url: string | null; title: string | null }>({ visible: false, url: null, title: null });
  const { manifest, manifestReady, isOnline } = useOfflineSync();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (catActual !== 'TODAS') {
          setCatActual('TODAS');
          setBusqueda('');
          return true; // prevent default behavior
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [catActual])
  );

  useEffect(() => { cargarTodo(); }, []);

  function onRefresh() {
    if (!isOnline) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    cargarTodo(true);
  }

  async function cargarTodo(forzar: boolean = false) {
    if (!isOnline && !forzar) {
      try {
        const savedFiles = await AsyncStorage.getItem('@fichas_cache');
        const savedCats = await AsyncStorage.getItem('@fichas_categorias_cache');
        if (savedFiles && savedCats) {
          setAllFiles(JSON.parse(savedFiles));
          setCategorias(JSON.parse(savedCats));
        } else {
          setError('No hay fichas guardadas. Conéctese a internet para descargar.');
        }
      } catch (_e: unknown) {
        // Cache read failed — user will see the error state set above
      }
      setCargando(false);
      setRefreshing(false);
      return;
    }
    
    setCargando(true);
    setError(null);
    // 1. Mostrar caché primero (instantáneo)
    let tieneCache = false;
    try {
      const rawFiles = await AsyncStorage.getItem('@fichas_cache');
      const rawCats = await AsyncStorage.getItem('@fichas_categorias_cache');
      if (rawFiles && rawCats) {
        setAllFiles(JSON.parse(rawFiles));
        setCategorias(JSON.parse(rawCats));
        setCargando(false);
        tieneCache = true;
      }
    } catch (_: unknown) {}

    // 2. Actualizar desde red en silencio
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return; // sin sesión, quedamos con caché

      const rootRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ prefix: '', limit: 100, offset: 0 }),
      });
      if (!rootRes.ok) throw new Error('Error listando carpetas');
      const rootList = await rootRes.json();
      
      const dynamicCategories = (rootList || [])
        .filter((i: any) => !i.id && !i.metadata)
        .map((i: any) => i.name)
        .filter((n: string) => n && n !== '.emptyFolderPlaceholder');
      
      setCategorias(dynamicCategories);
      await AsyncStorage.setItem('@fichas_categorias_cache', JSON.stringify(dynamicCategories));

      const resultados = await Promise.all(
        dynamicCategories.map((cat: string) => fetchCategoria(cat, token))
      );

      const mapa: Record<string, Ficha[]> = {};
      dynamicCategories.forEach((cat: string, i: number) => { mapa[cat] = resultados[i]; });
      setAllFiles(mapa);
      await AsyncStorage.setItem('@fichas_cache', JSON.stringify(mapa));
    } catch (e: unknown) {
      if (!tieneCache) {
        setError((e as Error)?.message || 'Error de conexión');
      }
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }

  async function fetchCategoria(cat: string, token: string): Promise<Ficha[]> {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ prefix: cat + '/', limit: 1000, offset: 0 }),
    });
    if (!res.ok) throw new Error(`Error cargando ${cat}`);
    const files = await res.json();
    return (files || [])
      .filter((f: { name: string }) => f.name && f.name.toLowerCase().endsWith('.pdf'))
      .map((f: { name: string; metadata?: { size: number } }) => ({
        name:     f.name.replace(/\.pdf$/i, ''),
        fullName: f.name,
        size:     f.metadata?.size || 0,
        path:     `${cat}/${f.name}`,
        cat,
      }));
  }

  async function abrirFicha(path: string, nombre: string) {
    setAbriendo(path);
    try {
      // Buscar en manifest (ya cargado de AsyncStorage por el contexto)
      const localUri = manifest[path];
      if (localUri) {
        setPdfModal({ visible: true, url: localUri, title: nombre || path });
        return;
      }

      // Si el manifest aun no cargó del todo, leerlo directamente de AsyncStorage
      if (!manifestReady) {
        try {
          const raw = await AsyncStorage.getItem('@offline_manifest');
          if (raw) {
            const m = JSON.parse(raw);
            if (m[path]) {
              setPdfModal({ visible: true, url: m[path], title: nombre || path });
              return;
            }
          }
        } catch (_: unknown) {}
      }

      // Online: obtener URL firmada con timeout de 4 segundos
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
      const fetchPromise = supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      
      const { data, error } = (await Promise.race([fetchPromise, timeoutPromise])) as { data?: { signedUrl: string }, error?: unknown };
      if (error || !data) throw new Error('No se pudo generar el enlace');
      
      setPdfModal({ visible: true, url: data.signedUrl, title: nombre || path });
    } catch (e: unknown) {
      if ((e as Error).message === 'timeout') {
        alert('Sin conexión. Descarga la ficha para usarla offline.');
      }
      // Otros errores se ignoran silenciosamente
    } finally {
      setAbriendo(null);
    }
  }

  function fmtSize(b: number) {
    if (!b) return '';
    if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.round(b / 1024) + ' KB';
  }

  // Lista de items a mostrar según filtros

  return {
    allFiles, setAllFiles, categorias, setCategorias, catActual, setCatActual,
    busqueda, setBusqueda, cargando, setCargando, refreshing, setRefreshing,
    error, setError, abriendo, setAbriendo, pdfModal, setPdfModal,
    manifest, manifestReady, isOnline, onRefresh, cargarTodo, abrirFicha
  };
}
