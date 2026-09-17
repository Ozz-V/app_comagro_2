import { interpolateFriction, FRICCION_ROWS, FRICCION_DIAMS } from '../src/utils/frictionLogic';

describe('interpolateFriction', () => {
  it('interpola linealmente entre dos caudales conocidos', () => {
    // Diámetro índice 0 ("3/4""): filas 1 -> 7.5 y 1.5 -> 16
    const result = interpolateFriction(1.25, 0);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo((7.5 + 16) / 2, 5);
  });

  it('devuelve el valor exacto y status "ok" cuando el caudal coincide con una fila', () => {
    const result = interpolateFriction(1, 0);
    expect(result.status).toBe('ok');
    expect(result.value).toBe(7.5);
  });

  it('devuelve el primer valor disponible con status "below" si el caudal pedido es menor al mínimo tabulado', () => {
    const result = interpolateFriction(0.1, 0);
    expect(result.status).toBe('below');
    expect(result.value).toBe(7.5);
  });

  it('devuelve el último valor disponible con status "above" si el caudal excede el máximo tabulado', () => {
    // Diámetro índice 0: el último valor no-null es la fila 45 -> 100
    const result = interpolateFriction(9999, 0);
    expect(result.status).toBe('above');
    expect(result.value).toBe(100);
  });

  it('devuelve "sin-datos" si el diámetro no tiene ningún valor tabulado', () => {
    // índice 12 (última columna, "12\"") solo tiene un valor no-null (fila 500 -> 1.2)
    // probamos un índice fuera de rango para forzar el caso realmente vacío
    const result = interpolateFriction(10, 99);
    expect(result.status).toBe('sin-datos');
    expect(result.value).toBeNull();
  });

  it('ignora las filas sin dato (null) para ese diámetro al interpolar', () => {
    // Diámetro índice 5 ("2.1/2\""): las filas 1 y 1.5 no tienen dato (null);
    // el primer valor real aparece en la fila 2 -> 0.07.
    const result = interpolateFriction(1, 5);
    expect(result.status).toBe('below');
    expect(result.value).toBe(0.07);
  });

  it('las tablas de referencia tienen la forma esperada (una columna por diámetro)', () => {
    FRICCION_ROWS.forEach(([, valores]) => {
      expect(valores.length).toBe(FRICCION_DIAMS.length);
    });
  });
});
