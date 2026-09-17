import React, { useState, useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { SvgXml } from 'react-native-svg';

const StarFilled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const StarOutline = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
// Si el proyecto no usa Ionicons, usaremos un texto emoji por seguridad.
// Pero como vimos antes, Expo suele tener Ionicons. Usaremos '⭐' como fallback seguro de diseño.

interface FavoriteToggleProps {
  sku: string;
}

export default function FavoriteToggle({ sku }: FavoriteToggleProps) {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const userId = session?.user?.id;
  
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

  // Solo renderizamos si la feature flag está activa
  const featureEnabled = isFeatureEnabled('favoritos');

  useEffect(() => {
    if (!featureEnabled || !userId || !sku) return;

    const checkFavorite = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('sku', sku)
        .maybeSingle();

      if (!error && data) {
        setIsFavorite(true);
      } else {
        setIsFavorite(false);
      }
      setLoading(false);
    };

    checkFavorite();
  }, [userId, sku, featureEnabled]);

  const toggleFavorite = async () => {
    if (!userId || !sku || loading) return;

    setLoading(true);
    if (isFavorite) {
      // Eliminar
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('sku', sku);
      
      if (!error) setIsFavorite(false);
    } else {
      // Insertar
      const { error } = await supabase
        .from('user_favorites')
        .insert({ user_id: userId, sku });
        
      if (!error) setIsFavorite(true);
    }
    setLoading(false);
  };

  if (!featureEnabled) return null;

  return (
    <TouchableOpacity 
      onPress={toggleFavorite} 
      disabled={loading}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderRadius: 20,
        padding: 6,
        elevation: 2
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#FFD700" />
      ) : (
        <SvgXml xml={isFavorite ? StarFilled : StarOutline} width={28} height={28} />
      )}
    </TouchableOpacity>
  );
}
