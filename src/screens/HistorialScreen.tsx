import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
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
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtnWrapper} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Cerrar</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Mi Historial</Text>
        <View style={{ width: 80 }} />
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
  scrollContent: { paddingVertical: 16, display: 'flex', flexDirection: 'column' }
});
