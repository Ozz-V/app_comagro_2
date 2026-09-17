import React, { useState, useEffect } from 'react';
import { TouchableOpacity } from 'react-native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

const StarFilled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const StarOutline = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#B0B0B0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

interface FavoriteToggleProps {
  sku: string;
}

export default function FavoriteToggle({ sku }: FavoriteToggleProps) {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const userId = session?.user?.id;
  
  const [isFavorite, setIsFavorite] = useState(false);

  const featureEnabled = isFeatureEnabled('favoritos');

  useEffect(() => {
    if (!featureEnabled || !userId || !sku) return;

    const loadLocal = async () => {
      try {
        const cache = await AsyncStorage.getItem('@user_favorites_cache');
        const favs = cache ? JSON.parse(cache) : {};
        
        if (favs[sku] !== undefined) {
          setIsFavorite(favs[sku]);
        } else {
          // Silent background fetch si no est en cache
          supabase.from('user_favorites').select('id').eq('user_id', userId).eq('sku', sku).maybeSingle()
            .then(({ data }) => {
              const isFav = !!data;
              setIsFavorite(isFav);
              favs[sku] = isFav;
              AsyncStorage.setItem('@user_favorites_cache', JSON.stringify(favs));
            });
        }
      } catch (e) {
        // Ignorar errores de cache
      }
    };
    loadLocal();
  }, [userId, sku, featureEnabled]);

  const toggleFavorite = async () => {
    if (!userId || !sku) return;

    // UI Optimista (Offline-first)
    const newState = !isFavorite;
    setIsFavorite(newState);

    try {
      const cache = await AsyncStorage.getItem('@user_favorites_cache');
      const favs = cache ? JSON.parse(cache) : {};
      favs[sku] = newState;
      await AsyncStorage.setItem('@user_favorites_cache', JSON.stringify(favs));

      // Silent push a Supabase (fire and forget en background)
      if (newState) {
        supabase.from('user_favorites').insert({ user_id: userId, sku }).then();
      } else {
        supabase.from('user_favorites').delete().eq('user_id', userId).eq('sku', sku).then();
      }
    } catch (e) {
      // Revertir UI en caso extremo de error, aunque es optimista
      setIsFavorite(!newState);
    }
  };

  if (!featureEnabled) return null;

  return (
    <TouchableOpacity 
      onPress={toggleFavorite} 
      activeOpacity={0.7}
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 10,
        padding: 4
      }}
    >
      <SvgXml xml={isFavorite ? StarFilled : StarOutline} width={24} height={24} />
    </TouchableOpacity>
  );
}
