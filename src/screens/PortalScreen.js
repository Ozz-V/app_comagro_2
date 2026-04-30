import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, SafeAreaView, StatusBar, ScrollView, Platform
} from 'react-native';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';

const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';

const OPCIONES = [
  {
    id: 'catalogos',
    screen: 'Catalogos',
    icon: 'doc',
    titulo: 'Catálogos Generales',
    desc: 'PDFs de catálogos por marca',
  },
  {
    id: 'fichas',
    screen: 'Fichas',
    icon: 'doc4',
    titulo: 'Fichas Técnicas',
    desc: 'Fichas técnicas por categoría',
  },
  {
    id: 'productos',
    screen: 'Productos',
    icon: 'buscar',
    titulo: 'Todos los Productos',
    desc: 'Catálogo completo con specs',
  },
  {
    id: 'config',
    screen: 'Config',
    icon: 'config',
    titulo: 'Configuración',
    desc: 'Versión, datos y sesión',
  },
];

export default function PortalScreen({ navigation }) {
  const [recientes, setRecientes] = useState([]);

  useEffect(() => {
    cargarRecientes();
  }, []);

  // Recargar al volver a esta pantalla
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      cargarRecientes();
    });
    return unsubscribe;
  }, [navigation]);

  async function cargarRecientes() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku, created_at')
        .eq('user_email', user.email)
        .eq('action', 'view')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        // Eliminar duplicados (quedarse con el más reciente de cada SKU)
        const seen = new Set();
        const unique = [];
        for (const item of data) {
          if (!seen.has(item.sku)) {
            seen.add(item.sku);
            unique.push(item);
          }
          if (unique.length >= 5) break;
        }
        setRecientes(unique);
      }
    } catch (e) {
      console.log('Error cargando recientes:', e);
    }
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
          style={styles.logoAnimado}
          resizeMode="contain"
        />
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
            <View style={styles.iconWrap}>
              <SvgIcon name={op.icon} size={26} color={COLORS.navy} />
            </View>
            <View style={styles.cardTexts}>
              <Text style={styles.cardTitulo}>{op.titulo}</Text>
              <Text style={styles.cardDesc}>{op.desc}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        ))}

        {/* Productos recientes */}
        {recientes.length > 0 && (
          <View style={styles.recientesSection}>
            <Text style={styles.recientesTitulo}>Vistos recientemente</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recientesScroll}>
              {recientes.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.recienteCard}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Productos', { openProductSku: item.sku || item.modelo })}
                >
                  <Image
                    source={{ uri: `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\s+/g, '_')}.jpg` }}
                    style={styles.recienteLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.recienteModelo} numberOfLines={1}>{item.modelo}</Text>
                  <Text style={styles.recienteMarca} numberOfLines={1}>{item.marca}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },

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
    borderRadius: 12,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
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

  // Recientes
  recientesSection: {
    marginTop: 24,
  },
  recientesTitulo: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 14,
  },
  recientesScroll: {
    flexDirection: 'row',
  },
  recienteCard: {
    width: 110,
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    alignItems: 'center',
  },
  recienteLogo: {
    width: 50,
    height: 30,
    marginBottom: 8,
  },
  recienteModelo: {
    fontFamily: FONTS.heading,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
    textAlign: 'center',
  },
  recienteMarca: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.gray4,
    textAlign: 'center',
    marginTop: 2,
  },
});
