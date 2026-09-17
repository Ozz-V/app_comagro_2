import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { getProductBySku } from '../../utils/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

const CACHE_KEY = '@historial_star_product';
const TrophyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;

export default function StarProductPanel() {
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();
  const [starData, setStarData] = useState<{ sku: string; name: string; marca: string; img: string; count: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      // 1. Render inmediato desde caché
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setStarData(JSON.parse(cached));
      } catch (e) {}

      // 2. Refresh silencioso en background
      const { data, error } = await supabase
        .from('producto_analytics')
        .select('sku')
        .eq('action', 'view')
        .limit(500);

      if (!error && data && data.length > 0) {
        const counts: Record<string, number> = {};
        data.forEach(row => {
          if (row.sku) counts[row.sku] = (counts[row.sku] || 0) + 1;
        });
        const starSku = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        if (starSku) {
          const prod = await getProductBySku(starSku);
          const result = {
            sku: starSku,
            count: counts[starSku],
            name: prod ? prod.modelo : starSku,
            marca: prod?.marca || '',
            img: prod?.imagen || prod?.imagenOriginal || '',
          };
          setStarData(result);
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result));
        }
      }
    };
    load();
  }, []);

  if (!isFeatureEnabled('producto_estrella')) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SvgXml xml={TrophyIcon} />
        <Text style={styles.cardTitle}>Producto Estrella Global</Text>
      </View>
      <Text style={styles.subtitle}>El más visto en toda la plataforma</Text>

      {!starData ? (
        <Text style={styles.empty}>No hay datos aún.</Text>
      ) : (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('ProductViewer', { sku: starData.sku })}
        >
          <Image
            source={{
              uri: starData.img ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(starData.sku.substring(0, 2))}&background=E8ECF0&color=1A2530`
            }}
            style={styles.thumb}
            contentFit="contain"
          />
          <View style={styles.info}>
            <Text style={styles.brand}>{starData.marca}</Text>
            <Text style={styles.name} numberOfLines={1}>{starData.name}</Text>
            <Text style={styles.skuText}>SKU: {starData.sku}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeCount}>{starData.count}</Text>
            <Text style={styles.badgeLabel}>vistas</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardTitle: { fontFamily: FONTS.bodySemi, fontSize: 11, color: '#FFC107', textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginBottom: 12 },
  empty: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: COLORS.white },
  info: { flex: 1, minWidth: 0 },
  brand: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textTransform: 'uppercase', marginBottom: 2 },
  name: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy, marginBottom: 2 },
  skuText: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4 },
  badge: { alignItems: 'center', minWidth: 40 },
  badgeCount: { fontFamily: FONTS.headingBold, fontSize: 20, color: COLORS.navy },
  badgeLabel: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.gray4 },
});
