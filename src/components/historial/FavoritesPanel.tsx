import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';

const StarIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

export default function FavoritesPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();
  
  const [favorites, setFavorites] = useState<{sku: string, name: string, img: string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchFaves = async () => {
      // Intenta usar caché offline primero para ser inmediato
      try {
        const cache = await AsyncStorage.getItem('@user_favorites_cache');
        if (cache) {
          const favsMap = JSON.parse(cache);
          const activeFavs = Object.keys(favsMap).filter(sku => favsMap[sku]);
          
          if (activeFavs.length > 0) {
            const cacheStr = await AsyncStorage.getItem('@catalog_cache');
            const catalog = cacheStr ? JSON.parse(cacheStr) : [];
            const enriched = activeFavs.map(sku => {
              const prod = catalog.find((p: any) => p.modelo === sku || p.sku === sku);
              return {
                sku,
                name: prod ? `${prod.marca} ${prod.modelo}` : sku,
                img: prod?.url_imagen || ''
              };
            });
            setFavorites(enriched);
            setLoading(false);
            return;
          }
        }
      } catch (e) {}

      // Fallback a DB
      const { data } = await supabase
        .from('user_favorites')
        .select('sku')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (data) {
        const cacheStr = await AsyncStorage.getItem('@catalog_cache');
        const catalog = cacheStr ? JSON.parse(cacheStr) : [];
        const enriched = data.map(row => {
          const sku = row.sku;
          const prod = catalog.find((p: any) => p.modelo === sku || p.sku === sku);
          return {
            sku,
            name: prod ? `${prod.marca} ${prod.modelo}` : sku,
            img: prod?.url_imagen || ''
          };
        });
        setFavorites(enriched);
      }
      setLoading(false);
    };

    fetchFaves();
  }, [session?.user?.id]);

  if (!isFeatureEnabled('favoritos')) return null;

  return (
    <View style={styles.cardListFull}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6}}>
        <SvgXml xml={StarIcon} />
        <Text style={styles.cardTitle}>Mis Favoritos</Text>
      </View>
      
      {loading ? (
        <ActivityIndicator color="#1f2f6b" />
      ) : favorites.length === 0 ? (
        <Text style={styles.empty}>Aún no guardaste ningún favorito.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {favorites.map((item) => {
            const fallbackImg = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sku.substring(0,2))}&background=E8ECF0&color=1A2530`;
            return (
              <TouchableOpacity 
                key={item.sku} 
                style={styles.favCard} 
                activeOpacity={0.7} 
                onPress={() => navigation.navigate('ProductViewer', { sku: item.sku })}
              >
                <Image source={{uri: item.img || fallbackImg}} style={styles.favImg} contentFit="contain" />
                <Text style={styles.favName} numberOfLines={2}>{item.name}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardListFull: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  cardTitle: { fontFamily: 'Barlow_600SemiBold', fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { color: '#999', fontStyle: 'italic', fontSize: 14, fontFamily: 'Barlow_400Regular' },
  favCard: { width: 100, alignItems: 'center' },
  favImg: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#F0F4F8', marginBottom: 8 },
  favName: { fontFamily: 'Barlow_600SemiBold', fontSize: 11, color: '#1f2f6b', textAlign: 'center' },
});
