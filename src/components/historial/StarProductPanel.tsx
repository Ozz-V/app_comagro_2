import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../supabase';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { COLORS } from '../../theme';
import { SvgXml } from 'react-native-svg';

const TrophyIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;

export default function StarProductPanel() {
  const { isFeatureEnabled } = useFeaturesStore();
  const [starSku, setStarSku] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  if (!isFeatureEnabled('producto_estrella')) return null;

  useEffect(() => {
    const fetchStar = async () => {
      // Optimizamos obteniendo el producto más visto desde la tabla de analytics
      const { data, error } = await supabase
        .rpc('get_most_viewed_product_global');

      // Si el RPC no existe aún (para no romper nada), usamos un fallback temporal o lo manejamos con una simple consulta
      // Al ser un Panel Modular, si falla silenciosamente no rompe la app.
      if (!error && data && data.length > 0) {
        setStarSku(data[0].sku);
      } else {
        setStarSku('No hay suficientes datos');
      }
      setLoading(false);
    };

    fetchStar();
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <SvgXml xml={TrophyIcon} width={24} height={24} />
        <Text style={styles.title}>Producto Estrella</Text>
      </View>
      <Text style={styles.subtitle}>El más popular de toda la plataforma</Text>
      
      {loading ? (
        <ActivityIndicator color={COLORS.navy} />
      ) : (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{starSku}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.navy, margin: 16, padding: 16, borderRadius: 12, flexGrow: 1, elevation: 4 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.white, marginLeft: 8 },
  subtitle: { color: '#ccc', fontSize: 12, marginBottom: 16 },
  bubble: { backgroundColor: '#FFD700', padding: 12, borderRadius: 8, alignItems: 'center' },
  bubbleText: { color: COLORS.navy, fontWeight: 'bold', fontSize: 16 }
});
