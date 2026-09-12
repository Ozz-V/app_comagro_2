import { ENGINEERING_CONSTANTS } from '../config/engineeringConstants';

export interface ParsedPumpSpecs {
  hpVal: number;
  maxCaudalLpm: number;
  maxAlturaMca: number;
  is220: boolean;
  is380: boolean;
  isEjeLibre: boolean;
  isMotorOnly: boolean;
}

export class HydraulicCalculator {
  
  public static parsePumpSpecs(product: any, extractNum: (val: string | number) => number | null): ParsedPumpSpecs {
    let maxCaudalLpm = 0;
    let maxAlturaMca = 0;
    let hpVal = 0;
    let is380 = false;
    let is220 = false;
    let cuerpoHpReq = 0;

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
              const maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',','.'))));
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
              let maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',','.'))));
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
      
      product.specs.forEach((s: any) => {
          const match = String(s[1]).match(/PARA\s+MOTOR\s+([\d.,]+)\s*HP/i);
          if (match) {
             cuerpoHpReq = parseFloat(match[1].replace(',','.'));
          }
      });
    }

    if (cuerpoHpReq > 0) {
      hpVal = cuerpoHpReq;
    }

    const sub = String(product.subcategoria).toUpperCase();
    const isEjeLibre = sub.includes('EJE LIBRE') || sub.includes('SIN MOTOR') || sub.includes('CUERPO SUMERGIBLE');
    const isMotorOnly = sub.includes('MOTOR');

    if (!is380 && !is220 && !isEjeLibre && !isMotorOnly && hpVal >= ENGINEERING_CONSTANTS.ELECTRICAL.MONOPHASE_MAX_HP_WARNING) {
      is380 = true;
    }

    return { hpVal, maxCaudalLpm, maxAlturaMca, is220, is380, isEjeLibre, isMotorOnly };
  }

  public static validateHydraulics(parsed: ParsedPumpSpecs, targetHp: number, targetCaudalLpm: number, targetAlturaMca: number): boolean {
    const { hpVal, maxCaudalLpm, maxAlturaMca } = parsed;
    const effectiveHp = hpVal > 0 ? hpVal : (maxCaudalLpm > 0 && maxAlturaMca > 0 ? ((maxCaudalLpm * maxAlturaMca) / 3150) : 0);

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

  public static calculateScore(specs: ParsedPumpSpecs, targetHp: number, targetCaudalLpm: number, targetAlturaMca: number, reqFase: string, modelName: string, preferences: string[] | undefined): number {
    let score = 0;
    if (targetHp > 0 && specs.hpVal > 0) score += Math.abs(specs.hpVal - targetHp) * 3;
    if (specs.maxCaudalLpm > 0 && targetCaudalLpm > 0) score += Math.max(0, (specs.maxCaudalLpm - targetCaudalLpm) / targetCaudalLpm);
    if (specs.maxAlturaMca > 0 && targetAlturaMca > 0) score += Math.max(0, (specs.maxAlturaMca - targetAlturaMca) / targetAlturaMca);
    if (reqFase === '220v' && specs.is220) score -= 0.15;
    if (reqFase === '380v' && specs.is380) score -= 0.15;
    if (preferences && preferences.some(pr => modelName.toUpperCase().includes(pr))) score -= 0.3;
    return score;
  }
}
