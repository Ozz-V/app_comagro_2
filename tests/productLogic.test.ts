jest.mock('../src/utils/database', () => ({ searchProducts: jest.fn(), getDB: jest.fn(), getProductBySku: jest.fn(), insertProductsBatch: jest.fn() }));
import { extractPower } from '../src/utils/productLogic';

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
});
