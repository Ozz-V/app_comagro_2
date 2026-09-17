import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../theme';

import FavoritesPanel from '../components/historial/FavoritesPanel';
import StarProductPanel from '../components/historial/StarProductPanel';
import TopProductsPanel from '../components/historial/TopProductsPanel';

export default function HistorialScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{fontSize: 24, color: COLORS.navy}}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Historial y Favoritos</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Usamos flexbox dinámico. Cada panel maneja si debe renderizarse por Feature Flags */}
        <StarProductPanel />
        <FavoritesPanel />
        <TopProductsPanel />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#F8F9FA' },
  backBtn: { paddingRight: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.navy },
  scrollContent: { paddingVertical: 8, display: 'flex', flexDirection: 'column' }
});
