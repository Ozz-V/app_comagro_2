import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { getProductBySku } from '../../utils/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

const ShareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.gray4}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

// Top de productos que el propio usuario más compartió. Usa la tabla
// producto_analytics filtrada por su propio email: eso ya está permitido
// por RLS para cualquier usuario (no necesita ser admin ni RPC).
export default function TopSharedPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();

  const [products, setProducts] = useState<{ sku: string; count: number; name: string; img: string }[]>([]);
  const [maxCount, setMaxCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;
    const CACHE_KEY = `@historial_top_shared_${session.user.id}`;

    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setProducts(parsed.products);
          setMaxCount(parsed.maxCount);
        }
      } catch (e) {}

      const { data, error } = await supabase
        .from('producto_analytics')
        .select('sku')
        .eq('user_email', session.user.email)
        .in('action', ['share_pdf', 'share_image'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        const counts: Record<string, number> = {};
        data.forEach(row => {
          if (row.sku) counts[row.sku] = (counts[row.sku] || 0) + 1;
        });

        const topSkus = Object.keys(counts)
          .sort((a, b) => counts[b] - counts[a])
          .slice(0, 5);

        let max = 0;
        const enriched = await Promise.all(
          topSkus.map(async (sku) => {
            const c = counts[sku];
            if (c > max) max = c;
            const prod = await getProductBySku(sku);
            return {
              sku,
              count: c,
              name: prod ? `${prod.marca}  ${prod.modelo}` : sku,
              img: prod?.imagen || prod?.imagenOriginal || '',
            };
          })
        );

        setMaxCount(max);
        setProducts(enriched);
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ products: enriched, maxCount: max }));
      }
    };

    load();
  }, [session?.user?.id]);

  if (!isFeatureEnabled('historial_user')) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SvgXml xml={ShareIcon} />
        <Text style={styles.cardTitle}>Tus Productos Más Compartidos</Text>
      </View>

      {products.length === 0 ? (
        <Text style={styles.empty}>Aún no compartiste ningún producto.</Text>
      ) : (
        <View style={styles.list}>
          {products.map((item) => {
            const w = maxCount > 0 ? Math.max(5, (item.count / maxCount) * 100) : 0;
            const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sku.substring(0, 2))}&background=E8ECF0&color=1A2530`;
            return (
              <TouchableOpacity
                key={item.sku}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ProductViewer', { sku: item.sku })}
              >
                <Image source={{ uri: item.img || fallback }} style={styles.thumb} contentFit="contain" />
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${w}%` as any }]} />
                  </View>
                </View>
                <Text style={styles.count}>{item.count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, fontStyle: 'italic' },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 36, height: 36, borderRadius: 6, backgroundColor: COLORS.bg },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.navy, marginBottom: 4 },
  progressBg: { height: 4, backgroundColor: COLORS.bg, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.green, borderRadius: 2 },
  count: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', color: COLORS.navy, width: 28, textAlign: 'right' },
});
