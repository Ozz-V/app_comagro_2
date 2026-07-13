import * as SQLite from 'expo-sqlite';
import { initDB, searchProducts, getUniqueBrands, getProductBySku, clearProducts, insertProductsBatch } from '../src/utils/database';

jest.mock('expo-sqlite', () => {
  const mockDb = {
    execAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    withTransactionAsync: jest.fn(cb => cb()),
    runAsync: jest.fn(),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
  };
});

jest.mock('../src/supabase', () => ({ supabase: {}, EDGE_URL: 'mock' }));
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  return { ...rn, AppState: { addEventListener: jest.fn() } };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('Database utility', () => {
  let mockDb: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb = await SQLite.openDatabaseAsync('comagro.db');
  });

  describe('initDB', () => {
    it('creates tables and handles migrations', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { name: 'sku' },
        { name: 'search_text' },
        { name: 'sales_pitch' }
      ]);
      await initDB();
      expect(mockDb.execAsync).toHaveBeenCalled();
    });

    it('adds missing columns during migration', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { name: 'sku' } // missing search_text and sales_pitch
      ]);
      await initDB();
      expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE productos ADD COLUMN search_text TEXT;'));
      expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE productos ADD COLUMN sales_pitch TEXT;'));
    });
  });

  describe('CRUD operations', () => {
    it('clears products', async () => {
      await clearProducts();
      expect(mockDb.execAsync).toHaveBeenCalledWith('DELETE FROM productos;');
    });

    it('inserts products batch', async () => {
      const mockProducts = [
        { sku: '123', marca: 'BrandA', 'Tipo de Producto': 'CatA', 'Color': 'Red', sales_pitch: 'Buy me' }
      ];
      await insertProductsBatch(mockProducts as any[], null, false);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO productos'),
        expect.arrayContaining(['123', 'BRANDA', 'CATA', '', '', expect.stringContaining('Color'), expect.stringContaining('123 branda cata'), 'Buy me'])
      );
    });

    it('gets unique brands', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([{ marca: 'BRANDA' }, { marca: 'BRANDB' }]);
      const brands = await getUniqueBrands();
      expect(brands).toEqual(['BRANDA', 'BRANDB']);
    });

    it('searches products with text query', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([{ sku: '123', specs_json: '[]' }]);
      const res = await searchProducts('Todas', 'Todas', 'test query');
      expect(res).toHaveLength(1);
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('LIKE'), expect.any(Array));
    });

    it('searches products with regular filters', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([{ sku: '123', specs_json: '[]' }]);
      const res = await searchProducts('BrandA', 'CatA', '');
      expect(res).toHaveLength(1);
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('marca = ?'), expect.any(Array));
    });

    it('gets product by sku', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ sku: '123', specs_json: '[]' });
      const res = await getProductBySku('123');
      expect(res).not.toBeNull();
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('sku = ?'), ['123']);
    });

    it('returns null if product not found by sku', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      const res = await getProductBySku('999');
      expect(res).toBeNull();
    });

    it('gets all products', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([{ sku: '111', marca: 'A', specs_json: '[]' }]);
      const { getAllProducts } = require('../src/utils/database');
      const res = await getAllProducts();
      expect(res).toHaveLength(1);
      expect(res[0].modelo).toBe('111');
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM productos'));
    });

    it('fetches missing product from cloud and inserts it', async () => {
      const mockSession = { data: { session: { access_token: 'fake' } } };
      const { supabase } = require('../src/supabase');
      supabase.auth = { getSession: jest.fn().mockResolvedValue(mockSession) };
      supabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { sales_pitch: 'AI pitch' } })
          })
        })
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ sku: 'missing123', marca: 'brand' }])
      });

      mockDb.getFirstAsync.mockResolvedValueOnce({ sku: 'missing123', specs_json: '[]' }); // For the getProductBySku call at the end

      const { fetchMissingProductFromCloud } = require('../src/utils/database');
      const res = await fetchMissingProductFromCloud('missing123');
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sku=missing123'), expect.any(Object));
      expect(res).not.toBeNull();
      expect(res?.modelo).toBe('missing123');
    });

    it('returns null if fetchMissingProductFromCloud fails fetch', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const { fetchMissingProductFromCloud } = require('../src/utils/database');
      const res = await fetchMissingProductFromCloud('bad_sku');
      expect(res).toBeNull();
    });
  });
});
