import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { supabase, EDGE_URL } from '../supabase';
import { Product, ParsedProduct } from '../types';

const DB_NAME = 'comagro.db';

export interface ProductRow {
  sku: string;
  marca: string;
  subcategoria: string;
  imagen: string;
  imagenOriginal: string;
  specs_json: string;
  search_text: string;
  sales_pitch: string;
}

// Singleton: una sola conexión compartida por todas las funciones.
// Esto evita errores "database is locked" cuando hay transacciones concurrentes.
let _db: SQLite.SQLiteDatabase | null = null;
export let ftsAvailable = false;

// IMPORTANTE: guardamos la PROMESA de apertura, no solo el resultado ya
// resuelto. useProducts.ts y OfflineSyncContext.tsx pueden llamar a
// initDB()/getDB() casi al mismo tiempo al arrancar la app (uno al montar
// la pantalla, otro al empezar la sync en background). Con el patrón viejo
// (chequear "if (!_db)" y recién ahí asignar tras el await), dos llamadas
// simultáneas ven _db como null ANTES de que la primera termine de abrir,
// y cada una dispara su propio SQLite.openDatabaseAsync() — dos handles
// nativos pisándose, lo que producía el NullPointerException dentro de
// NativeDatabase.execAsync que reportó Sentry. Cacheando la promesa, la
// segunda llamada concurrente espera el mismo openDatabaseAsync() en vez
// de arrancar el suyo.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      // WAL (Write-Ahead Logging) es mucho más resistente que el modo rollback
      // por defecto ante cierres forzosos / cortes de batería / que el sistema
      // mate el proceso a mitad de una escritura: los cambios se anexan a un
      // archivo -wal aparte y solo se "commitean" a la base principal cuando
      // corresponde, así que un corte a mitad de camino no deja la base
      // principal en un estado a medio escribir.
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA synchronous = NORMAL;');
      _db = db;
      return db;
    })().catch((e) => {
      // Si falló la apertura, no dejamos la promesa cacheada colgada:
      // el próximo llamador debe poder reintentar desde cero.
      _dbPromise = null;
      throw e;
    });
  }

  return _dbPromise;
}

/**
 * Si la base local quedó corrupta (poco frecuente, pero puede pasar por
 * cierres forzosos, quedarse sin espacio, o fallas de storage del equipo),
 * en vez de dejar la app inutilizable, la borramos y la recreamos desde
 * cero. Como esto es solo un CACHE del catálogo (se puede volver a
 * descargar de Supabase), perder este archivo no pierde datos del usuario
 * — el próximo sync lo repuebla solo.
 */
async function resetCorruptDatabase(): Promise<void> {
  try {
    if (_db) {
      try { await _db.closeAsync(); } catch { /* ya puede estar cerrada/rota */ }
    }
  } finally {
    _db = null;
    _dbPromise = null;
  }
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch (e: unknown) {
    // Si ni siquiera se puede borrar el archivo, no hay mucho más para
    // intentar automáticamente — se deja que el llamador decida qué mostrar.
    Sentry.captureException(e);
  }
}

const CORRUPTION_SIGNATURES = [
  'not a database',
  'malformed',
  'disk image is malformed',
  'database disk image',
  'file is encrypted or is not a database',
];

function pareceCorrupcion(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e).toLowerCase();
  return CORRUPTION_SIGNATURES.some((sig) => msg.includes(sig));
}

export async function initDB(): Promise<SQLite.SQLiteDatabase> {
  try {
    return await initDBInternal();
  } catch (e: unknown) {
    if (!pareceCorrupcion(e)) {
      Sentry.captureException(e, { tags: { context: 'initDB_non_corruption_error' } });
      throw e; // Error no relacionado a corrupción: no tiene sentido borrar el caché, que se propague tal cual
    }

    // Reintento automático: si la base está corrupta, la borramos y
    // arrancamos de cero UNA vez. Si esto también falla, ahí sí se lo
    // dejamos ver al usuario — pero esto cubre el caso común de corrupción
    // por cierre forzoso sin que el usuario tenga que hacer nada.
    // eslint-disable-next-line no-console
    console.log('initDB detectó base corrupta, reparando automáticamente', String(e));
    Sentry.captureMessage('initDB: base local corrupta, auto-reparando', { level: 'warning', extra: { originalError: String(e) } });
    await resetCorruptDatabase();
    try {
      return await initDBInternal();
    } catch (e2: unknown) {
      // La auto-reparación también falló: esto sí es serio y hay que verlo en Sentry.
      Sentry.captureException(e2, { tags: { context: 'initDB_repair_failed' } });
      throw e2;
    }
  }
}

