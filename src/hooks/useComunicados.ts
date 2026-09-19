import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

export interface Comunicado {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
  imagen_url: string | null;
  created_at: string;
  target_scope?: 'all' | 'latest' | 'previous' | null;
  target_version_code?: number | null;
  target_user_ids?: string[] | null;
}

// Mismo criterio que useOTAUpdate.ts para saber que version tiene instalada
// este dispositivo puntual (no se guarda en el servidor, se lee del propio
// dispositivo cada vez).
function getInstalledVersionCode(): number {
  return Application.nativeBuildVersion
    ? parseInt(Application.nativeBuildVersion, 10)
    : (Constants.expoConfig?.android?.versionCode || 1);
}

// Un comunicado segmentado ('latest' o 'previous') solo es visible si el
// version_code de este dispositivo cae del lado correcto de target_version_code.
// Sin target_scope, o con 'all', se muestra a todos (compatibilidad con filas viejas).
function esVisibleParaEstaVersion(c: Comunicado, installedCode: number): boolean {
  if (!c.target_scope || c.target_scope === 'all') return true;
  if (c.target_version_code == null) return true;
  if (c.target_scope === 'latest') return installedCode >= c.target_version_code;
  if (c.target_scope === 'previous') return installedCode < c.target_version_code;
  return true;
}

export function useComunicados() {
  const [comunicadoPendiente, setComunicadoPendiente] = useState<Comunicado | null>(null);

  const checkComunicados = useCallback(async () => {
    try {
      // 1. Obtener los IDs de comunicados ya vistos
      const vistosCache = await AsyncStorage.getItem('@vistos_comunicados');
      const vistos: string[] = vistosCache ? JSON.parse(vistosCache) : [];

      // 2. Traer todos los comunicados activos cuya fecha (created_at) ya se cumplió.
      //    Esto permite "programar" un comunicado a futuro: se inserta con is_active=true
      //    pero con created_at en el futuro, y no se muestra hasta llegar esa fecha.
      const { data, error } = await supabase
        .from('app_comunicados')
        .select('*')
        .eq('is_active', true)
        .lte('created_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error || !data) return;

      // 3. Filtrar por segmentacion de version (Nuevas actualizaciones! y
      //    cualquier otro comunicado que el admin haya limitado a "Ultima
      //    version" o "Versiones anteriores").
      const installedCode = getInstalledVersionCode();
      const visibles = data.filter(c => esVisibleParaEstaVersion(c, installedCode));

      // 4. Buscar el primero que no esté en la lista de vistos
      const noVisto = visibles.find(c => !vistos.includes(c.id));
      
      if (noVisto) {
        setComunicadoPendiente(noVisto);
      }
    } catch (e) {
      Sentry.captureException(e);
    }
  }, []);

  const marcarComoVisto = async (id: string, comunicado: Comunicado) => {
    try {
      const vistosCache = await AsyncStorage.getItem('@vistos_comunicados');
      const vistos: string[] = vistosCache ? JSON.parse(vistosCache) : [];
      if (!vistos.includes(id)) {
        vistos.push(id);
        await AsyncStorage.setItem('@vistos_comunicados', JSON.stringify(vistos));

        // Captura 100% Local
        const capturadosCache = await AsyncStorage.getItem('@captured_comunicados');
        const capturados = capturadosCache ? JSON.parse(capturadosCache) : [];
        
        const nuevaNotificacion = {
          id: comunicado.id, // usamos el mismo ID del comunicado
          type: 'comunicado',
          title: comunicado.titulo,
          body: comunicado.tipo,
          data: { comunicado },
          sent_at: new Date().toISOString(),
          read_at: null
        };
        
        capturados.unshift(nuevaNotificacion);
        await AsyncStorage.setItem('@captured_comunicados', JSON.stringify(capturados));
      }
      setComunicadoPendiente(null);
    } catch (e) {
      // Ignorar errores
    }
  };

  useEffect(() => {
    checkComunicados();
    // Se re-consulta cuando App.tsx detecta que se tocó una notificación de
    // tipo 'comunicado' con la app ya abierta (ver handleNotificationTap).
    const sub = DeviceEventEmitter.addListener('CHECK_COMUNICADOS', checkComunicados);
    return () => sub.remove();
  }, [checkComunicados]);

  return { comunicadoPendiente, marcarComoVisto, checkComunicados };
}
