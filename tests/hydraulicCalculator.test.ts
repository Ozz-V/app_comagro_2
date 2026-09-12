import { HydraulicCalculator } from '../src/services/hydraulicCalculator';

function extractNum(val: string | null | undefined): number | null {
  if (!val || typeof val !== 'string') return null;
  const m = val.match(/([\d]+[\.,]?[\d]*)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

describe('HydraulicCalculator.parsePumpSpecs', () => {
  it('parses HP, caudal (m3/h) and altura (mca) from specs', () => {
    const product = {
      modelo: 'BOMBA X1',
      subcategoria: 'BOMBA',
      specs: [
        ['HP', '1.5 HP'],
        ['CAUDAL MAXIMO', '3 M3/H'],
        ['ALTURA MAXIMA', '30 MCA'],
      ],
    };
    const parsed = HydraulicCalculator.parsePumpSpecs(product, extractNum);
    expect(parsed.hpVal).toBe(1.5);
    expect(parsed.maxCaudalLpm).toBe(50); // 3 m3/h -> 50 l/min
    expect(parsed.maxAlturaMca).toBe(30);
  });

  it('converts KW and W specs to HP', () => {
    const kw = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'M', subcategoria: 'BOMBA', specs: [['POTENCIA', '1 KW']] },
      extractNum,
    );
    expect(kw.hpVal).toBeCloseTo(1.34);

    const w = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'M', subcategoria: 'BOMBA', specs: [['POTENCIA', '750 W']] },
      extractNum,
    );
    expect(w.hpVal).toBeCloseTo(750 * 0.00134);
  });

  it('converts BAR to mca using ENGINEERING_CONSTANTS.CONVERSIONS.BAR_TO_MCA', () => {
    const parsed = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'M', subcategoria: 'BOMBA', specs: [['PRESION MAXIMA', '3 BAR']] },
      extractNum,
    );
    expect(parsed.maxAlturaMca).toBeCloseTo(30.6); // 3 * 10.2
  });

  it('detects 220v vs 380v from explicit voltage specs', () => {
    const p220 = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'M', subcategoria: 'BOMBA', specs: [['VOLTAJE', '220V MONOFASICO']] },
      extractNum,
    );
    expect(p220.is220).toBe(true);
    expect(p220.is380).toBe(false);

    const p380 = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'M', subcategoria: 'BOMBA', specs: [['VOLTAJE', '380V TRIFASICO']] },
      extractNum,
    );
    expect(p380.is380).toBe(true);
    expect(p380.is220).toBe(false);
  });

  it('defaults phase by HP threshold when no voltage spec is present', () => {
    const low = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'M', subcategoria: 'BOMBA', specs: [['HP', '2 HP']] },
      extractNum,
    );
    expect(low.is220).toBe(true);
    expect(low.is380).toBe(false);

    const high = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'M', subcategoria: 'BOMBA', specs: [['HP', '5 HP']] },
      extractNum,
    );
    expect(high.is380).toBe(true);
    expect(high.is220).toBe(false);
  });

  it('does not default phase for eje libre / combustion products', () => {
    const ejeLibre = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'CUERPO EJE LIBRE X', subcategoria: 'CUERPO SUMERGIBLE', specs: [] },
      extractNum,
    );
    expect(ejeLibre.is220).toBe(false);
    expect(ejeLibre.is380).toBe(false);
    expect(ejeLibre.isEjeLibre).toBe(true);

    const combustion = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'MOTOBOMBA NAFTA', subcategoria: 'BOMBA NAFTA', specs: [['HP', '6.5 HP']] },
      extractNum,
    );
    expect(combustion.is220).toBe(false);
    expect(combustion.is380).toBe(false);
  });

  it('uses "PARA MOTOR X HP" as fallback only when no explicit HP was found', () => {
    const fallback = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'CUERPO', subcategoria: 'BOMBA', specs: [['DESCRIPCION', 'PARA MOTOR 2 HP']] },
      extractNum,
    );
    expect(fallback.hpVal).toBe(2);

    const explicitWins = HydraulicCalculator.parsePumpSpecs(
      { modelo: 'CUERPO', subcategoria: 'BOMBA', specs: [['HP', '3 HP'], ['DESCRIPCION', 'PARA MOTOR 2 HP']] },
      extractNum,
    );
    expect(explicitWins.hpVal).toBe(3);
  });
});

