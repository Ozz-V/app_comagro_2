import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

const TagIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.gray4}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>`;

// Top de marcas que el propio usuario más vio/compartió. Agregado en el
// servidor (get_top_brands_by_user_period) -- antes se traían las últimas
// 200 filas crudas y se contaba en el cliente, lo que podía dar un ranking
// incompleto para usuarios con mucha actividad.
export default function TopBrandsPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();

  const [brands, setBrands] = useState<{ marca: string; count: number }[]>([]);
  const [maxCount, setMaxCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;
    const CACHE_KEY = `@historial_top_brands_${session.user.id}`;

    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setBrands(parsed.brands);
          setMaxCount(parsed.maxCount);
        }
      } catch (e) {}

      // Antes: últimas 200 filas crudas contadas en JS. Ahora Postgres
      // agrega el total real por marca (vistas + compartidos).
      const { data, error } = await supabase.rpc('get_top_brands_by_user_period', {
        p_email: session.user.email,
        p_period: 'all',
        p_limit: 5,
      });

      if (!error && data) {
        const topBrands = (data as any[])
          .map((row) => ({ marca: row.marca, count: Number(row.views) + Number(row.shares) }))
          .filter((b) => !!b.marca);

        const max = topBrands.length > 0 ? topBrands[0].count : 0;

        setMaxCount(max);
        setBrands(topBrands);
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ brands: topBrands, maxCount: max }));
      }
    };

    load();
  }, [session?.user?.id]);

  if (!isFeatureEnabled('historial_user')) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SvgXml xml={TagIcon} />
        <Text style={styles.cardTitle}>Marcas Que Más Viste</Text>
      </View>

      {brands.length === 0 ? (
        <Text style={styles.empty}>Aún no viste ninguna marca.</Text>
      ) : (
        <View style={styles.list}>
          {brands.map((item) => {
            const w = maxCount > 0 ? Math.max(5, (item.count / maxCount) * 100) : 0;
            return (
              <View key={item.marca} style={styles.row}>
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>{item.marca}</Text>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${w}%` as any }]} />
                  </View>
                </View>
                <Text style={styles.count}>{item.count}</Text>
              </View>
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
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.navy, marginBottom: 4, textTransform: 'uppercase' },
  progressBg: { height: 4, backgroundColor: COLORS.bg, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFC107', borderRadius: 2 },
  count: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', color: COLORS.navy, width: 28, textAlign: 'right' },
});
