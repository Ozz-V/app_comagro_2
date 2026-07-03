import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export function useAiData() {
  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const fetchAiData = useCallback(async (sku, offlinePitch) => {
    if (!sku) {
      setAiData('Texto inteligente en preparación.');
      return;
    }
    
    if (offlinePitch && offlinePitch.trim().length > 0) {
      setAiData(offlinePitch);
      return;
    }

    setLoadingAi(true);

    // 1. Check cache first
    try {
      const rawCache = await AsyncStorage.getItem('@ai_cache_all');
      if (rawCache) {
        const aiDict = JSON.parse(rawCache);
        if (aiDict[sku]) {
          setAiData(aiDict[sku]);
          setLoadingAi(false);
          return;
        }
      }
    } catch (_) {}

    // 2. Fetch from Supabase
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
      const fetchPromise = supabase.from('productos_ai_data').select('sales_pitch').eq('sku', sku).single();
      const { data } = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (data?.sales_pitch) {
        setAiData(data.sales_pitch);
        // Save to cache
        try {
          const rawCache = await AsyncStorage.getItem('@ai_cache_all');
          const aiDict = rawCache ? JSON.parse(rawCache) : {};
          aiDict[sku] = data.sales_pitch;
          await AsyncStorage.setItem('@ai_cache_all', JSON.stringify(aiDict));
        } catch (_) {}
      } else {
        setAiData('ℹ️ El Asistente IA requiere conexión a internet para descargar este texto por primera vez. Cuando tengas red, se guardará aquí.');
      }
    } catch (e) {
      setAiData('ℹ️ Sin conexión o red lenta. El Asistente IA requiere internet para descargar este texto por primera vez. Cuando vuelva la conexión, se mostrará aquí.');
    } finally {
      setLoadingAi(false);
    }
  }, []);

  return { aiData, setAiData, loadingAi, fetchAiData };
}
