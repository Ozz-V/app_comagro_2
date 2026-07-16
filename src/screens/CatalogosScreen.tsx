import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar,
  ActivityIndicator, useWindowDimensions, RefreshControl, Platform,
} from 'react-native';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import PdfViewerModal from '../components/PdfViewerModal';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { APP_CONSTANTS } from '../config/constants';

const LOGO        = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };
const BUCKET      = 'catalogos';
const LOGO_BASE   = APP_CONSTANTS.LOGO_BASE_PNG;

// Caché AsyncStorage — lista de catálogos (se invalida solo si hay cambios en Supabase)
const CACHE_KEY      = 'comagro_catalogos_v1';
const CACHE_TIME_KEY = 'comagro_catalogos_fecha_v1';
const HORAS_VIGENCIA = 2; // lista de catálogos cambia menos frecuente

export default function CatalogosScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void; goBack: () => void; [key: string]: unknown } }) {
  const [catalogos, setCatalogos] = useState<{ archivo: string; label: string; logo: string; [key: string]: unknown }[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [abriendo, setAbriendo]   = useState<string | null>(null);
  const [pdfModal, setPdfModal]   = useState<{ visible: boolean; url: string | null; title: string | null }>({ visible: false, url: null, title: null });
  const { manifest, manifestReady, isOnline } = useOfflineSync();

  const { width } = useWindowDimensions();
  const cardW = (width - 48 - 16) / 2;

  useEffect(() => { cargarCatalogos(false); }, []);

  function onRefresh() {
    if (!isOnline) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    cargarCatalogos(true);
  }

  // ─── CARGA DESDE SUPABASE CON CACHÉ ──────────────────────────────
  async function cargarCatalogos(forzar: boolean = false) {
    if (!isOnline && !forzar) {
      try {
        const saved = await AsyncStorage.getItem(CACHE_KEY);
        if (saved) {
          setCatalogos(JSON.parse(saved));
        } else {
          setError('No hay catálogos guardados. Conéctese a internet para descargar.');
        }
      } catch (e) {}
      setCargando(false);
      setRefreshing(false);
      return;
    }

    setError(null);

    // 1. Mostrar caché primero (instantáneo, funciona offline)
    let tieneCache = false;
    if (!forzar) {
      try {
        const saved = await AsyncStorage.getItem(CACHE_KEY);
        if (saved) {
          setCatalogos(JSON.parse(saved));
          setCargando(false);
          tieneCache = true;
        }
      } catch (_) {}
    }

    // 2. Actualizar desde red en silencio (si hay caché, no mostramos spinner)
    if (!tieneCache) setCargando(true);
    try {
      const { data: files, error: sbError } = await supabase
        .storage
        .from('catalogos')
        .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

      if (sbError) throw new Error(sbError.message);

      const lista = (files || [])
        .filter(f => f.name && f.name.toLowerCase().endsWith('.pdf'))
        .map(f => {
          // Extrae el nombre sin la extensión (ej. "jasic.pdf" -> "jasic")
          const baseName = f.name.substring(0, f.name.lastIndexOf('.'));
          
          let brandName = '';
          let displayName = '';

          // Si el nombre tiene un guión (ej: "jasic-Equipos_de_Soldadura.pdf")
          if (baseName.includes('-')) {
            const parts = baseName.split('-');
            brandName = parts[0].trim().toUpperCase();
            // Reemplaza guiones bajos por espacios para mostrarlo bonito en la app
            displayName = parts.slice(1).join('-').replace(/_/g, ' ').trim();
          } else {
            // Comportamiento por defecto (ej: "jasic.pdf")
            brandName = baseName.toUpperCase();
            displayName = brandName.replace(/_/g, ' ');
          }
          
          return {
            archivo: f.name,
            logo: brandName,
            label: displayName,
            orden: displayName
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(lista));
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      } catch (_) {}

      setCatalogos(lista);
    } catch (e: unknown) {
      if (!tieneCache) {
        // Solo mostrar error si tampoco teníamos caché
        try {
          const saved = await AsyncStorage.getItem(CACHE_KEY);
          if (saved) { setCatalogos(JSON.parse(saved)); }
          else { setError((e as Error)?.message || 'Error al cargar catálogos'); }
        } catch (_) { setError((e as Error)?.message || 'Error al cargar catálogos'); }
      }
      // Si teníamos caché, falla silenciosa (ya se muestra el contenido)
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }

  async function abrirCatalogo(archivo: string, label: string) {
    setAbriendo(archivo);
    try {
      // Buscar en manifest (ya cargado de AsyncStorage por el contexto)
      const localUri = manifest[archivo];
      if (localUri) {
        setPdfModal({ visible: true, url: localUri, title: label || archivo });
        return;
      }

      // Si el manifest aun no cargó del todo, leer directamente de AsyncStorage
      if (!manifestReady) {
        try {
          const raw = await AsyncStorage.getItem('@offline_manifest');
          if (raw) {
            const m = JSON.parse(raw);
            if (m[archivo]) {
              setPdfModal({ visible: true, url: m[archivo], title: label || archivo });
              return;
            }
          }
        } catch (_) {}
      }

      // Online: obtener URL firmada con timeout de 4 segundos
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
      const fetchPromise = supabase.storage.from(BUCKET).createSignedUrl(archivo, 300);
      
      const { data, error } = (await Promise.race([fetchPromise, timeoutPromise])) as { data?: { signedUrl: string }, error?: unknown };
      if (error || !data) throw new Error('No se pudo generar el enlace');
      setPdfModal({ visible: true, url: data.signedUrl, title: label || archivo });
    } catch (e: unknown) {
      if ((e as Error)?.message === 'timeout') {
        alert('Sin conexión. Descarga el catálogo para usarlo offline.');
      }
      // silently handled otherwise
    } finally {
      setAbriendo(null);
    }
  }

  const renderCard = ({ item }: { item: { archivo: string; label: string; logo: string; [key: string]: unknown } }) => {
    const cargandoEste = abriendo === item.archivo;
    const logoUri = `${LOGO_BASE}${item.logo}.png`;
    const descargado = !!(manifest && manifest[item.archivo]);
    const offlineDisabled = !descargado && !isOnline;

    return (
      <TouchableOpacity
        style={[styles.card, { width: cardW }, offlineDisabled && { opacity: 0.45 }]}
        activeOpacity={0.8}
        onPress={() => (descargado || isOnline) ? abrirCatalogo(item.archivo, item.label) : null}
        disabled={!!abriendo || offlineDisabled}
      >
        <View style={styles.cardImgWrap}>
          {cargandoEste ? (
            <ActivityIndicator size="small" color={COLORS.navy} />
          ) : (
            <Image
              source={{ uri: logoUri }}
              style={styles.cardLogo}
              resizeMode="contain"
            />
          )}
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardLabel} numberOfLines={2}>
            {item.label}
            {descargado ? ' ✓' : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
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
      <View style={styles.topBorder} />

      {/* Aviso de reconexión si no hay red */}
      {!isOnline && !cargando ? (
        <View style={{ backgroundColor: '#fdf2f2', paddingVertical: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: '#e74c3c', fontFamily: FONTS.body }}>Sin conexión. Tira de la lista hacia abajo para reconectar.</Text>
        </View>
      ) : null}

      {cargando ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.navy} />
          <Text style={styles.centerText}>Cargando catálogos…</Text>
        </View>
      ) : catalogos.length > 0 ? (
        <FlatList
          data={catalogos}
          renderItem={renderCard}
          keyExtractor={item => item.archivo}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={
            <Text style={styles.titulo}>
              Descargá nuestros{'\n'}<Text style={styles.tituloSpan}>Catálogos</Text>
            </Text>
          }
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
          <TouchableOpacity style={styles.retryBtn} onPress={() => cargarCatalogos(true)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.centerText}>No hay catálogos disponibles</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  btnVolver: {
    fontFamily: FONTS.body, fontSize: 16,
    color: COLORS.green,
  },

  titulo: {
    fontFamily: FONTS.heading, fontSize: 26, fontWeight: '800',
    color: COLORS.gray1, letterSpacing: 1,
    textAlign: 'center', marginBottom: 24, marginTop: 8, lineHeight: 30,
  },
  tituloSpan: { color: COLORS.celeste },

  grid: { padding: 16, paddingBottom: 100 },
  row: { gap: 16, marginBottom: 16 },

  card: {
    borderWidth: 2, borderColor: COLORS.border,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: COLORS.white, height: 180,
  },
  cardImgWrap: {
    flex: 1, alignItems: 'center',
    justifyContent: 'center', padding: 12,
  },
  cardLogo: { width: '88%', height: '100%' },
  cardFooter: { paddingHorizontal: 10, paddingBottom: 10, paddingTop: 6 },
  cardLabel: {
    fontFamily: FONTS.bodySemi, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase',
    color: COLORS.navy, textAlign: 'center',
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  centerText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, textAlign: 'center' },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: 'red', textAlign: 'center' },
  retryBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: COLORS.navy },
  retryText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.white },
});