async function initDBInternal(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDB();

  // Crear la tabla base si no existe (la base será la versión actual completa)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS productos (
      sku TEXT PRIMARY KEY,
      marca TEXT,
      subcategoria TEXT,
      imagen TEXT,
      imagenOriginal TEXT,
      specs_json TEXT,
      search_text TEXT,
      sales_pitch TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos(marca COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_productos_subcategoria ON productos(subcategoria COLLATE NOCASE);

  `);

  // Verificar esquema para migraciones incrementales
  const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(productos)');
  if (tableInfo.length > 0) {
    const hasSkuColumn = tableInfo.some((col) => col.name === 'sku');
    const hasSearchTextColumn = tableInfo.some((col) => col.name === 'search_text');
    const hasSalesPitchColumn = tableInfo.some((col) => col.name === 'sales_pitch');

    if (!hasSkuColumn) {
      // Si no tiene sku, es versión v1 (obsoleta), borrarla
      await db.execAsync('DROP TABLE IF EXISTS productos;');
      await db.execAsync('DROP TABLE IF EXISTS productos_fts;');
      try { await AsyncStorage.removeItem('comagro_productos_fecha_v3'); } catch {}
      try { await AsyncStorage.removeItem('comagro_fts_migrated_v1'); } catch {}
      // Volver a crear tras el drop
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS productos (
          sku TEXT PRIMARY KEY,
          marca TEXT,
          subcategoria TEXT,
          imagen TEXT,
          imagenOriginal TEXT,
          specs_json TEXT,
          search_text TEXT,
          sales_pitch TEXT
        );
      `);
    } else {
      // Migraciones incrementales (6.4)
      if (!hasSearchTextColumn) {
        await db.execAsync('ALTER TABLE productos ADD COLUMN search_text TEXT;');
      }
      if (!hasSalesPitchColumn) {
        await db.execAsync('ALTER TABLE productos ADD COLUMN sales_pitch TEXT;');
      }
    }
  }

  // ─── Índice FTS5 para búsqueda de texto ──────────────────────────────
  try {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS productos_fts USING fts5(
        search_text,
        sales_pitch,
        content='productos',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS productos_ai AFTER INSERT ON productos BEGIN
        INSERT INTO productos_fts(rowid, search_text, sales_pitch)
        VALUES (new.rowid, new.search_text, new.sales_pitch);
      END;

      CREATE TRIGGER IF NOT EXISTS productos_ad AFTER DELETE ON productos BEGIN
        INSERT INTO productos_fts(productos_fts, rowid, search_text, sales_pitch)
        VALUES ('delete', old.rowid, old.search_text, old.sales_pitch);
      END;

      CREATE TRIGGER IF NOT EXISTS productos_au AFTER UPDATE ON productos BEGIN
        INSERT INTO productos_fts(productos_fts, rowid, search_text, sales_pitch)
        VALUES ('delete', old.rowid, old.search_text, old.sales_pitch);
        INSERT INTO productos_fts(rowid, search_text, sales_pitch)
        VALUES (new.rowid, new.search_text, new.sales_pitch);
      END;
    `);

    const ftsMigratedKey = 'comagro_fts_migrated_v1';
    if (!(await AsyncStorage.getItem(ftsMigratedKey))) {
      await db.execAsync(`INSERT INTO productos_fts(productos_fts) VALUES('rebuild');`);
      await AsyncStorage.setItem(ftsMigratedKey, '1');
    }
    ftsAvailable = true;
  } catch (e) {
    ftsAvailable = false;
    Sentry.captureMessage('FTS5 no disponible, usando fallback LIKE', { level: 'warning', extra: { error: String(e) } });
  }

  return db;
}

export async function clearProducts(): Promise<void> {
  const db = await getDB();
  await db.execAsync('DELETE FROM productos;');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function insertProductsBatch(productosArray: Product[], manifest: Record<string, string> | null, isDelta = false): Promise<void> {
  const db = await getDB();

  // NOTA: ya NO se borra la tabla acá. Antes se hacía DELETE FROM productos
  // en la primera página de cada sync "completo", lo que causaba que si el
  // usuario salía de la pantalla y volvía a entrar antes de que terminara
  // de descargar todo el catálogo, se reiniciaba la sync y se borraba todo
  // lo que ya se había descargado (las marcas "desaparecían"). Ahora
  // siempre se hace upsert, y la limpieza de productos obsoletos se hace
  // aparte, solo al final de una sincronización completa exitosa
  // (ver pruneStaleProducts).
  await db.withTransactionAsync(async () => {
    for (const p of productosArray) {
      const pSku = p.SKU || p.sku;
      if (!pSku) continue;

      const sku = String(pSku).trim();
      const marca = (p.Brand || p.Marca || p.marca || '').toString().trim().toUpperCase();
      const subcategoria = (p['Tipo de Producto'] || p['Categoria Magento'] || 'General').toString().trim().toUpperCase();
      const imagenOriginal = (p['imagen 1'] || p.imagen || '').toString().trim();
      const imagen = (manifest && manifest[sku + '.jpg']) || imagenOriginal;

      const specs: [string, string][] = [];
      const colsExcluidas = new Set([
        'SKU', 'imagen 1', 'imagen 2', 'imagen 3', 'imagen 4', 'imagen 5',
        'Brand', 'Marca', 'marca', 'id', 'ID', 'Tipo de Producto', 'Categoria Magento',
        'url_key', 'sales_pitch'
      ]);

      const basura = ['n/a', 'na', 'n.a', 'n.a.', 'no aplica', 'sin dato', 'sin datos',
        'no', 'no tiene', 'no disponible', 'pim', '-', '--', '---', 'st', 'sin información',
        'no corresponde', 'sin especificar', 'sin info'];

      for (const [col, val] of Object.entries(p)) {
        if (!colsExcluidas.has(col) && !col.startsWith('_')) {
          const s = String(val).trim();
          const sLower = s.toLowerCase();
          if (s.length > 0 && !/^0([.,]0+)?$/.test(s) && !basura.includes(sLower)) {
            specs.push([col, s]);
          }
        }
      }

      const specsJson = JSON.stringify(specs);
      const searchText = `${sku} ${marca} ${subcategoria} ${specs.map(s => s[1]).join(' ')}`.toLowerCase();
      const salesPitch = p.sales_pitch || '';

      await db.runAsync(
        'INSERT OR REPLACE INTO productos (sku, marca, subcategoria, imagen, imagenOriginal, specs_json, search_text, sales_pitch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [sku, marca, subcategoria, imagen, imagenOriginal, specsJson, searchText, salesPitch]
      );
    }
  });
}

/**
 * Borra de la base local los productos que YA NO vinieron en una
 * sincronización completa (es decir, se eliminaron en el origen/Plytix).
 * Se debe llamar SOLO después de que el sync completo terminó con éxito
 * (todas las páginas), nunca a mitad de camino ni en un sync delta.
 *
 * Por seguridad, si validSkus viene vacío no borra nada (evita vaciar
 * la tabla entera por un bug o una respuesta vacía inesperada).
 */
export async function pruneStaleProducts(validSkus: string[]): Promise<void> {
  if (!validSkus.length) return;
  const db = await getDB();

  await db.withTransactionAsync(async () => {
    await db.execAsync('CREATE TEMP TABLE IF NOT EXISTS _synced_skus (sku TEXT PRIMARY KEY);');
    await db.execAsync('DELETE FROM _synced_skus;');

    const CHUNK = 400;
    for (let i = 0; i < validSkus.length; i += CHUNK) {
      const chunk = validSkus.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '(?)').join(',');
      await db.runAsync(`INSERT OR IGNORE INTO _synced_skus (sku) VALUES ${placeholders}`, chunk);
    }

    await db.execAsync('DELETE FROM productos WHERE sku NOT IN (SELECT sku FROM _synced_skus);');
    await db.execAsync('DROP TABLE _synced_skus;');
  });
}

export async function searchProducts(marcaFiltro: string, subcatFiltro: string, textoBusqueda: string): Promise<ParsedProduct[]> {
  const db = await getDB();

  const trimmed = (textoBusqueda || '').trim();
  const terms = trimmed.length > 2 ? trimmed.split(/\s+/).filter(x => x.length > 1) : [];

  const params: string[] = [];
  let query: string;

  if (terms.length > 0 && ftsAvailable) {
    // Prefix-match por término, unidos con espacio (AND implícito en FTS5)
    const ftsQuery = terms.map(t => `"${t.replace(/"/g, '""')}"*`).join(' ');
    query = `SELECT p.* FROM productos_fts JOIN productos p ON p.rowid = productos_fts.rowid WHERE productos_fts MATCH ?`;
    params.push(ftsQuery);
  } else {
    query = 'SELECT p.* FROM productos p WHERE 1=1';
    for (const term of terms) {
      query += ' AND (p.search_text LIKE ? OR p.sales_pitch LIKE ?)';
      params.push(`%${term}%`, `%${term}%`);
    }
  }

  if (subcatFiltro === '__productos__') {
    query += " AND NOT (p.search_text LIKE '%accesorio%' OR p.search_text LIKE '%repuesto%' OR p.search_text LIKE '%pieza%' OR p.search_text LIKE '%kit%')";
  } else if (subcatFiltro === '__acc__') {
    query += " AND (p.search_text LIKE '%accesorio%' OR p.search_text LIKE '%repuesto%' OR p.search_text LIKE '%pieza%' OR p.search_text LIKE '%kit%')";
  }

  if (marcaFiltro && marcaFiltro !== 'Todas' && marcaFiltro !== '') {
    query += ' AND p.marca = ?';
    params.push(marcaFiltro);
  }

  if (subcatFiltro && subcatFiltro !== 'Todas' && subcatFiltro !== '__acc__' && subcatFiltro !== '__productos__') {
    query += ' AND p.subcategoria LIKE ?';
    params.push(`%${subcatFiltro}%`);
  }

  query += ' ORDER BY p.subcategoria ASC, p.sku ASC LIMIT 500';

  const results = await db.getAllAsync<ProductRow>(query, params);

  return results.map(r => ({
    modelo: r.sku, marca: r.marca, subcategoria: r.subcategoria,
    imagen: r.imagen, imagenOriginal: r.imagenOriginal,
    specs: r.specs_json ? JSON.parse(r.specs_json) : [],
    sales_pitch: r.sales_pitch || ''
  }));
}

