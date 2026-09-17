import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';

const EyeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

export default function TopProductsPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();
  
  const [products, setProducts] = useState<{sku: string, count: number, name: string, img: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxCount, setMaxCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchTop = async () => {
      const { data, error } = await supabase
        .from('producto_analytics')
        .select('sku')
        .eq('user_email', session.user.email)
        .eq('action', 'view')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        const counts: Record<string, number> = {};
        data.forEach(row => {
          if (row.sku) counts[row.sku] = (counts[row.sku] || 0) + 1;
        });
        
        const sorted = Object.keys(counts)
          .sort((a, b) => counts[b] - counts[a])
          .slice(0, 5);
          
        let max = 0;
        
        // Enrich from catalog cache
        const cacheStr = await AsyncStorage.getItem('@catalog_cache');
        const catalog = cacheStr ? JSON.parse(cacheStr) : [];
        const enriched = sorted.map(sku => {
          const prod = catalog.find((p: any) => p.modelo === sku || p.sku === sku);
          const c = counts[sku];
          if (c > max) max = c;
          return {
            sku,
            count: c,
            name: prod ? `${prod.marca} ${prod.modelo}` : sku,
            img: prod?.url_imagen || ''
          };
        });
        
        setMaxCount(max);
        setProducts(enriched);
      }
      setLoading(false);
    };

    fetchTop();
  }, [session?.user?.id]);

  if (!isFeatureEnabled('historial_user')) return null;

  return (
    <View style={styles.cardListFull}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6}}>
        <SvgXml xml={EyeIcon} />
        <Text style={styles.cardTitle}>Tus Productos Más Vistos</Text>
      </View>
      
      {loading ? (
        <ActivityIndicator color="#1f2f6b" />
      ) : products.length === 0 ? (
        <Text style={styles.empty}>Aún no viste ningún producto.</Text>
      ) : (
        <View style={styles.listContainer}>
          {products.map((item) => {
            const w = maxCount > 0 ? Math.max(5, (item.count / maxCount) * 100) : 0;
            const fallbackImg = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sku.substring(0,2))}&background=E8ECF0&color=1A2530`;
            
            return (
              <TouchableOpacity 
                key={item.sku} 
                style={styles.listItem} 
                activeOpacity={0.7} 
                onPress={() => navigation.navigate('ProductViewer', { sku: item.sku })}
              >
                <Image source={{uri: item.img || fallbackImg}} style={styles.itemImg} contentFit="contain" />
                <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
                    <View style={styles.progressBg}>
                       <View style={[styles.progressFill, { width: `${w}%`, backgroundColor: '#1f2f6b' }]} />
                    </View>
                </View>
                <Text style={styles.itemCount}>{item.count}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardListFull: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  cardTitle: { fontFamily: 'Barlow_600SemiBold', fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { color: '#999', fontStyle: 'italic', fontSize: 14, fontFamily: 'Barlow_400Regular' },
  listContainer: { gap: 12 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  itemImg: { width: 32, height: 32, borderRadius: 4, backgroundColor: '#F0F4F8' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: 'Barlow_600SemiBold', fontSize: 12, color: '#1f2f6b', marginBottom: 4 },
  itemCount: { fontFamily: 'BarlowCondensed_900Black', fontSize: 14, color: '#1f2f6b', width: 28, textAlign: 'right' },
  progressBg: { height: 4, backgroundColor: '#E8ECF0', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
