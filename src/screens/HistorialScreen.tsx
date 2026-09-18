import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS } from '../theme';
import LottieView from 'lottie-react-native';

const ANIMATION_ISO = require('../../assets/iso.json');

import FavoritesPanel from '../components/historial/FavoritesPanel';
import StarProductPanel from '../components/historial/StarProductPanel';
import MostActiveUserPanel from '../components/historial/MostActiveUserPanel';
import TopProductsPanel from '../components/historial/TopProductsPanel';
import TopSharedPanel from '../components/historial/TopSharedPanel';
import TopBrandsPanel from '../components/historial/TopBrandsPanel';

export default function HistorialScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
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
      <Text style={styles.titulo}>Mi Historial</Text>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Usamos flexbox dinámico. Cada panel maneja si debe renderizarse por Feature Flags */}
        <StarProductPanel />
        <MostActiveUserPanel />
        <FavoritesPanel />
        <TopProductsPanel />
        <TopSharedPanel />
        <TopBrandsPanel />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  titulo: { fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, textAlign: 'center', marginTop: 20, marginBottom: 4 },
  scrollContent: { paddingVertical: 16, display: 'flex', flexDirection: 'column' }
});