export async function getUniqueBrands(): Promise<string[]> {
  const db = await getDB();
  const results = await db.getAllAsync<{ marca: string }>('SELECT DISTINCT marca FROM productos ORDER BY marca ASC');
  return results.map(r => r.marca).filter(Boolean);
}

export async function getProductsBySubcategory(substring: string, excludeAccessories = false): Promise<ParsedProduct[]> {
  const db = await getDB();
  let query = 'SELECT * FROM productos WHERE subcategoria LIKE ?';
  if (excludeAccessories) {
    query += " AND NOT (search_text LIKE '%accesorio%' OR search_text LIKE '%repuesto%' OR search_text LIKE '%pieza%' OR search_text LIKE '%kit%')";
  }
  const results = await db.getAllAsync<ProductRow>(query, [`%${substring}%`]);
  return results.map(r => ({
    modelo: r.sku,
    marca: r.marca,
    subcategoria: r.subcategoria,
    imagen: r.imagen,
    imagenOriginal: r.imagenOriginal,
    specs: r.specs_json ? JSON.parse(r.specs_json) : [],
    sales_pitch: r.sales_pitch || ''
  }));
}

export async function getProductBySku(sku: string): Promise<ParsedProduct | null> {
  const db = await getDB();
  const result = await db.getFirstAsync<ProductRow>('SELECT * FROM productos WHERE sku = ?', [sku]);
  if (!result) return null;
  return {
    modelo: result.sku,
    marca: result.marca,
    subcategoria: result.subcategoria,
    imagen: result.imagen,
    imagenOriginal: result.imagenOriginal,
    specs: result.specs_json ? JSON.parse(result.specs_json) : [],
    sales_pitch: result.sales_pitch || ''
  };
}

