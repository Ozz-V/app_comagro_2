import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, SafeAreaView, StatusBar, ScrollView,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';

const LOGO = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };

const OPCIONES = [
  {
    id: 'catalogos',
    screen: 'Catalogos',
    emoji: '📚',
    titulo: 'Catálogos Generales',
    desc: 'PDFs de catálogos por marca',
  },
  {
    id: 'fichas',
    screen: 'Fichas',
    emoji: '📄',
    titulo: 'Fichas Técnicas',
    desc: 'Fichas técnicas por categoría',
  },
  {
    id: 'productos',
    screen: 'Productos',
    emoji: '🔍',
    titulo: 'Todos los Productos',
    desc: 'Catálogo completo con specs',
  },
];

export default function PortalScreen({ navigation }) {
  async function cerrarSesion() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <LottieView
          source={require('../../assets/iso.json')}
          autoPlay
          loop={true}
          style={{ width: 110, height: 40 }}
          resizeMode="contain"
        />
        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={styles.btnSalir}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.titulo}>Portal de Documentación</Text>
        <Text style={styles.subtitulo}>Elegí una sección para continuar</Text>

        {OPCIONES.map(op => (
          <TouchableOpacity
            key={op.id}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(op.screen)}
          >
            <Text style={styles.cardEmoji}>{op.emoji}</Text>
            <View style={styles.cardTexts}>
              <Text style={styles.cardTitulo}>{op.titulo}</Text>
              <Text style={styles.cardDesc}>{op.desc}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logo: { width: 110, height: 40 },
  btnSalir: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
    textDecorationLine: 'underline',
  },

  content: {
    padding: 24,
    paddingTop: 32,
  },

  titulo: {
    fontFamily: FONTS.heading,
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 6,
  },
  subtitulo: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    marginBottom: 28,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    padding: 18,
    marginBottom: 14,
    gap: 14,
  },
  cardEmoji: { fontSize: 28 },
  cardTexts: { flex: 1 },
  cardTitulo: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
  },
  cardArrow: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    color: COLORS.gray5,
  },
});
