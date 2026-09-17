import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabase';
import { SvgXml } from 'react-native-svg';

const IconCheck = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;

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
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtnWrapper} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Cerrar</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Monitor Plytix</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1f2f6b" style={{ marginTop: 50 }} />
      ) : errors.length === 0 ? (
        <View style={styles.empty}>
          <SvgXml xml={IconCheck} />
          <Text style={styles.emptyText}>No hay errores de sincronización.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 16 }}
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
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontFamily: 'Barlow_600SemiBold', fontSize: 18, color: '#666', marginTop: 16 },
  card: { backgroundColor: '#ffebee', padding: 16, marginBottom: 12, borderRadius: 12, elevation: 1 },
  sku: { fontFamily: 'Barlow_600SemiBold', fontSize: 16, color: '#c62828' },
  errorText: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#333', marginTop: 8 },
  meta: { fontFamily: 'Barlow_400Regular', fontSize: 12, color: '#999', marginTop: 8 }
});
