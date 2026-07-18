import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Platform, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import PdfViewerModal from '../components/PdfViewerModal';
import { useOfflineSync } from '../contexts/OfflineSyncContext';

const ANIMATION_ISO = require('../../assets/iso.json');


interface Ficha {
  name: string;
  fullName: string;
  size: number;
  path: string;
}

interface ListItem {
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

export default function FichasScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void; goBack: () => void; [key: string]: unknown } }) {
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
  const listaFiltrada = React.useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    const items: ListItem[] = [];

    if (catActual === 'TODAS' && !q) {
      categorias.forEach(cat => {
        items.push({ type: 'folder', key: `folder-${cat}`, cat });
      });
      return items;
    }

    const cats = catActual === 'TODAS' ? categorias : [catActual];
    cats.forEach(cat => {
      const files = allFiles[cat] || [];
      const filtrados = q ? files.filter(f => f.name.toLowerCase().includes(q)) : files;
      if (catActual === 'TODAS' && filtrados.length) {
        items.push({ type: 'label', key: `label-${cat}`, cat });
      }
      filtrados.forEach(f => items.push({ type: 'file', key: f.path, ...f }));
    });
    return items;
  }, [allFiles, catActual, busqueda, categorias]);

  function renderItem({ item }: { item: ListItem }) {
    if (item.type === 'folder') {
      return (
        <TouchableOpacity style={styles.folderBtn} onPress={() => { setCatActual(item.cat!); setBusqueda(''); }} activeOpacity={0.8}>
          <Text style={styles.folderBtnText}>{item.cat}</Text>
          <Text style={{ fontSize: 24, color: COLORS.gray4, marginTop: -4 }}>›</Text>
        </TouchableOpacity>
      );
    }
    if (item.type === 'label') {
      return <Text style={styles.catLabel}>{item.cat}</Text>;
    }
    const descargado = !!(manifest && item.path && manifest[item.path]);
    const offlineDisabled = !descargado && !isOnline;
    return (
      <TouchableOpacity
        style={[styles.fileItem, offlineDisabled && { opacity: 0.45 }]}
        onPress={() => (descargado || isOnline) && item.path ? abrirFicha(item.path, item.name || '') : null}
        disabled={!!abriendo || offlineDisabled}
        activeOpacity={0.7}
      >
        <View style={[styles.fileIcon, descargado && { backgroundColor: COLORS.green }]}>
          <Text style={[styles.fileBadge, descargado && { color: COLORS.white }]}>PDF</Text>
        </View>
        <Text style={[styles.fileName, offlineDisabled && { color: COLORS.gray4 }]} numberOfLines={2}>{item.name}</Text>
        {descargado
          ? <Text style={{ fontSize: 11, color: COLORS.green, fontFamily: FONTS.body, marginLeft: 4 }}>✓</Text>
          : (!isOnline ? null : <SvgIcon name="cloud" size={14} color={COLORS.navy} />)
        }
        {!descargado && item.size ? <Text style={[styles.fileSize, {marginLeft: 6}]}>{Math.round(item.size / 1024)} KB</Text> : null}
        {abriendo === item.path
          ? <ActivityIndicator size="small" color={COLORS.navy} />
          : null
        }
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <View style={styles.topbarHeader}>
          <LottieView
            source={ANIMATION_ISO}
            autoPlay
            loop={true}
            style={styles.logoAnimado}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={() => catActual !== 'TODAS' ? (setCatActual('TODAS'), setBusqueda('')) : navigation.goBack()}>
            <Text style={styles.btnVolver}>‹ Volver</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar ficha…"
            placeholderTextColor={COLORS.gray4}
            value={busqueda}
            onChangeText={setBusqueda}
          />
        </View>
      </View>
      <View style={styles.topBorder} />

      {/* Aviso de reconexión si no hay red */}
      {!isOnline && !cargando ? (
        <View style={{ backgroundColor: '#fdf2f2', paddingVertical: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: '#e74c3c', fontFamily: FONTS.body }}>Sin conexión. Tira de la lista hacia abajo para reconectar.</Text>
        </View>
      ) : null}

      {/* Contenido */}
      {cargando ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.navy} />
          <Text style={styles.centerText}>Cargando fichas…</Text>
        </View>
      ) : listaFiltrada.length > 0 ? (
        <FlatList
          data={listaFiltrada}
          renderItem={renderItem}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.navy]}
              tintColor={COLORS.navy}
            />
          }
        />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {!isOnline ? 'No hay conexión. Conéctate a internet para cargar los datos por primera vez.' : error}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => cargarTodo(true)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.centerText}>Sin fichas para esta búsqueda</Text>
        </View>
      )}

      <PdfViewerModal
        visible={pdfModal.visible}
        url={pdfModal.url}
        title={pdfModal.title}
        onClose={() => setPdfModal({ visible: false, url: null, title: null })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    gap: 12,
  },
  topbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: COLORS.white,
  },
  searchIcon: { fontSize: 13, marginRight: 8 },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.navy,
  },
  btnVolver: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.green,
  },

  // Lista
  list: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 16 },

  folderBtn: { 
    backgroundColor: COLORS.white, 
    padding: 20, 
    borderRadius: 12, 
    marginBottom: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 3, 
    borderWidth: 1, 
    borderColor: '#E8ECF0' 
  },
  folderBtnText: { 
    fontFamily: FONTS.heading, 
    fontSize: 16, 
    color: COLORS.navy, 
    fontWeight: '700' 
  },

  catLabel: {
    fontFamily: FONTS.bodySemi,
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.gray4,
    textTransform: 'uppercase',
    paddingTop: 18,
    paddingBottom: 8,
  },

  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray6,
  },
  fileIcon: {
    width: 32,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  fileBadge: {
    fontFamily: FONTS.bodySemi,
    fontSize: 8,
    color: '#cc2222',
    letterSpacing: 0.3,
  },
  fileName: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.navy,
    lineHeight: 18,
  },
  fileSize: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
  },

  // Estados
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  centerText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: 'red',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: COLORS.navy,
  },
  retryText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 14,
    color: COLORS.white,
  },
});
