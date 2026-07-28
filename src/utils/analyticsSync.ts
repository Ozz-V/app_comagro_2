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
    
    // Obtenemos la sesion en lugar de getUser() para que sea mas rapido y no falle al arranque.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) return; 

    // Filtramos la cola para eliminar elementos corruptos o que no coincidan con el email actual
    const validQueue = queue.filter((item: any) => item.user_email === session.user.email && item.user_email !== 'anon@comagro.com.py');
    
    // Si despus de filtrar no queda nada vlido, igual limpiamos la cola porque estaba envenenada
    if (validQueue.length === 0) {
      await AsyncStorage.removeItem('@analytics_queue');
      return;
    }

    // Enviamos solo los elementos vlidos a Supabase
    const { error } = await supabase.from('producto_analytics').insert(validQueue);
    
    // Si se insert con Ǹxito, limpiamos la cola
    if (!error) {
      await AsyncStorage.removeItem('@analytics_queue');
    }
  } catch (err) {
    console.log("Error syncAnalyticsQueue:", err);
  }
}
