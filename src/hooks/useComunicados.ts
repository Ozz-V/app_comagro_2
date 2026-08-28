import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import * as Sentry from '@sentry/react-native';

export interface Comunicado {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
  imagen_url: string | null;
  created_at: string;
}

export function useComunicados() {
  const [comunicadoPendiente, setComunicadoPendiente] = useState<Comunicado | null>(null);

  const checkComunicados = useCallback(async () => {
    try {
      // 1. Obtener los IDs de comunicados ya vistos
      const vistosCache = await AsyncStorage.getItem('@vistos_comunicados');
      const vistos: string[] = vistosCache ? JSON.parse(vistosCache) : [];

      // 2. Traer todos los comunicados activos
      const { data, error } = await supabase
        .from('app_comunicados')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error || !data) return;

      // 3. Buscar el primero que no esté en la lista de vistos
      const noVisto = data.find(c => !vistos.includes(c.id));
      
      if (noVisto) {
        setComunicadoPendiente(noVisto);
      }
    } catch (e) {
      Sentry.captureException(e);
    }
  }, []);

  const marcarComoVisto = async (id: string) => {
    try {
      const vistosCache = await AsyncStorage.getItem('@vistos_comunicados');
      const vistos: string[] = vistosCache ? JSON.parse(vistosCache) : [];
      if (!vistos.includes(id)) {
        vistos.push(id);
        await AsyncStorage.setItem('@vistos_comunicados', JSON.stringify(vistos));
      }
      setComunicadoPendiente(null);
    } catch (e) {
      // Ignorar errores locales
    }
  };

  useEffect(() => {
    checkComunicados();
  }, [checkComunicados]);

  return { comunicadoPendiente, marcarComoVisto, checkComunicados };
}
