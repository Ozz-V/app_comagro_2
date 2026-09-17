export const ENGINEERING_CONSTANTS = {
  CONVERSIONS: {
    BAR_TO_MCA: 10.2,
  },
  TOLERANCES: {
    // Filtro final (post-scoring), usado en HydraulicCalculator.validateHydraulics
    HP_MIN_FACTOR: 0.60,
    HP_MAX_FACTOR: 1.50,
    CAUDAL_QMAX_MIN_FACTOR: 0.60,
    CAUDAL_QMAX_MAX_FACTOR: 4.0,
    ALTURA_HMAX_MIN_FACTOR: 0.60,
    CURVA_H_MIN_FACTOR: 0.65,
    // Pre-filtro por uso (más laxo, corre antes del filtro final de arriba)
    HP_PREFILTER_MIN_FACTOR: 0.4,
    HP_PREFILTER_MAX_FACTOR: 2.2,
  },
  ELECTRICAL: {
    // Umbral para sugerir cambiar a Trifásico en la UI (warning al usuario)
    MONOPHASE_MAX_HP_WARNING: 3.5,
    // Umbral usado para inferir 220v/380v cuando el producto no declara tensión explícita.
    // A propósito distinto de MONOPHASE_MAX_HP_WARNING: no unificar sin revisar ambos usos.
    MONOPHASE_DEFAULT_HP_THRESHOLD: 3,
  },
  HYDRAULIC: {
    // HP ≈ (Caudal[l/min] * Altura[mca]) / BOMBA_HP_DIVISOR
    BOMBA_HP_DIVISOR: 3150,
  },
  SCORING: {
    HP_DISTANCE_WEIGHT: 3,
    FASE_MATCH_BONUS: 0.15,
    PREFERENCE_MATCH_BONUS: 0.3,
  },
};
