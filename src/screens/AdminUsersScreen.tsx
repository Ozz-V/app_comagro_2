import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { supabase } from '../supabase';

export default function AdminUsersScreen() {
  const navigation = useNavigation();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('full_name');
    if (!error && data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const changeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.rpc('admin_set_role', { target_user_id: userId, new_role: newRole });
    if (error) Alert.alert('Error', error.message);
    else fetchUsers();
  };

  const banUser = async (userId: string) => {
    const { error } = await supabase.rpc('admin_ban_user', { target_user_id: userId });
    if (error) Alert.alert('Error', error.message);
    else fetchUsers();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{color:'#1f2f6b', fontSize:24}}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gestión de Usuarios</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1f2f6b" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.userInfo}>
                <Text style={styles.name}>{item.full_name || 'Sin Nombre'}</Text>
                <Text style={styles.phone}>{item.telefono || 'Sin Teléfono'}</Text>
                <Text style={styles.role}>Rol actual: <Text style={{fontWeight: 'bold'}}>{item.role || 'user'}</Text></Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.btn} onPress={() => changeRole(item.id, 'admin')}>
                  <Text style={{color:'#2e7d32', fontSize:20}}>???</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => changeRole(item.id, 'user')}>
                  <Text style={{color:'#1565c0', fontSize:20}}>??</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#ffebee' }]} onPress={() => banUser(item.id)}>
                  <Text style={{color:'#c62828', fontSize:20}}>??</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', elevation: 2 },
  backBtn: { padding: 4, marginRight: 12 },
  title: { fontFamily: 'BarlowCondensed_700Bold', fontSize: 24, color: '#1f2f6b' },
  card: { backgroundColor: '#fff', padding: 16, marginHorizontal: 16, marginTop: 12, borderRadius: 12, elevation: 1, flexDirection: 'row', alignItems: 'center' },
  userInfo: { flex: 1 },
  name: { fontFamily: 'Barlow_600SemiBold', fontSize: 16, color: '#333' },
  phone: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#666', marginTop: 2 },
  role: { fontFamily: 'Barlow_400Regular', fontSize: 12, color: '#999', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 8 }
});
