import { normalizeCaudal, normalizeMca, calcSuperficie, calcPozo, calcDrenaje } from '../src/utils/PumpCalculations';

describe('PumpCalculations', () => {
  describe('normalizeCaudal', () => {
    it('normalizes various flow units to L/min', () => {
      expect(normalizeCaudal('3 m3/h')).toBe(50);
      expect(normalizeCaudal('3000 l/h')).toBe(50);
      expect(normalizeCaudal('50 l/s')).toBe(3000);
      expect(normalizeCaudal('50')).toBe(50);
      expect(normalizeCaudal('')).toBe(0);
      expect(normalizeCaudal(null)).toBe(0);
    });
  });

  describe('normalizeMca', () => {
    it('normalizes various pressure units to m.c.a.', () => {
      expect(normalizeMca('3 bar')).toBe(30);
      expect(normalizeMca('45 psi')).toBeCloseTo(31.635);
      expect(normalizeMca('30 m')).toBe(30);
      expect(normalizeMca('30')).toBe(30);
      expect(normalizeMca('')).toBe(0);
    });
  });

  describe('calcSuperficie', () => {
    it('calculates requirements for a tank correctly', () => {
      const result = calcSuperficie({ appType: 'tanque', tankHeight: 10, tankVolume: 300, fillTimeMin: 15 });
      expect(result.targetMca).toBe(12); // 10 * 1.2
      expect(result.targetFlow).toBe(20); // 300 / 15
    });

    it('calculates requirements for pressurization correctly', () => {
      const result = calcSuperficie({ appType: 'presurizacion', showers: 2, floors: 2 });
      expect(result.targetMca).toBe(21); // (2 * 3) + 15
      expect(result.targetFlow).toBe(24); // 2 * 12
    });
  });

  describe('calcPozo', () => {
    it('calculates requirements for a well pump', () => {
      const result = calcPozo({ depth: 50, flowHour: 6000, diameter: '4' });
      expect(result.targetMca).toBe(70); // 50 + 20
      expect(result.targetFlow).toBe(100); // 6000 / 60
      expect(result.diameterLimit).toBe('4');
    });
  });

  describe('calcDrenaje', () => {
    it('calculates requirements for a drainage pump', () => {
      const result = calcDrenaje({ distVert: 10, distHoriz: 50, waterType: 'sucia' });
      expect(result.targetMca).toBe(20); // 10 + (50 * 0.1) + 5
      expect(result.targetFlow).toBe(0);
      expect(result.waterType).toBe('sucia');
    });
  });
});
