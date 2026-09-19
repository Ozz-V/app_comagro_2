import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { supabase } from '../supabase';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useAuthStore } from '../store/useAuthStore';
import { COLORS, FONTS } from '../theme';
import LottieView from 'lottie-react-native';

const ANIMATION_ISO = require('../../assets/iso.json');
const CACHE_KEY = '@admin_users_cache';
const PROFILE_CACHE_KEY = '@user_profile_cache';

const IconAdmin = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const IconUser  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.celeste}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const IconBan   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c62828" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
const IconSend  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

type RootStackParamList = {
  Portal: undefined;
  AdminPush: { targetUser: { id: string; full_name: string } };
};

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  telefono?: string;
  role?: string;
  avatar_url?: string;
  installed_version_code?: number | null;
  installed_version_name?: string | null;
}

export default function AdminUsersScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  
  const { showAlert } = useCustomAlert();
  const { session, setIsAdmin } = useAuthStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        setUsers(JSON.parse(cached));
        setLoading(false);
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, telefono, role, avatar_url, installed_version_code, installed_version_name')
        .not('full_name', 'is', null)
        .neq('full_name', '')
        .order('full_name');

      if (!error && data) {
        const valid = data.filter(u => u.full_name && u.full_name.trim().length > 0);
        setUsers(valid);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(valid));
      }
    } catch (e) {
      // Ignorar errores de cache
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const syncSelfRoleChange = useCallback(async (targetUserId: string, newRole: string) => {
    if (!session?.user?.id || targetUserId !== session.user.id) return;

    const isStillAdmin = newRole === 'admin';
    setIsAdmin(isStillAdmin);

    try {
      const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        data.role = newRole;
        await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      // Ignorar errores de cache
    }

    if (!isStillAdmin) {
      showAlert(
        'Rol actualizado',
        'Ya no tienes permisos de administrador. Se cerrará el Panel de Control.',
        [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Portal' }] }) }]
      );
    }
  }, [session, setIsAdmin, navigation, showAlert]);

  const changeRole = (userId: string, newRole: string) => {
    const isDemotion = newRole === 'staff';
    showAlert(
      'Cambiar Rol',
      `¿Asignar el rol "${isDemotion ? 'Staff' : 'Administrador'}" a este usuario?`,
      [
        { text: 'NO', style: 'cancel' },
        {
          text: 'SÍ',
          onPress: async () => {
            const { error } = await supabase.rpc('admin_set_role', { target_user_id: userId, new_role: newRole });
            if (error) {
              showAlert('Error', error.message);
            } else {
              loadUsers(true);
              await syncSelfRoleChange(userId, newRole);
            }
          }
        }
      ]
    );
  };

  const banUser = (userId: string, name: string) => {
    showAlert(
      'Banear Usuario',
      `¿Bloquear el acceso a ${name}?`,
      [
        { text: 'NO', style: 'cancel' },
        {
          text: 'SÍ',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('admin_ban_user', { target_user_id: userId });
            if (error) showAlert('Error', error.message);
            else { loadUsers(true); }
          }
        }
      ]
    );
  };

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
      <Text style={styles.titulo}>Gestión de Usuarios</Text>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.navy} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const initials = (item.full_name || 'U').substring(0, 2).toUpperCase();
            const avatarUri = item.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=1f2f6b&color=fff`;
            const roleLabel = item.role === 'admin' ? 'Administrador' : item.role === 'staff' ? 'Staff' : 'Usuario';
            const roleBadgeColor = item.role === 'admin' ? COLORS.green : item.role === 'staff' ? COLORS.celeste : COLORS.gray4;

            return (
              <View style={styles.card}>
                <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
                <View style={styles.userInfo}>
                  <Text style={styles.name} numberOfLines={1}>{item.full_name}</Text>
                  <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                  {item.telefono ? <Text style={styles.phone}>{item.telefono}</Text> : null}
                  <View style={styles.badgesRow}>
                    <View style={[styles.roleBadge, { backgroundColor: roleBadgeColor + '22' }]}>
                      <Text style={[styles.roleText, { color: roleBadgeColor }]}>{roleLabel}</Text>
                    </View>
                    <View style={[styles.roleBadge, { backgroundColor: COLORS.bg }]}>
                      <Text style={[styles.roleText, { color: COLORS.gray4 }]}>
                        {item.installed_version_code
                          ? `V${item.installed_version_name || item.installed_version_code}`
                          : 'Version desconocida'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: item.role === 'admin' ? COLORS.bg : COLORS.green + '18' }]} onPress={() => changeRole(item.id, 'admin')} disabled={item.role === 'admin'}>
                      <SvgXml xml={IconAdmin} />
                      <Text style={[styles.btnLabel, { color: item.role === 'admin' ? COLORS.gray4 : COLORS.green }]}>Admin</Text>
                    </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: item.role === 'staff' ? COLORS.bg : COLORS.celeste + '18' }]} onPress={() => changeRole(item.id, 'staff')} disabled={item.role === 'staff'}>
                      <SvgXml xml={IconUser} />
                      <Text style={[styles.btnLabel, { color: item.role === 'staff' ? COLORS.gray4 : COLORS.celeste }]}>Staff</Text>
                    </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: COLORS.navy + '14' }]}
                    onPress={() => navigation.navigate('AdminPush', { targetUser: { id: item.id, full_name: item.full_name } })}
                  >
                    <SvgXml xml={IconSend} />
                    <Text style={[styles.btnLabel, { color: COLORS.navy }]}>Enviar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: '#ffebee' }]} onPress={() => banUser(item.id, item.full_name)}>
                    <SvgXml xml={IconBan} />
                    <Text style={[styles.btnLabel, { color: '#c62828' }]}>Banear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
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
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  titulo: { fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, textAlign: 'center', marginTop: 20, marginBottom: 4 },
  list: { padding: 16, paddingBottom: 40 },
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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.border },
  userInfo: { flex: 1, minWidth: 0 },
  name: { fontFamily: FONTS.bodySemi, fontSize: 15, color: COLORS.navy, marginBottom: 2 },
  email: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginBottom: 4 },
  phone: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginBottom: 4 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleText: { fontFamily: FONTS.bodySemi, fontSize: 11 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'column', gap: 6 },
  btn: { width: 60, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  btnLabel: { fontFamily: FONTS.bodySemi, fontSize: 9, marginTop: 1 },
});
