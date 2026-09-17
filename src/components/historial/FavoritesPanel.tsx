import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { COLORS } from '../../theme';
import { SvgXml } from 'react-native-svg';

interface Favorite {
  sku: string;
}

const StarFilled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

export default function FavoritesPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchFaves = async () => {
      const { data } = await supabase
        .from('user_favorites')
        .select('sku')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (data) setFavorites(data);
      setLoading(false);
    };

    fetchFaves();
  }, [session?.user?.id]);

  if (!isFeatureEnabled('favoritos')) return null;

  if (loading) return <ActivityIndicator style={{ margin: 20 }} color={COLORS.navy} />;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <SvgXml xml={StarFilled} width={20} height={20} />
        <Text style={styles.title}>Mis Favoritos</Text>
      </View>
      {favorites.length === 0 ? (
        <Text style={styles.empty}>Aún no guardaste ningún producto favorito.</Text>
      ) : (
        <FlatList
          data={favorites}
          horizontal
          keyExtractor={(item) => item.sku}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.itemBubble}>
              <Text style={styles.itemText}>{item.sku}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#F8F9FA', margin: 16, padding: 16, borderRadius: 12, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.navy, marginLeft: 8 },
  empty: { color: '#666', fontStyle: 'italic', fontSize: 14 },
  itemBubble: { backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#eee' },
  itemText: { fontSize: 14, color: COLORS.navy, fontWeight: '500' }
});
