import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabase';
import { getProductBySku } from '../../utils/database';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { COLORS, FONTS } from '../../theme';

const TrophyIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M17 4v8a5 5 0 0 1-10 0V4"/><path d="M4 4h3v3a2 2 0 0 0 2 2h0"/><path d="M20 4h-3v3a2 2 0 0 1-2 2h0"/></svg>`;
const EyeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.gray4}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ShareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.gray4}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

const CACHE_KEY = '@star_product_cache';

export default function StarProductPanel() {
  const navigation = useNavigation<any>();
  const isFeatureEnabled = useFeaturesStore(s => s.isFeatureEnabled);
  const [starData, setStarData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) setStarData(JSON.parse(cached));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: popular } = await supabase
        .from('producto_analytics')
        .select('sku, modelo, action')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .limit(5000);

      if (popular && popular.length > 0) {
        const scores: Record<string, { v: number; s: number }> = {};
        popular.forEach((row: any) => {
          const id = row.sku || row.modelo;
          if (!id) return;
          if (!scores[id]) scores[id] = { v: 0, s: 0 };
          if (row.action === 'view') scores[id].v++;
          else scores[id].s++;
        });

        let bestId = '';
        let bestScore = -1;
        let views = 0;
        let shares = 0;

        for (const id in scores) {
          const score = scores[id].v + scores[id].s * 3;
          if (score > bestScore) {
            bestScore = score;
            bestId = id;
            views = scores[id].v;
            shares = scores[id].s;
          }
        }

        if (bestId) {
          const prod = await getProductBySku(bestId);
          const result = {
            sku: bestId,
            views,
            shares,
            marca: prod?.marca || 'Desconocida',
            subcategory: prod?.subcategoria || '',
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
    <TouchableOpacity
      style={styles.card}
      activeOpacity={starData ? 0.9 : 1}
      disabled={!starData}
      onPress={() => starData && navigation.navigate('ProductViewer', { sku: starData.sku })}
    >
      {!starData ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <SvgXml xml={TrophyIcon} />
          <Text style={styles.empty}>Calculando tendencias...</Text>
        </View>
      ) : (
        <>
          <View style={styles.mainRow}>
            {/* IZQUIERDA: Copa y Titulo */}
            <View style={styles.leftBadge}>
              <SvgXml xml={TrophyIcon} />
              <Text style={styles.titleLine1}>Producto</Text>
              <Text style={styles.titleLine2}>Estrella</Text>
            </View>

            {/* CENTRO: Imagen */}
            <View style={styles.imgWrapper}>
              <Image
                source={{ uri: starData.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(starData.sku.substring(0, 2))}&background=E8ECF0&color=1A2530` }}
                style={styles.img}
                contentFit="contain"
              />
            </View>

            {/* DERECHA: Info */}
            <View style={styles.content}>
              {!!starData.subcategory && (
                <Text style={styles.typeText} numberOfLines={1} ellipsizeMode="tail">
                  {starData.subcategory}
                </Text>
              )}
              <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
                {starData.marca}
              </Text>
              <Text style={styles.skuText} numberOfLines={1} ellipsizeMode="tail">
                SKU: {starData.sku}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

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
        </>
      )}
    </TouchableOpacity>
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
  empty: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, textAlign: 'center', marginTop: 10 },
  
  mainRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
  },
  leftBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 65,
  },
  titleLine1: { fontFamily: FONTS.bodySemi, fontSize: 10, color: '#FFC107', textTransform: 'uppercase', marginTop: 4 },
  titleLine2: { fontFamily: FONTS.headingBold, fontSize: 12, color: '#FFC107', textTransform: 'uppercase' },
  
  imgWrapper: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    marginHorizontal: 12,
  },
  img: { width: '100%', height: '100%' },
  
  content: { 
    flex: 1, 
    justifyContent: 'center',
    alignItems: 'flex-start'
  },
  typeText: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  name: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 4 },
  skuText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 },
  
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  
  statsRow: { flexDirection: 'row', gap: 12, width: '100%' },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  statValue: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy },
  statLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 },
});