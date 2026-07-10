/**
 * catalogService.ts
 * Capa de servicios de red — aísla los fetch a Edge Functions y Supabase de los hooks.
 * Los hooks solo llaman funciones de este archivo; nunca hacen fetch directamente.
 */

import { supabase, EDGE_URL } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';
import { insertProductsBatch, pruneStaleProducts } from '../utils/database';

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

export const CACHE_TIME_KEY = 'comagro_productos_fecha_v3';
const HORAS_VIGENCIA = 24;

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
  onBatchSynced?: () => void | Promise<void>,
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

  // Solo trackeamos los SKUs vistos cuando es una sync COMPLETA (sin
  // sinceTimestamp). En una sync delta no tiene sentido: solo vienen los
  // productos modificados, no todo el catálogo, así que no podemos usarlo
  // para saber qué borrar.
  const isFullSync = !sinceTimestamp;
  const syncedSkus: string[] = [];

  while (hasMore) {
    const url = new URL(EDGE_URL as string);
    url.searchParams.append('offset', offset.toString());
    url.searchParams.append('limit', limit.toString());

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} al sincronizar catálogo`);

    const rows: Product[] = await res.json();

    if (Array.isArray(rows) && rows.length > 0) {
      // Siempre upsert — nunca se borra la tabla acá (ver database.ts).
      await insertProductsBatch(rows, manifest, !isFullSync);
      totalSynced += rows.length;

      if (isFullSync) {
        for (const p of rows) {
          const sku = p.SKU || p.sku;
          if (sku) syncedSkus.push(String(sku).trim());
        }
      }

      hasMore = rows.length >= limit;
      offset += limit;
      if (onBatchSynced) await onBatchSynced();
    } else {
      hasMore = false;
    }
  }

  // Limpiar productos "fantasma" (borrados en origen) SOLO tras completar
  // con éxito una sincronización completa de punta a punta. Si esto se
  // interrumpe (error de red, app cerrada, etc.) esta línea nunca se
  // ejecuta y los datos ya descargados quedan intactos para la próxima vez.
  if (isFullSync && syncedSkus.length > 0) {
    await pruneStaleProducts(syncedSkus);
  }

  // Actualizar timestamp de caché y clave de logo si hubo cambios
  let logoRefreshKey: string | null = null;
  if (totalSynced > 0 || !sinceTimestamp) {
    const key = Date.now().toString();
    await AsyncStorage.setItem(CACHE_TIME_KEY, key);
    await AsyncStorage.setItem('@logo_refresh_key', key).catch(() => {});
    logoRefreshKey = key;
  }

  return { totalSynced, logoRefreshKey };
}

// ─── Disparador global / singleton de sincronización ─────────────────────────
//
// Todo esto vive a nivel de MÓDULO (no de componente ni de hook) a propósito:
// tiene que sobrevivir a que las pantallas se monten y desmonten al navegar,
// y tiene que poder arrancarse desde CUALQUIER lugar de la app (por ejemplo
// apenas hay sesión iniciada, sin que el usuario entre nunca a la pantalla
// de "Todos los productos") sin arrancar sincronizaciones duplicadas.

let catalogSyncPromise: Promise<SyncResult> | null = null;

type CatalogListener = () => void;
const catalogListeners = new Set<CatalogListener>();

/**
 * Suscribirse a "hubo progreso en la sincronización del catálogo"
 * (se llama después de cada página descargada, y una vez más al terminar
 * o fallar). Devuelve una función para desuscribirse.
 */
export function subscribeToCatalogUpdates(listener: CatalogListener): () => void {
  catalogListeners.add(listener);
  return () => { catalogListeners.delete(listener); };
}

function notifyCatalogListeners() {
  catalogListeners.forEach(l => {
    try { l(); } catch (e) { console.log('Error en listener de catálogo', e); }
  });
}

/** true mientras haya una sincronización de catálogo en curso (de cualquier origen). */
export function isCatalogSyncing(): boolean {
  return catalogSyncPromise !== null;
}

/**
 * Dispara la sincronización del catálogo si hace falta, y es seguro
 * llamarla desde varios lugares a la vez (arranque de la app, pantalla de
 * productos al montarse, pull-to-refresh): si ya hay una sync en curso,
 * devuelve esa misma promesa en vez de arrancar otra en paralelo.
 *
 * Por defecto respeta la vigencia del caché (no hace nada si se sincronizó
 * hace menos de 24hs). Pasar `skipVigenciaCheck: true` para forzar una
 * sincronización ahora mismo (pull-to-refresh manual) — igual va a pedir
 * solo los cambios (delta) si ya existe un timestamp de sync previo.
 */
export async function ensureCatalogSynced(
  manifest: Record<string, string>,
  opts?: { skipVigenciaCheck?: boolean },
): Promise<SyncResult | null> {
  if (catalogSyncPromise) return catalogSyncPromise;

  const fechaCache = await AsyncStorage.getItem(CACHE_TIME_KEY);

  if (!opts?.skipVigenciaCheck) {
    const cacheVigente = fechaCache && (Date.now() - parseInt(fechaCache)) < HORAS_VIGENCIA * 3600000;
    if (cacheVigente) return null;
  }

  const promise = syncCatalog(fechaCache, manifest, () => {
    notifyCatalogListeners();
  }).finally(() => {
    catalogSyncPromise = null;
    notifyCatalogListeners();
  });

  catalogSyncPromise = promise;
  return promise;
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
