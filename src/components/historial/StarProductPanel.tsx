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

const CACHE_KEY = '@historial_star_product_v2';

const TrophyIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
const EyeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ShareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

export default function StarProductPanel() {
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();
  const [starData, setStarData] = useState<{ sku: string; name: string; marca: string; subcategory: string; img: string; views: number; shares: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setStarData(JSON.parse(cached));
      } catch (e) {}

      const { data, error } = await supabase
        .from('producto_analytics')
        .select('sku, action')
        .in('action', ['view', 'share_pdf', 'share_image'])
        .limit(20000);

      if (!error && data && data.length > 0) {
        const counts: Record<string, { views: number, shares: number }> = {};
        data.forEach(row => {
          if (!row.sku) return;
          if (!counts[row.sku]) counts[row.sku] = { views: 0, shares: 0 };
          if (row.action === 'view') counts[row.sku].views++;
          else counts[row.sku].shares++;
        });

        // Producto estrella: el más visto
        const starSku = Object.keys(counts).sort((a, b) => counts[b].views - counts[a].views)[0];
        
        if (starSku) {
          const prod = await getProductBySku(starSku);
          const result = {
            sku: starSku,
            views: counts[starSku].views,
            shares: counts[starSku].shares,
            name: prod ? prod.modelo : starSku,
            marca: prod?.marca || '',
            subcategory: prod?.sub_categoria || 'Sin subcategoría',
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
    <View style={styles.container}>
      <View style={styles.header}>
        <SvgXml xml={TrophyIcon} />
        <Text style={styles.title}>Producto Estrella</Text>
      </View>

      {!starData ? (
        <Text style={styles.empty}>Calculando tendencias...</Text>
      ) : (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ProductViewer', { sku: starData.sku })}
        >
          <View style={styles.imgWrapper}>
            <Image
              source={{ uri: starData.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(starData.sku.substring(0, 2))}&background=E8ECF0&color=1A2530` }}
              style={styles.img}
              contentFit="contain"
            />
          </View>
          
          <View style={styles.content}>
            <Text style={styles.brand}>{starData.marca}</Text>
            <Text style={styles.name}>{starData.name}</Text>
            <Text style={styles.subText}>{starData.subcategory} • SKU: {starData.sku}</Text>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <SvgXml xml={EyeIcon} />
                <Text style={styles.statValue}>{starData.views}</Text>
                <Text style={styles.statLabel}>Vistas</Text>
              </View>
              <View style={styles.statBox}>
                <SvgXml xml={ShareIcon} />
                <Text style={styles.statValue}>{starData.shares}</Text>
                <Text style={styles.statLabel}>Compartidos</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  title: { fontFamily: FONTS.headingBold, fontSize: 18, color: '#FFC107', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  empty: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 4,
  },
  imgWrapper: {
    height: 180,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    padding: 16,
  },
  img: { width: '100%', height: '100%' },
  content: { padding: 20, alignItems: 'center' },
  brand: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.gray4, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  name: { fontFamily: FONTS.heading, fontSize: 24, color: COLORS.navy, textAlign: 'center', marginBottom: 4 },
  subText: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, textAlign: 'center', marginBottom: 20 },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  statValue: { fontFamily: FONTS.headingBold, fontSize: 18, color: COLORS.navy, marginTop: 2 },
  statLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginTop: 2 },
});
