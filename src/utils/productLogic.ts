import { searchProducts } from './database';
import { ParsedProduct } from '../types';

export const extractPower = (specs: [string, string][] | undefined): number | null => {
  if (!specs) return null;
  const specArray = specs;
  for (const [k, v] of specArray) {
    const kl = String(k).toLowerCase();
    const vl = String(v).toLowerCase();
    
    const match = vl.match(/([\d.,]+)\s*(hp|kva|kw|w)\b/i);
    let unit = match ? match[2].toLowerCase() : null;
    let numStr = match ? match[1] : null;

    if (!match) {
      const numMatch = vl.match(/^([\d.,]+)$/);
      if (numMatch) {
        if (kl.includes('hp')) { unit = 'hp'; numStr = numMatch[1]; }
        else if (kl.includes('kva')) { unit = 'kva'; numStr = numMatch[1]; }
        else if (kl.includes('kw')) { unit = 'kw'; numStr = numMatch[1]; }
        else if (kl.includes('potencia')) { unit = 'hp'; numStr = numMatch[1]; }
      }
    }

    if (unit && numStr) {
      let val = parseFloat(numStr.replace(',', '.'));
      if (unit === 'kw') val = val * 1.34102;
      else if (unit === 'w') val = (val / 1000) * 1.34102;
      return val;
    }
  }
  return null;
};

export const findSimilarProducts = async (modalProd: ParsedProduct | null) => {
  if (!modalProd) return { similares: [], mismaMarca: [] };

  let similares: ParsedProduct[] = [];
  let mismaMarca: ParsedProduct[] = [];

  try {
    const baseList = await searchProducts('Todas', modalProd.subcategoria, '');
    const targetPower = extractPower(modalProd.specs);
    
    if (targetPower !== null) {
      similares = baseList.filter((p) => p.modelo !== modalProd.modelo).map((p) => {
        const pPower = extractPower(p.specs);
        return { ...p, pPower };
      }).filter((p) => {
        if (p.pPower === null) return false;
        return p.pPower >= targetPower * 0.5 && p.pPower <= targetPower * 1.5;
      }).map((p) => {
        const diff = Math.abs((p.pPower as number) - targetPower);
        return { ...p, diff };
      }).sort((a, b) => a.diff - b.diff).slice(0, 8);
    } else {
      similares = baseList.filter((p) => p.modelo !== modalProd.modelo).slice(0, 8);
    }
  } catch (e: unknown) {}

  try {
    const brandList = await searchProducts(modalProd.marca, 'Todas', '');
    mismaMarca = brandList.filter((p) => p.modelo !== modalProd.modelo).slice(0, 20);
  } catch (e: unknown) {}

  return { similares, mismaMarca };
};
