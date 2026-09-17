import { create } from 'zustand';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppFeature {
  feature_key: string;
  is_enabled: boolean;
  label: string;
}

interface FeaturesState {
  features: Record<string, boolean>;
  isInitialized: boolean;
  loadFeatures: () => Promise<void>;
  isFeatureEnabled: (key: string) => boolean;
}

const FEATURES_CACHE_KEY = '@app_features_cache';

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  features: {},
  isInitialized: false,

  loadFeatures: async () => {
    try {
      // 1. Intentar cargar del caché local primero para rapidez
      const cached = await AsyncStorage.getItem(FEATURES_CACHE_KEY);
      if (cached) {
        set({ features: JSON.parse(cached), isInitialized: true });
      }

      // 2. Traer la versión fresca de Supabase
      const { data, error } = await supabase.from('app_features').select('*');
      
      if (!error && data) {
        const featuresMap: Record<string, boolean> = {};
        data.forEach((feat: AppFeature) => {
          featuresMap[feat.feature_key] = feat.is_enabled;
        });

        // Actualizar store y caché
        set({ features: featuresMap, isInitialized: true });
        await AsyncStorage.setItem(FEATURES_CACHE_KEY, JSON.stringify(featuresMap));
      }
    } catch (e) {
      console.warn('Error loading features:', e);
    }
  },

  isFeatureEnabled: (key: string) => {
    const { features } = get();
    // Si no existe la llave en la base, por defecto asumimos que es falso (o verdadero, según regla de negocio).
    // Para no romper la app si la DB falla, y por ser características de valor agregado,
    // es más seguro devolver el estado que haya, y si no está, true o false según convenga.
    // Vamos a devolver false (apagado) por defecto si la llave no existe, 
    // EXCEPTUANDO que podríamos devolver true si preferimos fallar 'encendidos'. 
    // Lo más seguro: false, a menos que exista y sea true.
    return features[key] === true;
  }
}));
