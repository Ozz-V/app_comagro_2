import * as SQLite from 'expo-sqlite';
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

  // Verificar si existe un esquema viejo (sin columna 'sku', 'search_text' o 'sales_pitch')
  const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(productos)');
  const hasSkuColumn = tableInfo.some((col) => col.name === 'sku');
  const hasSearchTextColumn = tableInfo.some((col) => col.name === 'search_text');
  const hasSalesPitchColumn = tableInfo.some((col) => col.name === 'sales_pitch');

  if (tableInfo.length > 0 && (!hasSkuColumn || !hasSearchTextColumn || !hasSalesPitchColumn)) {
    console.log('Esquema antiguo detectado. Migrando...');
    await db.execAsync('DROP TABLE IF EXISTS productos;');
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem('comagro_productos_fecha_v3');
    } catch (e: unknown) {}
  }

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

    for (const p of productosArray) {
      const pSku = p.SKU || p.sku;
      if (!pSku) continue;

      const sku = String(pSku).trim();
      const marca = (p.Brand || p.Marca || p.marca || '').toString().trim().toUpperCase();
      const subcategoria = (p['Tipo de Producto'] || p['Categoria Magento'] || 'General').toString().trim().toUpperCase();
      const imagenOriginal = (p['imagen 1'] || p.imagen || '').toString().trim();
      const imagen = (manifest && manifest[sku + '.jpg']) || imagenOriginal;

      const specs: [string, string][] = [];
      // Solo excluimos columnas estructurales de la BD y sales_pitch.
      // El resto lo controla el usuario desde Plytix.
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
          // Excluir vacíos, valores cero, y textos basura
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

export async function searchProducts(marcaFiltro: string, subcatFiltro: string, textoBusqueda: string): Promise<ParsedProduct[]> {
  const db = await getDB();

  let query = 'SELECT * FROM productos WHERE 1=1';
  const params: string[] = [];

  if (marcaFiltro && marcaFiltro !== 'Todas' && marcaFiltro !== '') {
    query += ' AND UPPER(marca) = UPPER(?)';
    params.push(marcaFiltro);
  }

  if (subcatFiltro && subcatFiltro !== 'Todas') {
    if (subcatFiltro === '__acc__') {
      query += " AND (search_text LIKE '%accesorio%' OR search_text LIKE '%repuesto%' OR search_text LIKE '%pieza%' OR search_text LIKE '%kit%')";
    } else if (subcatFiltro === '__productos__') {
      query += " AND NOT (search_text LIKE '%accesorio%' OR search_text LIKE '%repuesto%' OR search_text LIKE '%pieza%' OR search_text LIKE '%kit%')";
    } else {
      query += ' AND subcategoria LIKE ?';
      params.push(`%${subcatFiltro}%`);
    }
  }

  if (textoBusqueda && textoBusqueda.trim().length > 0) {
    const terminos = textoBusqueda.trim().toLowerCase().split(' ').filter(t => t.length > 0);
    terminos.forEach(term => {
      query += ' AND search_text LIKE ?';
      params.push(`%${term}%`);
    });
  }

  query += ' ORDER BY subcategoria ASC, sku ASC LIMIT 500';

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

    const res = await fetch(EDGE_URL, { headers });
    if (!res.ok) return null;
    const all = await res.json();
    
    const p = all.find((x: Product) => String(x.SKU || x.sku).trim().toLowerCase() === String(sku).trim().toLowerCase());
    if (!p) return null;
    
    const { data: ai } = await supabase.from('productos_ai_data').select('sales_pitch').eq('sku', sku).single();
    if (ai) p.sales_pitch = ai.sales_pitch;

    await insertProductsBatch([p], null, true);
    return await getProductBySku(sku);
  } catch (e: unknown) {
    console.log('Error fetchMissingProductFromCloud:', e);
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
