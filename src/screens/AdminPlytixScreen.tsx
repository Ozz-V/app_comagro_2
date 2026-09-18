import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabase';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SystemHealthMonitor from '../components/SystemHealthMonitor';
import { COLORS, FONTS } from '../theme';
import LottieView from 'lottie-react-native';

const ANIMATION_ISO = require('../../assets/iso.json');
const CACHE_KEY = '@admin_plytix_errors_cache';
const IconCheck = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="${COLORS.green}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

export default function AdminPlytixScreen() {
  const navigation = useNavigation();
  const [errors, setErrors] = useState<any[]>([]);

  const loadErrors = useCallback(async () => {
    // 1. Render inmediato desde cachÃ©
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) setErrors(JSON.parse(cached));
    } catch (e) {}

    // 2. Refresh silencioso en background
    const { data, error } = await supabase
      .from('plytix_queue')
      .select('*')
      .eq('status', 'error')
      .order('last_attempt', { ascending: false });
    if (!error && data) {
      setErrors(data);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }
  }, []);

  useEffect(() => { loadErrors(); }, [loadErrors]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView
          source={ANIMATION_ISO}
          autoPlay
          loop
          style={styles.logoAnimado}
          resizeMode="contain"
        />
      </View>
      <View style={styles.topBorder} />
      <Text style={styles.titulo}>Estado de Servidores</Text>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Estado de servidores â€” ahora vive aquÃ­, no flotando en el Dashboard */}
        <Text style={styles.sectionLabel}>Estado de Infraestructura</Text>
        <SystemHealthMonitor />

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Cola de Errores Plytix</Text>

        {errors.length === 0 ? (
          <View style={styles.emptyBox}>
            <SvgXml xml={IconCheck} />
            <Text style={styles.emptyText}>Sin errores de sincronizaciÃ³n</Text>
          </View>
        ) : (
          errors.map((item) => (
            <View key={item.sku} style={styles.card}>
              <Text style={styles.sku}>SKU: {item.sku}</Text>
              <Text style={styles.errorText}>{item.last_error || 'Error desconocido'}</Text>
              <Text style={styles.meta}>
                Reintentos: {item.retry_count} Â· Ãšltimo: {new Date(item.last_attempt).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
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
    justifyContent: 'center',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  titulo: { fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, textAlign: 'center', marginTop: 20, marginBottom: 4 },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontFamily: FONTS.bodySemi,
    fontSize: 11,
    color: COLORS.gray4,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontFamily: FONTS.bodySemi, fontSize: 16, color: COLORS.gray4, marginTop: 12 },
  card: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#ffcdd2',
    padding: 14,
    marginBottom: 12,
    borderRadius: 12,
  },
  sku: { fontFamily: FONTS.bodySemi, fontSize: 15, color: '#c62828' },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray1, marginTop: 6 },
  meta: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, marginTop: 6 },
});
