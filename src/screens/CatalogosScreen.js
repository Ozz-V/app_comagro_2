import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar,
  ActivityIndicator, useWindowDimensions, RefreshControl,
} from 'react-native';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';

const LOGO        = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };
const BUCKET      = 'catalogos';
const LOGO_BASE   = 'https://www.chacomer.com.py/media/wysiwyg/comagro/LogosPNG/';

// Caché AsyncStorage — lista de catálogos (se invalida solo si hay cambios en Supabase)
const CACHE_KEY      = 'comagro_catalogos_v1';
const CACHE_TIME_KEY = 'comagro_catalogos_fecha_v1';
const HORAS_VIGENCIA = 2; // lista de catálogos cambia menos frecuente

export default function CatalogosScreen({ navigation }) {
  const [catalogos, setCatalogos] = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);
  const [abriendo, setAbriendo]   = useState(null);

  const { width } = useWindowDimensions();
  const cardW = (width - 48 - 16) / 2;

  useEffect(() => { cargarCatalogos(false); }, []);

  function onRefresh() {
    setRefreshing(true);
    cargarCatalogos(true);
  }

  // ─── CARGA DESDE SUPABASE CON CACHÉ ──────────────────────────────
  async function cargarCatalogos(forzar = false) {
    setError(null);

    // Intentar caché primero (si no se fuerza refresh)
    if (!forzar) {
      try {
        const saved = await AsyncStorage.getItem(CACHE_KEY);
        const fecha = await AsyncStorage.getItem(CACHE_TIME_KEY);
        if (
          saved && fecha &&
          (Date.now() - parseInt(fecha)) < HORAS_VIGENCIA * 3600000
        ) {
          setCatalogos(JSON.parse(saved));
          setCargando(false);
          return;
        }
      } catch (_) {}
    }

    setCargando(true);
    try {
      // Lee la tabla 'catalogos' de Supabase, ordenada por el campo 'orden'
      const { data, error: sbError } = await supabase
        .from('catalogos')
        .select('archivo, logo, label, orden')
        .order('orden', { ascending: true });

      if (sbError) throw new Error(sbError.message);
      const lista = data || [];

      // Guardar en caché
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(lista));
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      } catch (_) {}

      setCatalogos(lista);
    } catch (e) {
      // Si hay caché viejo, usarlo de todas formas
      try {
        const saved = await AsyncStorage.getItem(CACHE_KEY);
        if (saved) {
          setCatalogos(JSON.parse(saved));
          return;
        }
      } catch (_) {}
      setError(e.message || 'Error al cargar catálogos');
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }

  async function abrirCatalogo(archivo) {
    setAbriendo(archivo);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(archivo, 300);
      if (error || !data) throw new Error('No se pudo generar el enlace');
      await WebBrowser.openBrowserAsync(data.signedUrl);
    } catch (_) {
      // silently handled
    } finally {
      setAbriendo(null);
    }
  }

  const renderCard = ({ item }) => {
    const cargandoEste = abriendo === item.archivo;
    const logoUri = `${LOGO_BASE}${item.logo}.png`;

    return (
      <TouchableOpacity
        style={[styles.card, { width: cardW }]}
        activeOpacity={0.8}
        onPress={() => abrirCatalogo(item.archivo)}
        disabled={!!abriendo}
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
          <Text style={styles.cardLabel} numberOfLines={2}>{item.label}</Text>
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
          style={{ width: 110, height: 40 }}
          resizeMode="contain"
        />
        <View style={styles.topActions}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.btnVolver}>← Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => supabase.auth.signOut()}>
            <Text style={styles.btnSalir}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.topBorder} />

      {cargando ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.navy} />
          <Text style={styles.centerText}>Cargando catálogos…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => cargarCatalogos(true)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : catalogos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>No hay catálogos disponibles</Text>
        </View>
      ) : (
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 10,
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logo: { width: 110, height: 40 },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  btnVolver: {
    fontFamily: FONTS.body, fontSize: 12,
    color: COLORS.navy, textDecorationLine: 'underline',
  },
  btnSalir: {
    fontFamily: FONTS.body, fontSize: 12,
    color: COLORS.gray4, textDecorationLine: 'underline',
  },

  titulo: {
    fontFamily: FONTS.heading, fontSize: 26, fontWeight: '800',
    color: COLORS.gray1, letterSpacing: 1,
    textAlign: 'center', marginBottom: 24, marginTop: 8, lineHeight: 30,
  },
  tituloSpan: { color: COLORS.celeste },

  grid: { padding: 16, paddingBottom: 40 },
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