export async function fetchMissingProductFromCloud(sku: string): Promise<ParsedProduct | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${EDGE_URL}?sku=${encodeURIComponent(sku)}`, { headers });
    if (!res.ok) return null;
    const all = await res.json();
    
    // El edge ya debería haber filtrado y devuelto solo ese producto (o un array con 1 elemento)
    const dataArray = Array.isArray(all) ? all : [all];
    const p = dataArray.find((x: Product) => String(x.SKU || x.sku).trim().toLowerCase() === String(sku).trim().toLowerCase());
    if (!p) return null;
    
    const { data: ai } = await supabase.from('productos_ai_data').select('sales_pitch').eq('sku', sku).single();
    if (ai) p.sales_pitch = ai.sales_pitch;

    await insertProductsBatch([p], null, true);
    return await getProductBySku(sku);
  } catch (error) {
    console.warn(`[fetchMissingProductFromCloud] falló la sincronización puntual para ${sku}:`, error);
    return null;
  }
}

export async function getAllProducts(): Promise<ParsedProduct[]> {
  const db = await getDB();
  const results = await db.getAllAsync<ProductRow>('SELECT * FROM productos ORDER BY marca ASC, sku ASC');
  return results.map(r => ({
    modelo: r.sku,
    marca: r.marca,
    subcategoria: r.subcategoria,
    imagen: r.imagen,
    imagenOriginal: r.imagenOriginal,
    specs: r.specs_json ? JSON.parse(r.specs_json) : [],
    sales_pitch: r.sales_pitch || ''
  }));
}
