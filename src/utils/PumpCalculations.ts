// src/utils/PumpCalculations.js

/**
 * Convierte un string de caudal (ej. "3 m3/h", "3000 l/h", "50 l/min") a L/min numérico.
 */
export function normalizeCaudal(caudalStr: any) {
  if (!caudalStr) return 0;
  const s = caudalStr.toString().toLowerCase();
  const num = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  if (s.includes('m3/h')) return (num * 1000) / 60;
  if (s.includes('l/h')) return num / 60;
  if (s.includes('l/s')) return num * 60;
  return num; // asumimos L/min por defecto
}

/**
 * Convierte un string de presión/altura (ej. "3 bar", "45 psi", "30 m") a m.c.a numérico.
 */
export function normalizeMca(mcaStr: any) {
  if (!mcaStr) return 0;
  const s = mcaStr.toString().toLowerCase();
  const num = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  if (s.includes('bar')) return num * 10;
  if (s.includes('psi')) return num * 0.703;
  return num; // asumimos m.c.a o metros por defecto
}

/**
 * Calcula los requerimientos para Bombas de Hogar / Superficie
 * @param {object} params - { appType, tankHeight, tankVolume, fillTimeMin, showers, floors }
 * @returns {object} { targetMca, targetFlow, typeDesc }
 */
export function calcSuperficie(params: any) {
  let targetMca = 0;
  let targetFlow = 0;
  
  if (params.appType === 'tanque') {
    // 20% fricción tuberías + altura
    targetMca = params.tankHeight ? (parseFloat(params.tankHeight) || 0) * 1.2 : 0;
    // Caudal = Litros / Minutos
    const vol = parseFloat(params.tankVolume) || 0;
    const time = parseFloat(params.fillTimeMin) || 0;
    if (vol > 0 && time > 0) targetFlow = vol / time;
    else if (vol > 0) targetFlow = vol / 30; // 30 min por defecto si solo pone volumen
  } else if (params.appType === 'presurizacion') {
    // 1 ducha = 12 l/min aprox
    const showers = parseFloat(params.showers) || 0;
    if (showers > 0) targetFlow = showers * 12;
    
    // 1 piso = 3m aprox. Queremos presurizar al menos 15 mca arriba de la ducha más alta.
    const floors = parseFloat(params.floors) || 0;
    if (floors > 0) targetMca = (floors * 3) + 15; 
  }

  return { targetMca, targetFlow, typeDesc: 'Bombas Periféricas o Centrífugas' };
}

/**
 * Calcula los requerimientos para Bombas Sumergibles de Pozo
 */
export function calcPozo(params: any) {
  // Nivel dinámico del agua + margen de bombeo
  const depth = parseFloat(params.depth) || 0;
  const targetMca = depth > 0 ? depth + 20 : 0; // Queremos que tire con buena presión arriba
  
  const flowH = parseFloat(params.flowHour) || 0;
  const targetFlow = flowH > 0 ? flowH / 60 : 0; 

  return { targetMca, targetFlow, diameterLimit: params.diameter, typeDesc: 'Bombas Sumergibles (Bala/Inyector)' };
}

/**
 * Calcula los requerimientos para Bombas de Drenaje / Achique
 */
export function calcDrenaje(params: any) {
  // Distancia vertical/horizontal. Horizontal cuenta como 1/10 de la vertical.
  const distVert = parseFloat(params.distVert) || 0;
  const distHoriz = parseFloat(params.distHoriz) || 0;
  const targetMca = (distVert > 0 || distHoriz > 0) ? (distVert + (distHoriz * 0.1) + 5) : 0;
  
  // Drenaje suele necesitar mucho caudal, pero si no especifican, dejamos a que filter por maxH
  const targetFlow = 0;

  return { targetMca, targetFlow, waterType: params.waterType, typeDesc: 'Bombas de Achique / Drenaje' };
}

