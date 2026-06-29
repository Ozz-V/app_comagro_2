import * as SQLite from 'expo-sqlite';

const DB_NAME = 'comagro.db';

export async function initDB() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS productos (
      sku TEXT PRIMARY KEY,
      marca TEXT,
      subcategoria TEXT,
      imagen TEXT,
      imagenOriginal TEXT,
      specs_json TEXT,
      search_text TEXT
    );
  `);
  return db;
}

export async function clearProducts() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`DELETE FROM productos;`);
}

export async function insertProductsBatch(productosArray, manifest) {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  
  await db.withTransactionAsync(async () => {
    await db.execAsync(`DELETE FROM productos;`);
    
    for (const p of productosArray) {
      if (!p.SKU) continue;
      
      const sku = String(p.SKU).trim();
      const marca = (p.Brand || p.Marca || '').toString().trim().toUpperCase();
      const subcategoria = (p['Tipo de Producto'] || p['Categoria Magento'] || 'General').toString().trim().toUpperCase();
      const imagenOriginal = (p['imagen 1'] || p.imagen || '').toString().trim();
      const imagen = (manifest && manifest[sku + '.jpg']) || imagenOriginal;
      
      const specs = [];
      const colsExcluidas = new Set([
        'SKU','imagen 1','imagen 2','imagen 3','imagen 4','imagen 5',
        'Brand','Marca','id','ID','Tipo de Producto','Categoria Magento',
        'url_key','visibility','status','price','Precio'
      ]);
      const basura = ['n/a','na','n.a','n.a.','no aplica','sin dato','sin datos',
        'no','no tiene','no disponible','pim','-','--','---','st','sin información',
        'no corresponde','sin especificar','sin info'];
        
      for (const [col, val] of Object.entries(p)) {
        if (!colsExcluidas.has(col) && !col.startsWith('_')) {
          const s = String(val).trim().toLowerCase();
          if (s.length > 0 && !/^0([.,]0+)?$/.test(s) && !basura.includes(s)) {
            specs.push([col, String(val).trim()]);
          }
        }
      }
      
      const specsJson = JSON.stringify(specs);
      const searchText = `${sku} ${marca} ${subcategoria} ${specs.map(s => s[1]).join(' ')}`.toLowerCase();
      
      await db.runAsync(
        'INSERT INTO productos (sku, marca, subcategoria, imagen, imagenOriginal, specs_json, search_text) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sku, marca, subcategoria, imagen, imagenOriginal, specsJson, searchText]
      );
    }
  });
}

export async function searchProducts(marcaFiltro, subcatFiltro, textoBusqueda) {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  
  let query = 'SELECT * FROM productos WHERE 1=1';
  const params = [];
  
  if (marcaFiltro && marcaFiltro !== 'Todas') {
    query += ' AND marca = ?';
    params.push(marcaFiltro);
  }
  
  if (subcatFiltro && subcatFiltro !== 'Todas') {
    if (subcatFiltro === '__acc__') {
      query += " AND (subcategoria LIKE '%ACCESORIO%' OR subcategoria LIKE '%REPUESTO%' OR subcategoria LIKE '%PIEZA%' OR subcategoria LIKE '%KIT%')";
    } else if (subcatFiltro === '__productos__') {
      query += " AND NOT (subcategoria LIKE '%ACCESORIO%' OR subcategoria LIKE '%REPUESTO%' OR subcategoria LIKE '%PIEZA%' OR subcategoria LIKE '%KIT%')";
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
  
  query += ' LIMIT 100'; 
  
  const results = await db.getAllAsync(query, params);
  
  return results.map(r => ({
    modelo: r.sku,
    marca: r.marca,
    subcategoria: r.subcategoria,
    imagen: r.imagen,
    imagenOriginal: r.imagenOriginal,
    specs: JSON.parse(r.specs_json)
  }));
}

export async function getUniqueBrands() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const results = await db.getAllAsync('SELECT DISTINCT marca FROM productos ORDER BY marca ASC');
  return results.map(r => r.marca).filter(Boolean);
}

export async function getProductsBySubcategory(substring) {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const results = await db.getAllAsync('SELECT * FROM productos WHERE subcategoria LIKE ?', [`%${substring}%`]);
  return results.map(r => ({
    modelo: r.sku,
    marca: r.marca,
    subcategoria: r.subcategoria,
    imagen: r.imagen,
    imagenOriginal: r.imagenOriginal,
    specs: JSON.parse(r.specs_json)
  }));
}

export async function getProductBySku(sku) {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const result = await db.getFirstAsync('SELECT * FROM productos WHERE sku = ?', [sku]);
  if (!result) return null;
  return {
    modelo: result.sku,
    marca: result.marca,
    subcategoria: result.subcategoria,
    imagen: result.imagen,
    imagenOriginal: result.imagenOriginal,
    specs: JSON.parse(result.specs_json)
  };
}

export async function getAllProducts() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const results = await db.getAllAsync('SELECT * FROM productos');
  return results.map(r => ({
    modelo: r.sku,
    marca: r.marca,
    subcategoria: r.subcategoria,
    imagen: r.imagen,
    imagenOriginal: r.imagenOriginal,
    specs: JSON.parse(r.specs_json)
  }));
}
