import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

/**
 * Vacía la cola de analíticas pendientes hacia Supabase.
 * Usa getSession en vez de getUser para evitar esperas excesivas de red 
 * si la sesión ya está en caché, solucionando el problema de aborto temprano.
 */
export async function syncAnalyticsQueue() {
  try {
    const qStr = await AsyncStorage.getItem('@analytics_queue');
    if (!qStr) return;
    
    const queue = JSON.parse(qStr);
    if (!queue || queue.length === 0) return;
    
    // Obtenemos la sesión en lugar de getUser() para que sea más rápido y no falle al arranque.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return; 

    // Enviamos a Supabase
    const { error } = await supabase.from('producto_analytics').insert(queue);
    
    // Si se insertó con éxito, limpiamos la cola
    if (!error) {
      await AsyncStorage.removeItem('@analytics_queue');
    }
  } catch (err) {
    console.log("Error syncAnalyticsQueue:", err);
  }
}
