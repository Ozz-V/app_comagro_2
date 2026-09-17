import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LottieView from 'lottie-react-native';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../theme';

const ANIMATION_ISO = require('../../assets/iso.json');

type AdminDashboardNavProp = NativeStackNavigationProp<any, 'AdminDashboard'>;

const IconUsers   = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const IconServer  = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
const IconBell    = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
const IconChart   = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const IconClock   = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const MODULES = [
  { id: 'users', title: 'Gestión de Usuarios', desc: 'Administrar roles y baneos.', icon: IconUsers, screen: 'AdminUsers' },
  { id: 'plytix', title: 'Monitor Plytix', desc: 'Revisar sincronizaciones fallidas.', icon: IconServer, screen: 'AdminPlytix' },
  { id: 'push', title: 'Push Global', desc: 'Enviar notificación a todos los usuarios.', icon: IconBell, screen: 'AdminPush' },
  { id: 'metrics', title: 'Métricas de Negocio', desc: 'Ver estadísticas globales y descargar PDF.', icon: IconChart, screen: 'Estadisticas' },
  { id: 'historial', title: 'Mi Historial y Favoritos', desc: 'Ver tus favoritos y actividad personal.', icon: IconClock, screen: 'Historial' }
];

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminDashboardNavProp>();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* HEADER TIPO NOTIFICACIONES */}
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
      <Text style={styles.titulo}>Centro de Comando</Text>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.menuList}>
          {MODULES.map((mod) => (
            <TouchableOpacity
              key={mod.id}
              style={styles.menuCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(mod.screen)}
            >
              <View style={styles.iconWrapper}>
                <SvgXml xml={mod.icon} />
              </View>
              <View style={styles.menuInfo}>
                <Text style={styles.menuTitle}>{mod.title}</Text>
                <Text style={styles.menuDesc}>{mod.desc}</Text>
              </View>
              <View style={styles.arrowRight}>
                <Text style={styles.arrowText}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  titulo: {
    fontFamily: FONTS.heading,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.navy,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 4,
  },
  scroll: { padding: 20, paddingBottom: 60 },
  menuList: { gap: 12 },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg || '#f5f6f8',
    borderRadius: 12,
    padding: 16,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuInfo: { flex: 1 },
  menuTitle: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    color: COLORS.navy,
    marginBottom: 2,
  },
  menuDesc: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
  },
  arrowRight: { paddingLeft: 10 },
  arrowText: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    color: COLORS.gray4,
    lineHeight: 24,
  },
});
