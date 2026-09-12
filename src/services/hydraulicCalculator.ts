import { ENGINEERING_CONSTANTS } from '../config/engineeringConstants';

export interface ParsedPumpSpecs {
  hpVal: number;
  maxCaudalLpm: number;
  maxAlturaMca: number;
  is220: boolean;
  is380: boolean;
  isEjeLibre: boolean;
}

export class HydraulicCalculator {

  /**
   * Parsea las specs crudas del producto (formato [clave, valor][]) a un
   * objeto tipado con las magnitudes hidráulicas/eléctricas relevantes.
   *
   * IMPORTANTE: esta es la ÚNICA implementación de este parseo. No duplicar
   * esta lógica en los componentes — si un componente necesita parsear specs,
   * debe llamar a este método.
   */
  public static parsePumpSpecs(
    product: any,
    extractNum: (val: string | null | undefined) => number | null,
  ): ParsedPumpSpecs {
    let maxCaudalLpm = 0;
    let maxAlturaMca = 0;
    let hpVal = 0;
    let is380 = false;
    let is220 = false;

    if (product.specs) {
      product.specs.forEach((s: any) => {
        const key = String(s[0]).toUpperCase();
        const valStr = String(s[1]).toUpperCase();

        if (key.includes('HP') || key.includes('POTENCIA')) {
          let n = extractNum(s[1]);
          if (n) {
            if (valStr.includes('KW')) n = n * 1.34;
            else if (valStr.includes(' W') || valStr.match(/\d+W/)) n = n * 0.00134;
            if (n > hpVal) hpVal = n;
          }
        }

        if (key.includes('CAUDAL') || key.includes('FLUJO')) {
          const nums = valStr.match(/([\d]+[\.,]?[\d]*)/g);
          if (nums) {
            const maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',', '.'))));
            const unitHint = valStr + ' ' + key;
            let valLpm = maxNum;
            if (unitHint.includes('M3/H') || unitHint.includes('M³/H') || unitHint.includes('M^3/H') || unitHint.includes('M3H')) {
              valLpm = (maxNum * 1000) / 60;
            } else if (unitHint.includes('L/H') || unitHint.includes('LT/H') || unitHint.includes('LTS/H')) {
              valLpm = maxNum / 60;
            } else if (unitHint.includes('L/S')) {
              valLpm = maxNum * 60;
            }
            if (valLpm > maxCaudalLpm) maxCaudalLpm = valLpm;
          }
        }

