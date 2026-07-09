import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return _db;
}

export async function initDB(): Promise<SQLite.SQLiteDatabase> {
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

    CREATE VIRTUAL TABLE IF NOT EXISTS productos_fts USING fts5(
      sku, search_text, sales_pitch,
      content='productos', content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS productos_ai AFTER INSERT ON productos BEGIN
      INSERT INTO productos_fts(rowid, sku, search_text, sales_pitch) 
      VALUES (new.rowid, new.sku, new.search_text, new.sales_pitch);
    END;

    CREATE TRIGGER IF NOT EXISTS productos_ad AFTER DELETE ON productos BEGIN
      INSERT INTO productos_fts(productos_fts, rowid, sku, search_text, sales_pitch) 
      VALUES ('delete', old.rowid, old.sku, old.search_text, old.sales_pitch);
    END;

    CREATE TRIGGER IF NOT EXISTS productos_au AFTER UPDATE ON productos BEGIN
      INSERT INTO productos_fts(productos_fts, rowid, sku, search_text, sales_pitch) 
      VALUES ('delete', old.rowid, old.sku, old.search_text, old.sales_pitch);
      INSERT INTO productos_fts(rowid, sku, search_text, sales_pitch) 
      VALUES (new.rowid, new.sku, new.search_text, new.sales_pitch);
    END;
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

  // Reconstruir FTS5 por si hubo migraciones incrementales
  try {
    await db.execAsync("INSERT INTO productos_fts(productos_fts) VALUES('rebuild');");
  } catch (e) {
    console.log('Error rebuilding FTS', e);
  }

  return db;
}

export async function clearProducts(): Promise<void> {
  const db = await getDB();
  await db.execAsync('DELETE FROM productos;');
}

export async function insertProductsBatch(productosArray: Product[], manifest: Record<string, string> | null, isDelta = false): Promise<void> {
  const db = await getDB();

  await db.withTransactionAsync(async () => {
    if (!isDelta) {
      await db.execAsync('DELETE FROM productos;');
    }

    let count = 0;
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

      // Yield al hilo principal para evitar congelamiento de la interfaz (Anti-Jank)
      count++;
      if (count % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  });
}

export async function searchProducts(marcaFiltro: string, subcatFiltro: string, textoBusqueda: string): Promise<ParsedProduct[]> {
  const db = await getDB();

  let query = '';
  const params: string[] = [];
  let useFts = false;
  let matchClauses: string[] = [];

  if (textoBusqueda && textoBusqueda.trim().length > 0) {
    useFts = true;
    const terminos = textoBusqueda.trim().replace(/["']/g, '').split(' ').filter(t => t.length > 0);
    if (terminos.length > 0) {
      // Búsqueda por prefijo para FTS5
      matchClauses.push(terminos.map(t => `"${t}"*`).join(' AND '));
    }
  }

  if (subcatFiltro === '__acc__') {
    useFts = true;
    matchClauses.push('(accesorio OR repuesto OR pieza OR kit)');
  }

  if (useFts) {
    query = 'SELECT p.* FROM productos p JOIN productos_fts f ON p.rowid = f.rowid WHERE 1=1';
    if (matchClauses.length > 0) {
      query += ' AND productos_fts MATCH ?';
      params.push(matchClauses.map(c => `(${c})`).join(' AND '));
    }
    if (subcatFiltro === '__productos__') {
      query += " AND NOT (productos_fts MATCH '(accesorio OR repuesto OR pieza OR kit)')";
    }
  } else {
    query = 'SELECT * FROM productos WHERE 1=1';
    if (subcatFiltro === '__productos__') {
      query += " AND NOT (search_text LIKE '%accesorio%' OR search_text LIKE '%repuesto%' OR search_text LIKE '%pieza%' OR search_text LIKE '%kit%')";
    }
  }

  if (marcaFiltro && marcaFiltro !== 'Todas' && marcaFiltro !== '') {
    // COLLATE NOCASE index takes care of case-insensitivity
    query += (useFts ? ' AND p.marca = ?' : ' AND marca = ?');
    params.push(marcaFiltro);
  }

  if (subcatFiltro && subcatFiltro !== 'Todas' && subcatFiltro !== '__acc__' && subcatFiltro !== '__productos__') {
    query += (useFts ? ' AND p.subcategoria LIKE ?' : ' AND subcategoria LIKE ?');
    params.push(`%${subcatFiltro}%`);
  }

  query += (useFts ? ' ORDER BY p.subcategoria ASC, p.sku ASC LIMIT 500' : ' ORDER BY subcategoria ASC, sku ASC LIMIT 500');

  const results = await db.getAllAsync<ProductRow>(query, params);

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
