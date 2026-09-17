import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { getProductBySku } from '../../utils/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

const StarIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

interface FavItem {
  sku: string;
  name: string;
  marca: string;
  img: string;
}

export default function FavoritesPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();

  const [favorites, setFavorites] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);

  const enrich = async (skus: string[]): Promise<FavItem[]> =>
    Promise.all(
      skus.map(async (sku) => {
        const prod = await getProductBySku(sku);
        return {
          sku,
          name: prod ? prod.modelo : sku,
          marca: prod?.marca || '',
          img: prod?.imagen || prod?.imagenOriginal || '',
        };
      })
    );

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchFaves = async () => {
      // 1. Render inmediato desde caché local
      try {
        const cache = await AsyncStorage.getItem('@user_favorites_cache');
        if (cache) {
          const favsMap = JSON.parse(cache);
          const activeFavs = Object.keys(favsMap).filter(sku => favsMap[sku]);
          if (activeFavs.length > 0) {
            const enriched = await enrich(activeFavs);
            setFavorites(enriched);
            setLoading(false);
            return;
          }
        }
      } catch (e) {}

      // 2. Fallback a DB
      const { data } = await supabase
        .from('user_favorites')
        .select('sku')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (data) {
        const enriched = await enrich(data.map(r => r.sku));
        setFavorites(enriched);

        // Actualizar caché
        const map: Record<string, boolean> = {};
        data.forEach(r => { map[r.sku] = true; });
        AsyncStorage.setItem('@user_favorites_cache', JSON.stringify(map));
      }
      setLoading(false);
    };

    fetchFaves();
  }, [session?.user?.id]);

  if (!isFeatureEnabled('favoritos')) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SvgXml xml={StarIcon} />
        <Text style={styles.cardTitle}>Mis Favoritos</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.navy} />
      ) : favorites.length === 0 ? (
        <Text style={styles.empty}>Aún no guardaste ningún favorito.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroller}>
          {favorites.map((item) => {
            const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sku.substring(0, 2))}&background=E8ECF0&color=1A2530`;
            return (
              <TouchableOpacity
                key={item.sku}
                style={styles.favCard}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ProductViewer', { sku: item.sku })}
              >
                <Image source={{ uri: item.img || fallback }} style={styles.favImg} contentFit="contain" />
                <Text style={styles.favMarca} numberOfLines={1}>{item.marca}</Text>
                <Text style={styles.favName} numberOfLines={2}>{item.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
  scroller: { gap: 12, paddingRight: 4 },
  favCard: { width: 96, alignItems: 'center' },
  favImg: { width: 80, height: 80, borderRadius: 10, backgroundColor: COLORS.bg, marginBottom: 6 },
  favMarca: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4, textTransform: 'uppercase', textAlign: 'center' },
  favName: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, textAlign: 'center', marginTop: 2 },
});
