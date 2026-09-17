import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabase';
import { SvgXml } from 'react-native-svg';
import SystemHealthMonitor from '../components/SystemHealthMonitor';
import { COLORS, FONTS } from '../theme';

const IconCheck = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="${COLORS.green}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

export default function AdminPlytixScreen() {
  const navigation = useNavigation();
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchErrors = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plytix_queue')
      .select('*')
      .eq('status', 'error')
      .order('last_attempt', { ascending: false });
    if (!error && data) setErrors(data);
    setLoading(false);
  };

  useEffect(() => { fetchErrors(); }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Cerrar</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Monitor Plytix</Text>
        <View style={{ width: 80 }} />
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Estado de servidores — ahora vive aquí, no flotando en el Dashboard */}
        <Text style={styles.sectionLabel}>Estado de Infraestructura</Text>
        <SystemHealthMonitor />

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Cola de Errores Plytix</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.navy} style={{ marginTop: 24 }} />
        ) : errors.length === 0 ? (
          <View style={styles.emptyBox}>
            <SvgXml xml={IconCheck} />
            <Text style={styles.emptyText}>Sin errores de sincronización</Text>
          </View>
        ) : (
          errors.map((item) => (
            <View key={item.sku} style={styles.card}>
              <Text style={styles.sku}>SKU: {item.sku}</Text>
              <Text style={styles.errorText}>{item.last_error || 'Error desconocido'}</Text>
              <Text style={styles.meta}>
                Reintentos: {item.retry_count} · Último: {new Date(item.last_attempt).toLocaleString()}
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
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  topTitle: { fontFamily: FONTS.headingBold, fontSize: 22, color: COLORS.navy, textTransform: 'uppercase' },
  backBtn: { width: 80 },
  backBtnText: { fontFamily: FONTS.bodySemi, fontSize: 16, color: COLORS.green },
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
