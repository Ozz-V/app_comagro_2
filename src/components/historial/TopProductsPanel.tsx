import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { COLORS } from '../../theme';
import { SvgXml } from 'react-native-svg';

const EyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2c3e50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

export default function TopProductsPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const [products, setProducts] = useState<{sku: string, count: number}[]>([]);
  const [loading, setLoading] = useState(true);

  if (!isFeatureEnabled('historial_user')) return null;

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchTop = async () => {
      // Optimizamos obteniendo el historial personal desde analytics_events
      const { data, error } = await supabase
        .from('analytics_events')
        .select('event_data')
        .eq('user_id', session.user.id)
        .eq('event_type', 'view_product')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        // Agrupar por SKU
        const counts: Record<string, number> = {};
        data.forEach(row => {
          const sku = row.event_data?.sku;
          if (sku) {
            counts[sku] = (counts[sku] || 0) + 1;
          }
        });
        
        const sorted = Object.keys(counts)
          .map(sku => ({ sku, count: counts[sku] }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5); // Top 5
          
        setProducts(sorted);
      }
      setLoading(false);
    };

    fetchTop();
  }, [session?.user?.id]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <SvgXml xml={EyeIcon} width={20} height={20} />
        <Text style={styles.title}>Tus Productos Más Vistos</Text>
      </View>
      
      {loading ? (
        <ActivityIndicator color={COLORS.navy} />
      ) : products.length === 0 ? (
        <Text style={styles.empty}>Aún no viste ningún producto.</Text>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.sku}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.skuText}>{item.sku}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.count} vistas</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', margin: 16, marginTop: 0, padding: 16, borderRadius: 12, flexGrow: 1, borderWidth: 1, borderColor: '#eee' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.navy, marginLeft: 8 },
  empty: { color: '#999', fontStyle: 'italic', fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  skuText: { fontSize: 15, color: '#333' },
  badge: { backgroundColor: '#FFD700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, color: COLORS.navy, fontWeight: 'bold' }
});
