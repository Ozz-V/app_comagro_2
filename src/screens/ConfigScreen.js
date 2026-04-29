import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, Platform, Alert, ActivityIndicator
} from 'react-native';
import LottieView from 'lottie-react-native';
import Constants from 'expo-constants';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';

export default function ConfigScreen({ navigation }) {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const versionCode = Constants.expoConfig?.android?.versionCode || 1;
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [topVistos, setTopVistos] = useState([]);
  const [topBuscados, setTopBuscados] = useState([]);
  const [topCompartidos, setTopCompartidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarAnalytics();
  }, []);

  async function cargarAnalytics() {
    setLoading(true);
    try {
      // Top vistos
      const { data: vistos } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku')
        .eq('action', 'view')
        .order('created_at', { ascending: false })
        .limit(200);
      
      // Top buscados
      const { data: buscados } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku')
        .eq('action', 'search')
        .order('created_at', { ascending: false })
        .limit(200);

      // Top compartidos
      const { data: compartidos } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku')
        .in('action', ['share_pdf', 'share_image'])
        .order('created_at', { ascending: false })
        .limit(200);

      // Contar frecuencias
      setTopVistos(contarTop(vistos || [], 5));
      setTopBuscados(contarTop(buscados || [], 5));
      setTopCompartidos(contarTop(compartidos || [], 5));
    } catch (e) {
      console.log('Error cargando analytics:', e);
    } finally {
      setLoading(false);
    }
  }

  function contarTop(items, limit) {
    const counts = {};
    items.forEach(i => {
      const key = i.sku || i.modelo;
      if (!counts[key]) counts[key] = { modelo: i.modelo, marca: i.marca, count: 0 };
      counts[key].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, limit);
  }

  async function buscarActualizacion() {
    setCheckingUpdate(true);
    try {
      const { data } = await supabase
        .from('version_apk')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data && data.version_code > versionCode) {
        Alert.alert(
          'Actualización disponible',
          `Versión ${data.version_name} disponible.\n${data.release_notes || ''}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Actualizado', 'Ya tenés la última versión instalada.');
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo verificar actualizaciones.');
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function cerrarSesion() {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, cerrar', onPress: async () => await supabase.auth.signOut() },
    ]);
  }

  function renderTopList(title, iconName, data) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <SvgIcon name={iconName} size={20} color={COLORS.navy} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {data.length === 0 ? (
          <Text style={styles.emptyText}>Sin datos aún</Text>
        ) : (
          data.map((item, idx) => (
            <View key={idx} style={styles.rankRow}>
              <Text style={styles.rankNum}>{idx + 1}</Text>
              <View style={styles.rankInfo}>
                <Text style={styles.rankModelo} numberOfLines={1}>{item.modelo}</Text>
                <Text style={styles.rankMarca}>{item.marca}</Text>
              </View>
              <Text style={styles.rankCount}>{item.count}</Text>
            </View>
          ))
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Configuración</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Versión */}
        <View style={styles.versionCard}>
          <LottieView
            source={require('../../assets/iso.json')}
            autoPlay
            loop={true}
            style={{ width: 60, height: 60 }}
            resizeMode="contain"
          />
          <View style={styles.versionInfo}>
            <Text style={styles.versionLabel}>Comagro App</Text>
            <Text style={styles.versionNumber}>v{appVersion} (build {versionCode})</Text>
          </View>
        </View>

        {/* Buscar actualización */}
        <TouchableOpacity 
          style={styles.updateBtn} 
          onPress={buscarActualizacion}
          disabled={checkingUpdate}
          activeOpacity={0.7}
        >
          <SvgIcon name="actualizar" size={22} color="#fff" />
          <Text style={styles.updateBtnText}>
            {checkingUpdate ? 'Verificando...' : 'Buscar actualización'}
          </Text>
          {checkingUpdate && <ActivityIndicator color="#fff" size="small" />}
        </TouchableOpacity>

        {/* Analytics */}
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.green} style={{ marginTop: 30 }} />
        ) : (
          <>
            {renderTopList('Más vistos', 'buscar', topVistos)}
            {renderTopList('Más buscados', 'buscar', topBuscados)}
            {renderTopList('Más compartidos', 'share', topCompartidos)}
          </>
        )}

        {/* Cerrar sesión */}
        <TouchableOpacity style={styles.logoutBtn} onPress={cerrarSesion} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  topTitle: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
  backBtn: { width: 60 },
  backText: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.green,
  },

  content: {
    padding: 24,
  },

  versionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    padding: 20,
    borderRadius: 14,
    marginBottom: 16,
    gap: 16,
  },
  versionInfo: { flex: 1 },
  versionLabel: {
    fontFamily: FONTS.heading,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.navy,
  },
  versionNumber: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    marginTop: 4,
  },

  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 28,
    gap: 10,
  },
  updateBtnText: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  emptyText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
    fontStyle: 'italic',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F7F8FA',
    borderRadius: 8,
    marginBottom: 6,
  },
  rankNum: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.green,
    width: 28,
  },
  rankInfo: { flex: 1 },
  rankModelo: {
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.navy,
  },
  rankMarca: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
  },
  rankCount: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    paddingLeft: 10,
  },

  logoutBtn: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
  },
});