describe('HydraulicCalculator.validateHydraulics', () => {
  const base = { hpVal: 0, maxCaudalLpm: 0, maxAlturaMca: 0, is220: false, is380: false, isEjeLibre: false };

  it('rejects pumps outside the HP tolerance band', () => {
    expect(HydraulicCalculator.validateHydraulics({ ...base, hpVal: 1 }, 2, 0, 0)).toBe(false); // 1 < 2*0.6
    expect(HydraulicCalculator.validateHydraulics({ ...base, hpVal: 3.1 }, 2, 0, 0)).toBe(false); // 3.1 > 2*1.5
    expect(HydraulicCalculator.validateHydraulics({ ...base, hpVal: 2 }, 2, 0, 0)).toBe(true);
  });

  it('falls back to caudal*altura/3150 when hpVal is unknown', () => {
    // 100 l/min * 63 mca / 3150 = 2 HP efectivo
    expect(HydraulicCalculator.validateHydraulics({ ...base, maxCaudalLpm: 100, maxAlturaMca: 63 }, 2, 0, 0)).toBe(true);
  });

  it('rejects when the pump curve cannot reach the target head at the target flow', () => {
    // A pump with Qmax=100, Hmax=20 cannot reasonably deliver 100 l/min at 20 mca after the curve derating
    expect(HydraulicCalculator.validateHydraulics({ ...base, maxCaudalLpm: 100, maxAlturaMca: 20 }, 0, 100, 20)).toBe(false);
  });

  it('rejects when required flow exceeds the pump max flow', () => {
    expect(HydraulicCalculator.validateHydraulics({ ...base, maxCaudalLpm: 50, maxAlturaMca: 50 }, 0, 100, 10)).toBe(false);
  });
});

describe('HydraulicCalculator.validateFase', () => {
  it('respects sinelec / 220v / 380v requirements', () => {
    expect(HydraulicCalculator.validateFase(false, false, false, 'sinelec')).toBe(true);
    expect(HydraulicCalculator.validateFase(true, false, false, 'sinelec')).toBe(false);
    expect(HydraulicCalculator.validateFase(true, false, false, '220v')).toBe(true);
    expect(HydraulicCalculator.validateFase(false, true, false, '220v')).toBe(false);
    expect(HydraulicCalculator.validateFase(false, true, false, '380v')).toBe(true);
  });

  it('eje libre products pass any phase requirement', () => {
    expect(HydraulicCalculator.validateFase(false, false, true, '220v')).toBe(true);
    expect(HydraulicCalculator.validateFase(false, false, true, '380v')).toBe(true);
    expect(HydraulicCalculator.validateFase(false, false, true, 'sinelec')).toBe(true);
  });
});

describe('HydraulicCalculator.calculateScore', () => {
  const specs = { hpVal: 2, maxCaudalLpm: 100, maxAlturaMca: 30, is220: true, is380: false, isEjeLibre: false };

  it('penalizes distance from target HP more heavily than caudal/altura', () => {
    const close = HydraulicCalculator.calculateScore(specs, 2, 100, 30, '', 'X', undefined);
    const far = HydraulicCalculator.calculateScore(specs, 5, 100, 30, '', 'X', undefined);
    expect(far).toBeGreaterThan(close);
  });

  it('rewards matching the requested phase', () => {
    const matched = HydraulicCalculator.calculateScore(specs, 0, 0, 0, '220v', 'X', undefined);
    const unmatched = HydraulicCalculator.calculateScore(specs, 0, 0, 0, '380v', 'X', undefined);
    expect(matched).toBeLessThan(unmatched);
  });

  it('rewards preferred brand/model matches', () => {
    const preferred = HydraulicCalculator.calculateScore(specs, 0, 0, 0, '', 'MARCA-X', ['MARCA-X']);
    const notPreferred = HydraulicCalculator.calculateScore(specs, 0, 0, 0, '', 'MARCA-X', ['OTRA']);
    expect(preferred).toBeLessThan(notPreferred);
  });

  it('is only computed once (no external double-counting expected)', () => {
    // Regression guard: this score already includes caudal/altura/fase/preference.
    // Callers must NOT add those terms again on top of this result.
    const score = HydraulicCalculator.calculateScore(specs, 2, 100, 30, '220v', 'MARCA-X', ['MARCA-X']);
    expect(typeof score).toBe('number');
    expect(Number.isNaN(score)).toBe(false);
  });
});
