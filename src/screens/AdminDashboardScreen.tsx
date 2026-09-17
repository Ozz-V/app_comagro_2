import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../theme';
import LottieView from 'lottie-react-native';

const ANIMATION_ISO = require('../../assets/iso.json');

type AdminDashboardNavProp = NativeStackNavigationProp<any, 'AdminDashboard'>;

const IconUsers   = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const IconServer  = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
const IconBell    = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
const IconStats   = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const IconHistory = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const MODULES = [
  { key: 'AdminUsers',   icon: IconUsers,   title: 'Gestión de Usuarios',    desc: 'Administrar roles y permisos.' },
  { key: 'AdminPlytix',  icon: IconServer,  title: 'Monitor Plytix',          desc: 'Estado de servidores y sincronizaciones.' },
  { key: 'AdminPush',    icon: IconBell,    title: 'Push Global',             desc: 'Enviar comunicado a todos los usuarios.' },
  { key: 'Estadisticas', icon: IconStats,   title: 'Métricas de Negocio',     desc: 'Estadísticas globales y reporte PDF.' },
  { key: 'Historial',    icon: IconHistory, title: 'Mi Historial y Favoritos', desc: 'Actividad personal y productos guardados.' },
];

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminDashboardNavProp>();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView source={ANIMATION_ISO} autoPlay loop style={styles.logo} />
        <Text style={styles.topTitle}>Centro de Comando</Text>
        <View style={{ width: 100 }} />
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>Módulos de Administración</Text>

        {MODULES.map((mod) => (
          <TouchableOpacity
            key={mod.key}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(mod.key as any)}
          >
            <View style={styles.iconBox}>
              <SvgXml xml={mod.icon} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{mod.title}</Text>
              <Text style={styles.cardDesc}>{mod.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
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
  logo: { width: 100, height: 40 },
  topTitle: { fontFamily: FONTS.headingBold, fontSize: 22, color: COLORS.navy, textTransform: 'uppercase' },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontFamily: FONTS.bodySemi,
    fontSize: 11,
    color: COLORS.gray4,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: COLORS.white,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontFamily: FONTS.bodySemi, fontSize: 16, color: COLORS.navy },
  cardDesc:  { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, marginTop: 2 },
});
