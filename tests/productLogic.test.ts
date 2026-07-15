jest.mock('../src/utils/database', () => ({ searchProducts: jest.fn(), getDB: jest.fn(), getProductBySku: jest.fn(), insertProductsBatch: jest.fn() }));
import { extractPower, findSimilarProducts } from '../src/utils/productLogic';

describe('productLogic', () => {
  describe('extractPower', () => {
    it('returns null if specs are undefined', () => {
      expect(extractPower(undefined)).toBeNull();
    });

    it('extracts HP power correctly', () => {
      expect(extractPower([['Potencia', '3 hp']])).toBe(3);
      expect(extractPower([['Power', '1.5 HP']])).toBe(1.5);
      expect(extractPower([['Potencia', '2']])).toBe(2);
    });

    it('extracts kW and converts to HP', () => {
      expect(extractPower([['Potencia', '1 kw']])).toBeCloseTo(1.34102);
      expect(extractPower([['Power', '2.2 kW']])).toBeCloseTo(2.950244);
    });

    it('extracts W and converts to HP', () => {
      expect(extractPower([['Power', '1000 w']])).toBeCloseTo(1.34102);
    });

    it('returns null if no power spec is found', () => {
      expect(extractPower([['Color', 'Rojo'], ['Peso', '10 kg']])).toBeNull();
    });
  });

  describe('findSimilarProducts', () => {
    it('returns empty if modalProd is null', async () => {
      const res = await findSimilarProducts(null);
      expect(res.similares).toEqual([]);
      expect(res.mismaMarca).toEqual([]);
    });

    it('finds similar by power', async () => {
      const mockSearch = require('../src/utils/database').searchProducts;
      mockSearch.mockResolvedValueOnce([
        { modelo: 'A', specs: [['Potencia', '2 hp']] },
        { modelo: 'B', specs: [['Potencia', '3 hp']] }, // close
        { modelo: 'C', specs: [['Potencia', '10 hp']] } // far
      ]);
      mockSearch.mockResolvedValueOnce([
        { modelo: 'A' }, { modelo: 'B' }
      ]);
      
      const res = await findSimilarProducts({ modelo: 'M', subcategoria: 'Sub', marca: 'Brand', specs: [['Potencia', '2 hp']], imagen: '', imagenOriginal: '', sales_pitch: '' });
      expect(res.similares).toHaveLength(2);
      expect(res.similares[0].modelo).toBe('A');
      expect(res.similares[1].modelo).toBe('B');
      expect(res.mismaMarca).toHaveLength(2);
    });

    it('finds similar without power', async () => {
      const mockSearch = require('../src/utils/database').searchProducts;
      mockSearch.mockResolvedValueOnce([
        { modelo: 'A', specs: [['Color', 'Red']] },
        { modelo: 'B', specs: [['Color', 'Blue']] }
      ]);
      mockSearch.mockResolvedValueOnce([]);
      
      const res = await findSimilarProducts({ modelo: 'M', subcategoria: 'Sub', marca: 'Brand', specs: [['Color', 'Green']], imagen: '', imagenOriginal: '', sales_pitch: '' });
      expect(res.similares).toHaveLength(2);
    });
  });
});
