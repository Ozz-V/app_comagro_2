import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ScrollView, Platform } from 'react-native';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../supabase';
import { syncAnalyticsQueue } from '../utils/analyticsSync';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { COLORS, FONTS } from '../theme';
import DashboardAnalytics from '../components/DashboardAnalytics';
import UserProfileModal from '../components/UserProfileModal';

const ANIMATION_ISO = require('../../assets/iso.json');

// Mismo sistema que estaba en ConfigScreen: DashboardAnalytics resuelve solo
// (vía profiles.role) si el usuario es admin. Si lo es, ve "Mi actividad" y
// "General (Empresa)"; si no, solo ve su propia actividad.
export default function EstadisticasScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void; goBack: () => void; [key: string]: unknown } }) {
  const { isOnline } = useOfflineSync();
  const [analyticsTab, setAnalyticsTab] = useState<'mine' | 'general'>('mine');
  const [isAdmin, setIsAdmin] = useState(false);

  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { checkAdmin(); fetchDirectoryBackground(); }, []);

  async function checkAdmin() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (isMounted.current) setIsAdmin(profile?.role === 'admin');
    } catch (e: unknown) {
      Sentry.captureException(e);
    }
  }

  async function fetchDirectoryBackground() {
    try {
      const cachedDir = await AsyncStorage.getItem('@directory_cache');
      if (cachedDir && isMounted.current) setDirectoryUsers(JSON.parse(cachedDir));
      if (!isOnline && isMounted.current) return;
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url, email, telefono').order('full_name');
      if (data && !error) {
        const valid = data.filter(u => u.full_name && u.full_name.trim() !== '');
        if (isMounted.current) setDirectoryUsers(valid);
        await AsyncStorage.setItem('@directory_cache', JSON.stringify(valid));
      }
    } catch (e: any) {
      Sentry.captureException(e);
    }
  }

  async function handleUserClick(email: string) {
    if (!isMounted.current) return;
    setShowUserModal(true);
    setLoadingUser(true);
    const cachedProfile = directoryUsers.find(u => u.email === email);
    setSelectedUser({
      email,
      full_name: cachedProfile?.full_name || '',
      telefono: cachedProfile?.telefono || '',
      avatar_url: cachedProfile?.avatar_url || null,
      stats: { views: 0, shares: 0 }
    });

    if (!isOnline && isMounted.current) {
      setLoadingUser(false);
      return;
    }

    try {
      await syncAnalyticsQueue();
      const { data: profile, error: errProfile } = await supabase.from('profiles').select('id, full_name, avatar_url, telefono, email').eq('email', email).single();
      const { data: analyticsData, error: errAnalytics } = await supabase.from('producto_analytics').select('action').eq('user_email', email);

      if (errProfile || errAnalytics) throw new Error('Network fail');

      let v = 0, sh = 0;
      if (analyticsData) {
        analyticsData.forEach(r => {
          if (r.action === 'view') v++;
          if (r.action === 'share_pdf' || r.action === 'share_image') sh++;
        });
      }

      if (isMounted.current) {
        setSelectedUser({
          email,
          full_name: profile?.full_name || '',
          telefono: profile?.telefono || '',
          avatar_url: profile?.avatar_url || null,
          stats: { views: v, shares: sh }
        });
      }
    } catch (e: any) {
      Sentry.captureException(e);
    } finally {
      if (isMounted.current) setLoadingUser(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView source={ANIMATION_ISO} autoPlay loop style={styles.logoAnimado} resizeMode="contain" />
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.btnVolver}>‹ Volver</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.titulo}>Estadísticas</Text>

        <DashboardAnalytics navigation={navigation} onUserClick={handleUserClick} onTabChange={setAnalyticsTab} />

      </ScrollView>

      <UserProfileModal
        visible={showUserModal}
        onClose={() => setShowUserModal(false)}
        loadingUser={loadingUser}
        selectedUser={selectedUser}
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
  btnVolver: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.green },
  titulo: {
    fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700',
    color: COLORS.navy, textAlign: 'center', marginTop: 4, marginBottom: 20,
  },
  content: { padding: 24, paddingBottom: 100 },
});
