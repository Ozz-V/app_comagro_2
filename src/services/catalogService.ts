/**
 * catalogService.ts
 * Capa de servicios de red — aísla los fetch a Edge Functions y Supabase de los hooks.
 * Los hooks solo llaman funciones de este archivo; nunca hacen fetch directamente.
 */

import { supabase, EDGE_URL } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';
import { insertProductsBatch } from '../utils/database';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  totalSynced: number;
  logoRefreshKey: string | null;
}

export interface AiDataResult {
  pitch: string | null;
  fromCache: boolean;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Obtiene el access token de la sesión activa (con fallback a refresh). */
async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.session?.access_token ?? '';
}

// ─── Catálogo de Productos ────────────────────────────────────────────────────

/**
 * Sincroniza el catálogo de productos paginando la Edge Function.
 * Si `sinceTimestamp` está presente, hace una actualización delta (solo los
 * productos modificados desde esa fecha). Si no, hace una sincronización completa.
 *
 * @returns SyncResult con el total de productos sincronizados y la nueva clave de logo.
 */
export async function syncCatalog(
  sinceTimestamp: string | null,
  manifest: Record<string, string>,
): Promise<SyncResult> {
  const accessToken = await getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
  if (sinceTimestamp) headers['X-Since'] = sinceTimestamp;

  let offset = 0;
  const limit = 500;
  let hasMore = true;
  let totalSynced = 0;

  while (hasMore) {
    const url = new URL(EDGE_URL as string);
    url.searchParams.append('offset', offset.toString());
    url.searchParams.append('limit', limit.toString());

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} al sincronizar catálogo`);

    const rows: Product[] = await res.json();

    if (Array.isArray(rows) && rows.length > 0) {
      // Solo borramos en la primera página de sincronización completa
      const isDelta = !!sinceTimestamp || offset > 0;
      await insertProductsBatch(rows, manifest, isDelta);
      totalSynced += rows.length;
      hasMore = rows.length >= limit;
      offset += limit;
    } else {
      hasMore = false;
    }
  }

  // Actualizar timestamp de caché y clave de logo si hubo cambios
  let logoRefreshKey: string | null = null;
  if (totalSynced > 0 || !sinceTimestamp) {
    const key = Date.now().toString();
    await AsyncStorage.setItem('comagro_productos_fecha_v3', key);
    await AsyncStorage.setItem('@logo_refresh_key', key).catch(() => {});
    logoRefreshKey = key;
  }

  return { totalSynced, logoRefreshKey };
}

// ─── AI Sales Pitch ───────────────────────────────────────────────────────────

const AI_CACHE_KEY = '@ai_cache_all';
const AI_FETCH_TIMEOUT_MS = 5000;

/**
 * Obtiene el sales pitch de IA para un SKU dado.
 * Primero busca en caché local (AsyncStorage), luego consulta Supabase.
 */
export async function fetchAiPitch(sku: string): Promise<AiDataResult> {
  // 1. Caché local
  try {
    const raw = await AsyncStorage.getItem(AI_CACHE_KEY);
    if (raw) {
      const dict = JSON.parse(raw) as Record<string, string>;
      if (dict[sku]) return { pitch: dict[sku], fromCache: true };
    }
  } catch { /* caché corrupta — ignorar y continuar */ }

  // 2. Red — con timeout de seguridad
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), AI_FETCH_TIMEOUT_MS),
  );

  const { data } = await Promise.race([
    supabase.from('productos_ai_data').select('sales_pitch').eq('sku', sku).single(),
    timeoutPromise,
  ]) as { data: { sales_pitch: string } | null };

  if (data?.sales_pitch) {
    // Guardar en caché
    try {
      const raw = await AsyncStorage.getItem(AI_CACHE_KEY);
      const dict = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      dict[sku] = data.sales_pitch;
      await AsyncStorage.setItem(AI_CACHE_KEY, JSON.stringify(dict));
    } catch { /* no bloquear si falla la escritura del caché */ }

    return { pitch: data.sales_pitch, fromCache: false };
  }

  return { pitch: null, fromCache: false };
}
