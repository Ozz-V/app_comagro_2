import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabase';
import { SvgXml } from 'react-native-svg';

const IconAdmin = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
const IconUser = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1565c0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
const IconBan = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c62828" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`;


export default function AdminUsersScreen() {
  const navigation = useNavigation();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('full_name');
    if (!error && data) {
      setUsers(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const changeRole = async (userId: string, newRole: string) => {
    Alert.alert('Confirmar', `¿Cambiar rol a ${newRole}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aceptar', onPress: async () => {
          const { error } = await supabase.rpc('admin_set_role', { target_user_id: userId, new_role: newRole });
          if (error) Alert.alert('Error', error.message);
          else fetchUsers();
      }}
    ]);
  };

  const banUser = async (userId: string) => {
    Alert.alert('Confirmar', '¿Banear a este usuario? (No podrá iniciar sesión)', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Banear', style: 'destructive', onPress: async () => {
          const { error } = await supabase.rpc('admin_ban_user', { target_user_id: userId });
          if (error) Alert.alert('Error', error.message);
          else fetchUsers();
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtnWrapper} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Cerrar</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Gestión de Usuarios</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1f2f6b" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 16 }}
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.userInfo}>
                <Text style={styles.name}>{item.full_name || 'Sin Nombre'}</Text>
                <Text style={styles.phone}>{item.telefono || 'Sin Teléfono'}</Text>
                <Text style={styles.role}>Rol actual: <Text style={{fontFamily: 'Barlow_600SemiBold'}}>{item.role || 'user'}</Text></Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#e8f5e9' }]} onPress={() => changeRole(item.id, 'admin')}>
                  <SvgXml xml={IconAdmin} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#e3f2fd' }]} onPress={() => changeRole(item.id, 'user')}>
                  <SvgXml xml={IconUser} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#ffebee' }]} onPress={() => banUser(item.id)}>
                  <SvgXml xml={IconBan} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  topbar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  topTitle: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 24,
    color: '#1f2f6b',
    textTransform: 'uppercase',
  },
  backBtnWrapper: {
    width: 80,
    paddingLeft: 16,
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: 'Barlow_600SemiBold',
    fontSize: 16,
    color: '#1f2f6b',
  },
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 1 },
  userInfo: { flex: 1 },
  name: { fontFamily: 'Barlow_600SemiBold', fontSize: 18, color: '#333' },
  phone: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#666', marginTop: 4 },
  role: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#888', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  btn: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }
});