        if (key.includes('ALTURA') || key.includes('ELEVACIÓN') || key.includes('MCA') || key.includes('PRESIÓN') || key.includes('PRESION')) {
          const nums = valStr.match(/([\d]+[\.,]?[\d]*)/g);
          if (nums) {
            let maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',', '.'))));
            if (valStr.includes('BAR')) {
              maxNum = maxNum * ENGINEERING_CONSTANTS.CONVERSIONS.BAR_TO_MCA;
            }
            if (maxNum > maxAlturaMca) maxAlturaMca = maxNum;
          }
        }

        if (key.includes('VOLTAJE') || key.includes('TENSIÓN') || key.includes('ALIMENTACIÓN') || key.includes('FASE')) {
          if (valStr.includes('380') || valStr.includes('TRIF')) is380 = true;
          if (valStr.includes('220') || valStr.includes('MONO')) is220 = true;
        }
      });

      // Toma el HP MÁXIMO declarado entre todas las specs "PARA MOTOR X HP"
      // (un cuerpo de bomba puede listar varias combinaciones de motor compatible).
      let cuerpoHpReq = 0;
      product.specs.forEach((s: any) => {
        const match = String(s[1]).match(/PARA\s+MOTOR\s+([\d.,]+)\s*HP/i);
        if (match) {
          const m = parseFloat(match[1].replace(',', '.'));
          if (m > cuerpoHpReq) cuerpoHpReq = m;
        }
      });
      // Solo se usa como fallback: si ya se detectó HP explícito en las specs,
      // ese valor tiene prioridad sobre el requerimiento de motor del cuerpo.
      if (hpVal === 0 && cuerpoHpReq > 0) {
        hpVal = cuerpoHpReq;
      }
    }

    const modeloStr = String(product.modelo).toUpperCase();
    const subcatStr = String(product.subcategoria).toUpperCase();

    let isEjeLibreOrCombustion = modeloStr.includes('EJE LIBRE') || modeloStr.includes('SIN MOTOR');
    if (subcatStr.includes('CUERPO SUMERGIBLE')) isEjeLibreOrCombustion = true;
    if (subcatStr.includes('NAFTA') || subcatStr.includes('DIESEL')) isEjeLibreOrCombustion = true;
    if (product.specs && JSON.stringify(product.specs).toUpperCase().includes('COMBUSTIÓN')) isEjeLibreOrCombustion = true;

    if (!is220 && !is380 && !isEjeLibreOrCombustion) {
      if (hpVal <= ENGINEERING_CONSTANTS.ELECTRICAL.MONOPHASE_DEFAULT_HP_THRESHOLD) is220 = true;
      else is380 = true;
    }

    let isEjeLibre = modeloStr.includes('EJE LIBRE') || subcatStr.includes('EJE LIBRE')
      || modeloStr.includes('SIN MOTOR') || subcatStr.includes('SIN MOTOR')
      || subcatStr.includes('CUERPO SUMERGIBLE');
    if (!isEjeLibre && product.specs) {
      const allSpecsStr = JSON.stringify(product.specs).toUpperCase();
      if (allSpecsStr.includes('SIN MOTOR') || allSpecsStr.includes('EJE LIBRE')) {
        isEjeLibre = true;
      }
    }

    return { hpVal, maxCaudalLpm, maxAlturaMca, is220, is380, isEjeLibre };
  }

  public static validateHydraulics(parsed: ParsedPumpSpecs, targetHp: number, targetCaudalLpm: number, targetAlturaMca: number): boolean {
    const { hpVal, maxCaudalLpm, maxAlturaMca } = parsed;
    const effectiveHp = hpVal > 0 ? hpVal : (maxCaudalLpm > 0 && maxAlturaMca > 0 ? ((maxCaudalLpm * maxAlturaMca) / ENGINEERING_CONSTANTS.HYDRAULIC.BOMBA_HP_DIVISOR) : 0);

    if (targetHp > 0 && (effectiveHp === 0 || effectiveHp < targetHp * ENGINEERING_CONSTANTS.TOLERANCES.HP_MIN_FACTOR || effectiveHp > targetHp * ENGINEERING_CONSTANTS.TOLERANCES.HP_MAX_FACTOR)) return false;
    if (targetCaudalLpm > 0 && (maxCaudalLpm === 0 || maxCaudalLpm < targetCaudalLpm * ENGINEERING_CONSTANTS.TOLERANCES.CAUDAL_QMAX_MIN_FACTOR || maxCaudalLpm > targetCaudalLpm * ENGINEERING_CONSTANTS.TOLERANCES.CAUDAL_QMAX_MAX_FACTOR)) return false;
    if (targetAlturaMca > 0 && (maxAlturaMca === 0 || maxAlturaMca < targetAlturaMca * ENGINEERING_CONSTANTS.TOLERANCES.ALTURA_HMAX_MIN_FACTOR)) return false;

    if (targetCaudalLpm > 0 && targetAlturaMca > 0 && maxCaudalLpm > 0 && maxAlturaMca > 0) {
      if (targetCaudalLpm <= maxCaudalLpm) {
        const curvaH = maxAlturaMca * (1 - Math.pow(targetCaudalLpm / maxCaudalLpm, 2));
        if (curvaH < targetAlturaMca * ENGINEERING_CONSTANTS.TOLERANCES.CURVA_H_MIN_FACTOR) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  /**
   * Score único: incluye distancia de HP, distancia de caudal/altura,
   * bonus por coincidencia de fase y bonus por preferencia de marca/modelo.
   * No sumar estos factores de nuevo en el caller — esta función ya es el
   * cálculo completo del score.
   */
  public static calculateScore(specs: ParsedPumpSpecs, targetHp: number, targetCaudalLpm: number, targetAlturaMca: number, reqFase: string, modelName: string, preferences: string[] | undefined): number {
    let score = 0;
    if (targetHp > 0 && specs.hpVal > 0) score += Math.abs(specs.hpVal - targetHp) * ENGINEERING_CONSTANTS.SCORING.HP_DISTANCE_WEIGHT;
    if (specs.maxCaudalLpm > 0 && targetCaudalLpm > 0) score += Math.max(0, (specs.maxCaudalLpm - targetCaudalLpm) / targetCaudalLpm);
    if (specs.maxAlturaMca > 0 && targetAlturaMca > 0) score += Math.max(0, (specs.maxAlturaMca - targetAlturaMca) / targetAlturaMca);
    if (reqFase === '220v' && specs.is220) score -= ENGINEERING_CONSTANTS.SCORING.FASE_MATCH_BONUS;
    if (reqFase === '380v' && specs.is380) score -= ENGINEERING_CONSTANTS.SCORING.FASE_MATCH_BONUS;
    if (preferences && preferences.some(pr => modelName.toUpperCase().includes(pr))) score -= ENGINEERING_CONSTANTS.SCORING.PREFERENCE_MATCH_BONUS;
    return score;
  }

  public static validateFase(is220: boolean, is380: boolean, isEjeLibre: boolean, reqFase: string): boolean {
    if (reqFase === 'sinelec') return (!is220 && !is380) || isEjeLibre;
    if (reqFase === '220v') return is220 || isEjeLibre;
    if (reqFase === '380v') return is380 || isEjeLibre;
    return true;
  }
}
