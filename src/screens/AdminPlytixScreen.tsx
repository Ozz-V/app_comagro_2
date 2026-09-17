import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { supabase } from '../supabase';

export default function AdminPlytixScreen() {
  const navigation = useNavigation();
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchErrors = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('plytix_queue').select('*').eq('status', 'error').order('last_attempt', { ascending: false });
    if (!error && data) setErrors(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchErrors();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{color:'#1f2f6b', fontSize:24}}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Monitor Plytix (Errores)</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1f2f6b" style={{ marginTop: 50 }} />
      ) : errors.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{color:'#2e7d32', fontSize:64}}>?</Text>
          <Text style={styles.emptyText}>No hay errores de sincronización.</Text>
        </View>
      ) : (
        <FlatList
          data={errors}
          keyExtractor={(item) => item.sku}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.sku}>SKU: {item.sku}</Text>
              <Text style={styles.errorText}>{item.last_error || 'Error desconocido'}</Text>
              <Text style={styles.meta}>Reintentos: {item.retry_count} | Último: {new Date(item.last_attempt).toLocaleString()}</Text>
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
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontFamily: 'Barlow_500Medium', fontSize: 18, color: '#666', marginTop: 16 },
  card: { backgroundColor: '#ffebee', padding: 16, marginHorizontal: 16, marginTop: 12, borderRadius: 12, elevation: 1 },
  sku: { fontFamily: 'Barlow_700Bold', fontSize: 16, color: '#c62828' },
  errorText: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#333', marginTop: 8 },
  meta: { fontFamily: 'Barlow_400Regular', fontSize: 12, color: '#999', marginTop: 8 }
});
