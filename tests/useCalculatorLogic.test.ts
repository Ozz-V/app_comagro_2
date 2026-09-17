import { renderHook, act } from '@testing-library/react-native';
import { useCalculatorLogic } from '../src/hooks/useCalculatorLogic';
import { getProductsBySubcategory } from '../src/utils/database';
import { isCatalogSyncing, subscribeToCatalogUpdates } from '../src/services/catalogService';

jest.mock('expo-sqlite', () => ({}));
jest.mock('../src/supabase', () => ({ supabase: {}, EDGE_URL: 'mock' }));
jest.mock('../src/utils/database');
jest.mock('../src/services/catalogService', () => ({
  isCatalogSyncing: jest.fn(() => false),
  subscribeToCatalogUpdates: jest.fn(() => jest.fn()),
}));
jest.mock('../src/hooks/useRules', () => ({
  useRules: jest.fn(() => ({})),
}));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('../src/config/engineeringConstants', () => ({ ENGINEERING_CONSTANTS: {} }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

describe('useCalculatorLogic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProductsBySubcategory as jest.Mock).mockResolvedValue([]);
  });

  // ── stepHp: saltos lógicos de HP ──────────────────────────────────
  describe('stepHp', () => {
    it('sube de a 0.5 por debajo de 3 HP (camino feliz)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      expect(result.current.stepHp(1, 'up')).toBe(1.5);
    });

    it('sube de a 5 entre 10 y 50 HP', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      expect(result.current.stepHp(20, 'up')).toBe(25);
    });

    it('sube de a 10 por encima de 50 HP', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      expect(result.current.stepHp(60, 'up')).toBe(70);
    });

    it('no baja de 0 (caso límite)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      expect(result.current.stepHp(0.5, 'down')).toBe(0);
      expect(result.current.stepHp(0, 'down')).toBe(0);
    });
  });

  // ── handleGenUnitChange: conversión KVA <-> Amperios ──────────────
  describe('handleGenUnitChange', () => {
    it('convierte KVA a AMPER en trifásico 380V (camino feliz)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setCalcInput('10');
        result.current.setGenUnit('KVA');
      });
      await act(async () => {
        result.current.handleGenUnitChange('AMPER');
      });
      // 10 KVA a 380V trifásico ≈ 15.19 A
      expect(parseFloat(result.current.calcInput)).toBeCloseTo(15.19, 1);
      expect(result.current.genUnit).toBe('AMPER');
    });

    it('convierte KVA a AMPER en monofásico 220V', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setGenFase('220v');
        result.current.setCalcInput('5');
      });
      await act(async () => {
        result.current.handleGenUnitChange('AMPER');
      });
      // 5 KVA a 220V ≈ 22.73 A
      expect(parseFloat(result.current.calcInput)).toBeCloseTo(22.73, 1);
    });

    it('no convierte si el input está vacío (caso límite)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setCalcInput('');
      });
      await act(async () => {
        result.current.handleGenUnitChange('AMPER');
      });
      expect(result.current.calcInput).toBe('');
      expect(result.current.genUnit).toBe('AMPER');
    });

    it('no hace nada si ya está en la unidad pedida', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setCalcInput('42');
        result.current.setGenUnit('KVA');
      });
      await act(async () => {
        result.current.handleGenUnitChange('KVA');
      });
      expect(result.current.calcInput).toBe('42');
    });
  });

  // ── handleUnitChange: conversión de unidades de caudal ────────────
  describe('handleUnitChange', () => {
    it('convierte l/min a m³/h (camino feliz)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setPumpWizard({ ...result.current.pumpWizard, caudal: '100', unidadCaudal: 'l/min' });
      });
      await act(async () => {
        result.current.handleUnitChange('m³/h');
      });
      // 100 l/min = 6 m3/h
      expect(parseFloat(result.current.pumpWizard.caudal)).toBeCloseTo(6, 1);
      expect(result.current.pumpWizard.unidadCaudal).toBe('m³/h');
    });

    it('no convierte si el caudal está vacío (caso límite)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setPumpWizard({ ...result.current.pumpWizard, caudal: '', unidadCaudal: 'l/min' });
      });
      await act(async () => {
        result.current.handleUnitChange('l/h');
      });
      expect(result.current.pumpWizard.caudal).toBe('');
      expect(result.current.pumpWizard.unidadCaudal).toBe('l/h');
    });
  });

  // ── advResults: pérdida de carga por fricción (modo avanzado) ─────
  describe('advResults (cálculo hidráulico avanzado)', () => {
    it('devuelve todo en cero cuando no está en la pestaña avanzada', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      expect(result.current.advResults).toEqual({ hTotal: 0, perdida: 0, lTotal: 0, status: 'ok' });
    });

    it('calcula hTotal y lTotal a partir del caudal y la altura geométrica (camino feliz)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setBombaTab('avanzado');
      });
      await act(async () => {
        result.current.setAdv({
          caudal: '10', diamIdx: 4, lRecta: '20', hGeo: '5',
          acc: [0, 0, 0, 0, 0, 0], unidadCaudal: 'm³/h',
        });
      });
      // hTotal siempre debe ser >= hGeo (la fricción solo suma, nunca resta altura)
      expect(result.current.advResults.hTotal).toBeGreaterThanOrEqual(5);
      expect(result.current.advResults.lTotal).toBe(20);
    });

    it('reporta longitud total mayor a la recta cuando hay accesorios (codos, válvulas)', async () => {
      const { result } = await renderHook(() => useCalculatorLogic(true, jest.fn(), mockNavigation));
      await act(async () => {
        result.current.setBombaTab('avanzado');
      });
      await act(async () => {
        result.current.setAdv({
          caudal: '10', diamIdx: 4, lRecta: '20', hGeo: '5',
          acc: [2, 0, 0, 0, 0, 0], // 2 codos de 90°
          unidadCaudal: 'm³/h',
        });
      });
      expect(result.current.advResults.lTotal).toBeGreaterThan(20);
    });
  });
});
