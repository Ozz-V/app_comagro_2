import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import PdfViewerModal from '../components/PdfViewerModal';
import { useOfflineSync } from '../contexts/OfflineSyncContext';

const LOGO = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };
const BUCKET = 'Fichas';
const CATEGORIAS = ['BOMBAS DE AGUA', 'SOLDADORES', 'GENERADORES', 'MOTORES ELECTRICOS', 'COMPRESORES'];

export default function FichasScreen({ navigation }) {
  const [allFiles, setAllFiles]       = useState({});
  const [catActual, setCatActual]     = useState('TODAS');
  const [busqueda, setBusqueda]       = useState('');
  const [cargando, setCargando]       = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState(null);
  const [abriendo, setAbriendo]       = useState(null);
  const [pdfModal, setPdfModal]       = useState({ visible: false, url: null, title: null });
  const { manifest, manifestReady, isOnline } = useOfflineSync();

  useEffect(() => { cargarTodo(); }, []);

  function onRefresh() {
    setRefreshing(true);
    cargarTodo(true);
  }

  async function cargarTodo(forzar = false) {
    if (!isOnline && !forzar) {
      try {
        const saved = await AsyncStorage.getItem('@fichas_cache');
        if (saved) {
          setAllFiles(JSON.parse(saved));
        } else {
          setError('No hay fichas guardadas. Conéctese a internet para descargar.');
        }
      } catch (e) {}
      setCargando(false);
      setRefreshing(false);
      return;
    }
    
    setCargando(true);
    setError(null);
    // 1. Mostrar caché primero (instantáneo)
    let tieneCache = false;
    try {
      const raw = await AsyncStorage.getItem('@fichas_cache');
      if (raw) {
        setAllFiles(JSON.parse(raw));
        setCargando(false);
        tieneCache = true;
      }
    } catch (_) {}

    // 2. Actualizar desde red en silencio
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return; // sin sesión, quedamos con caché

      const resultados = await Promise.all(
        CATEGORIAS.map(cat => fetchCategoria(cat, token))
      );

      const mapa = {};
      CATEGORIAS.forEach((cat, i) => { mapa[cat] = resultados[i]; });
      setAllFiles(mapa);
      await AsyncStorage.setItem('@fichas_cache', JSON.stringify(mapa));
    } catch (e) {
      if (!tieneCache) {
        setError(e.message || 'Error de conexión');
      }
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }

  async function fetchCategoria(cat, token) {
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
      .filter(f => f.name && f.name.toLowerCase().endsWith('.pdf'))
      .map(f => ({
        name:     f.name.replace(/\.pdf$/i, ''),
        fullName: f.name,
        size:     f.metadata?.size || 0,
        path:     `${cat}/${f.name}`,
        cat,
      }));
  }

  async function abrirFicha(path, nombre) {
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
        } catch (_) {}
      }

      // Online: obtener URL firmada con timeout de 4 segundos
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
      const fetchPromise = supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
      if (error || !data) throw new Error('No se pudo generar el enlace');
      
      setPdfModal({ visible: true, url: data.signedUrl, title: nombre || path });
    } catch (e) {
      if (e.message === 'timeout') {
        alert('Sin conexión. Descarga la ficha para usarla offline.');
      }
      // Otros errores se ignoran silenciosamente
    } finally {
      setAbriendo(null);
    }
  }

  function fmtSize(b) {
    if (!b) return '';
    if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.round(b / 1024) + ' KB';
  }

  // Lista de items a mostrar según filtros
  const listaFiltrada = React.useMemo(() => {
    const cats = catActual === 'TODAS' ? CATEGORIAS : [catActual];
    const q = busqueda.toLowerCase().trim();
    const items = [];
    cats.forEach(cat => {
      const files = allFiles[cat] || [];
      const filtrados = q ? files.filter(f => f.name.toLowerCase().includes(q)) : files;
      if (catActual === 'TODAS' && filtrados.length) {
        items.push({ type: 'label', key: `label-${cat}`, cat });
      }
      filtrados.forEach(f => items.push({ type: 'file', key: f.path, ...f }));
    });
    return items;
  }, [allFiles, catActual, busqueda]);

  function renderItem({ item }) {
    if (item.type === 'label') {
      return <Text style={styles.catLabel}>{item.cat}</Text>;
    }
    const cargandoEste = abriendo === item.path;
    const descargado = !!(manifest && manifest[item.path]);
    const offlineDisabled = !descargado && !isOnline;
    return (
      <TouchableOpacity
        style={[styles.fileItem, offlineDisabled && { opacity: 0.45 }]}
        onPress={() => (descargado || isOnline) ? abrirFicha(item.path, item.name) : null}
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
        {!descargado && item.size ? <Text style={[styles.fileSize, {marginLeft: 6}]}>{fmtSize(item.size)}</Text> : null}
        {cargandoEste
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
            source={require('../../assets/iso.json')}
            autoPlay
            loop={true}
            style={styles.logoAnimado}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={() => navigation.goBack()}>
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

      {/* Filtros de categoría */}
      <View style={styles.cats}>
        {['TODAS', ...CATEGORIAS].map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catBtn, catActual === cat && styles.catBtnActive]}
            onPress={() => { setCatActual(cat); setBusqueda(''); }}
          >
            <Text style={[styles.catBtnText, catActual === cat && styles.catBtnTextActive]}>
              {cat === 'TODAS' ? 'Todas' : cat === 'MOTORES ELECTRICOS' ? 'Mot. Eléctricos' : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {!isOnline ? 'No hay conexión. Conéctate a internet para cargar los datos por primera vez.' : error}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={cargarTodo}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : listaFiltrada.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>Sin fichas para esta búsqueda</Text>
        </View>
      ) : (
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

  // Categorías
  cats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  catBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    backgroundColor: COLORS.white,
  },
  catBtnActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  catBtnText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 12,
    color: COLORS.gray4,
  },
  catBtnTextActive: { color: COLORS.white },

  // Lista
  list: { paddingHorizontal: 16, paddingBottom: 100 },

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
