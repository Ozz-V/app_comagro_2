import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';

const TrophyIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;

export default function StarProductPanel() {
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();
  
  const [starData, setStarData] = useState<{sku: string, name: string, img: string, count: number} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStar = async () => {
      const { data, error } = await supabase
        .from('producto_analytics')
        .select('sku')
        .eq('action', 'view')
        .limit(300);

      if (!error && data && data.length > 0) {
        const counts: Record<string, number> = {};
        data.forEach(row => {
          if (row.sku) counts[row.sku] = (counts[row.sku] || 0) + 1;
        });
        
        const starSku = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        
        if (starSku) {
          const cacheStr = await AsyncStorage.getItem('@catalog_cache');
          const catalog = cacheStr ? JSON.parse(cacheStr) : [];
          const prod = catalog.find((p: any) => p.modelo === starSku || p.sku === starSku);
          
          setStarData({
            sku: starSku,
            count: counts[starSku],
            name: prod ? `${prod.marca} ${prod.modelo}` : starSku,
            img: prod?.url_imagen || ''
          });
        }
      }
      setLoading(false);
    };

    fetchStar();
  }, []);

  if (!isFeatureEnabled('producto_estrella')) return null;

  return (
    <View style={styles.cardListFull}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6}}>
        <SvgXml xml={TrophyIcon} />
        <Text style={styles.cardTitle}>Producto Estrella Global</Text>
      </View>
      <Text style={styles.subtitle}>El producto más popular de toda la plataforma en estos momentos</Text>
      
      {loading ? (
        <ActivityIndicator color="#1f2f6b" style={{marginTop: 10}} />
      ) : !starData ? (
        <Text style={styles.empty}>No hay suficientes datos.</Text>
      ) : (
        <TouchableOpacity 
          style={styles.listItem} 
          activeOpacity={0.7} 
          onPress={() => navigation.navigate('ProductViewer', { sku: starData.sku })}
        >
          <Image 
            source={{uri: starData.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(starData.sku.substring(0,2))}&background=E8ECF0&color=1A2530`}} 
            style={styles.itemImg} 
            contentFit="contain" 
          />
          <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>{starData.name}</Text>
              <Text style={styles.skuText}>SKU: {starData.sku}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.itemCount}>{starData.count} vistas</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardListFull: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  cardTitle: { fontFamily: 'Barlow_600SemiBold', fontSize: 12, color: '#FFC107', textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontFamily: 'Barlow_400Regular', fontSize: 11, color: '#666', marginBottom: 12 },
  empty: { color: '#999', fontStyle: 'italic', fontSize: 14, fontFamily: 'Barlow_400Regular' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fdfdfd', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#f0f0f0' },
  itemImg: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#fff' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: 'Barlow_600SemiBold', fontSize: 14, color: '#1f2f6b', marginBottom: 4 },
  skuText: { fontFamily: 'Barlow_400Regular', fontSize: 11, color: '#888' },
  badge: { backgroundColor: '#f0f4ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  itemCount: { fontFamily: 'BarlowCondensed_900Black', fontSize: 12, color: '#1f2f6b', textAlign: 'center' },
});
