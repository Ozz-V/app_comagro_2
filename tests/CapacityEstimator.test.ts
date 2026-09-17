import { estimateGenerador, estimateMotor, estimateBomba } from '../src/utils/CapacityEstimator';

describe('CapacityEstimator', () => {
  // ── estimateGenerador: cortes por KVA ─────────────────────────────
  describe('estimateGenerador', () => {
    it('cargas livianas sin motor por debajo de 2 KVA', () => {
      expect(estimateGenerador(1)).toContain('sin motor');
    });

    it('sin aire acondicionado entre 2 y 4 KVA', () => {
      expect(estimateGenerador(3)).toContain('Sin aire acondicionado');
    });

    it('aire chico (9.000 BTU) entre 4 y 6 KVA', () => {
      expect(estimateGenerador(5)).toContain('9.000 BTU');
    });

    it('aire hasta 12.000 BTU entre 6 y 9 KVA', () => {
      expect(estimateGenerador(8)).toContain('12.000 BTU');
    });

    it('casa completa con aire de 18.000 BTU entre 9 y 15 KVA (límite inclusive)', () => {
      expect(estimateGenerador(15)).toContain('18.000 BTU');
    });

    it('local comercial mediano entre 15 y 50 KVA (límite inclusive)', () => {
      expect(estimateGenerador(50)).toContain('comerciales medianos');
    });

    it('industrial liviano entre 50 y 250 KVA (límite inclusive)', () => {
      expect(estimateGenerador(250)).toContain('industrial liviano');
    });

    it('industrial pesado entre 250 y 1000 KVA (límite inclusive)', () => {
      expect(estimateGenerador(1000)).toContain('industrial pesado');
    });

    it('gran escala por encima de 1000 KVA', () => {
      expect(estimateGenerador(1500)).toContain('Gran escala');
    });

    it('maneja el límite exacto de cada corte sin caer en el rango de abajo', () => {
      expect(estimateGenerador(2)).toContain('Luces, TV, electrónica');
      expect(estimateGenerador(4)).toContain('9.000 BTU');
      expect(estimateGenerador(6)).toContain('12.000 BTU');
      expect(estimateGenerador(9)).toContain('18.000 BTU');
    });
  });

  // ── estimateMotor: tabla de referencia por HP ─────────────────────
  describe('estimateMotor', () => {
    it('hormigoneras chicas hasta 1 HP (límite inclusive)', () => {
      expect(estimateMotor(1)).toContain('Hormigoneras chicas');
    });

    it('compresores medianos entre 1 y 3 HP (límite inclusive)', () => {
      expect(estimateMotor(3)).toContain('Compresores medianos');
    });

    it('amasadoras industriales entre 3 y 10 HP (límite inclusive)', () => {
      expect(estimateMotor(10)).toContain('Amasadoras industriales');
    });

    it('maquinaria de planta entre 10 y 50 HP (límite inclusive)', () => {
      expect(estimateMotor(50)).toContain('Maquinaria industrial de planta');
    });

    it('industria pesada entre 50 y 200 HP (límite inclusive)', () => {
      expect(estimateMotor(200)).toContain('Industria pesada');
    });

    it('uso extremo por encima de 200 HP', () => {
      expect(estimateMotor(500)).toContain('Uso extremo');
    });
  });

  // ── estimateBomba: tabla por (tipo, HP) ───────────────────────────
  describe('estimateBomba', () => {
    it('hogar: uso doméstico hasta 1 HP', () => {
      expect(estimateBomba(1, 'hogar')).toContain('llenado de tanques');
    });

    it('hogar: presurización de edificios entre 1 y 3 HP', () => {
      expect(estimateBomba(2, 'hogar')).toContain('presurización de edificios');
    });

    it('hogar: industrial por encima del último corte (Infinity)', () => {
      expect(estimateBomba(999, 'hogar')).toContain('industrial');
    });

    it('pozo: pozos poco profundos hasta 1 HP', () => {
      expect(estimateBomba(1, 'pozo')).toContain('Pozos poco profundos');
    });

    it('pozo: abastecimiento agrícola por encima de 3 HP', () => {
      expect(estimateBomba(5, 'pozo')).toContain('Pozos profundos');
    });

    it('drenaje: achique doméstico hasta 1 HP', () => {
      expect(estimateBomba(0.5, 'drenaje')).toContain('Achique doméstico');
    });

    it('piscina: no tiene corte en 10, usa el de Infinity', () => {
      expect(estimateBomba(10, 'piscina')).toContain('uso comercial o público');
    });

    it('combustion: no tiene corte en 1, usa el primero definido (hasta 3)', () => {
      expect(estimateBomba(1, 'combustion')).toContain('Riego agrícola chico');
    });

    it('combustion: gran escala por encima de 10 HP', () => {
      expect(estimateBomba(20, 'combustion')).toContain('gran escala');
    });

    it('tipo desconocido cae al fallback de "hogar"', () => {
      // @ts-expect-error probamos el fallback con un tipo inválido a propósito
      expect(estimateBomba(1, 'no-existe')).toBe(estimateBomba(1, 'hogar'));
    });
  });
});
