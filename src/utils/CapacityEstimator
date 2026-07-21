// src/utils/CapacityEstimator.ts
//
// Texto de "Estimación rápida" de la Calculadora (generadores, motores y
// bombas). 100% local, sin red y sin IA: cálculo matemático + tablas de
// referencia de la industria. Reemplaza el enfoque anterior (rangos
// arbitrarios) y el de IA (costo de API, depende de internet).
//
// Si el equipo técnico pide ajustar un umbral, se edita ACÁ, en un solo
// lugar, con la derivación documentada al lado de cada número — no hay
// que tocar el componente de UI.

// ─────────────────────────────────────────────────────────────────────────
// GENERADORES (KVA)
// ─────────────────────────────────────────────────────────────────────────
//
// Base matemática:
//   - Factor de potencia típico de un grupo electrógeno: 0.8
//     → KW útiles reales = KVA * 0.8
//   - Un generador soporta carga continua hasta ~sus KW útiles, y puede
//     tolerar picos breves (arranque de motores) hasta aprox. su KVA
//     nominal en VA instantáneos.
//   - Los aires acondicionados que consideramos acá son SPLIT ESTÁNDAR,
//     NO inverter: el compresor arranca consumiendo 2.5-3x su consumo en
//     régimen. Ese pico es lo que realmente limita si un generador chico
//     puede "levantar" un aire, más que el consumo en uso normal.
//
// Consumos de referencia (uso / pico de arranque):
//   Luz LED:            10W   / —
//   TV+Notebook+WiFi:    150W  / —
//   Heladera chica:      100W  / 300W
//   Heladera grande:     200W  / 600W
//   Aire 9.000 BTU:      750W  / 1.900W
//   Aire 12.000 BTU:    1.100W / 2.800W
//   Aire 18.000 BTU:    1.600W / 4.000W
//
// Con esos números, los cortes de abajo son el resultado de sumar cargas
// típicas de una casa + el pico del motor más grande, y ver a partir de
// qué KVA la suma entra dentro de la capacidad del generador.
export function estimateGenerador(kva: number): string {
  if (kva < 2) {
    return 'Cargas livianas sin motor: algunas luces, cargadores, TV chica, notebook, router WiFi.';
  }
  if (kva < 4) {
    return 'Luces, TV, electrónica, y una heladera chica. Sin aire acondicionado: el pico de arranque del compresor supera lo que puede sostener.';
  }
  if (kva < 6) {
    return 'Heladera, luces, TV, y un aire acondicionado chico (hasta 9.000 BTU). No alcanza todavía para un aire de 12.000 BTU o más en simultáneo con el resto.';
  }
  if (kva < 9) {
    return 'Heladera, luces, TV, y un aire acondicionado de hasta 12.000 BTU. Para un aire de 18.000 BTU con el resto de la casa, se necesita más capacidad.';
  }
  if (kva <= 15) {
    return 'Una casa completa: heladera, luces, TV, y un aire acondicionado de hasta 18.000 BTU funcionando junto con el resto de las cargas.';
  }
  if (kva <= 50) {
    return 'Locales comerciales medianos, oficinas con varios aires acondicionados, servidores y cámaras frigoríficas.';
  }
  if (kva <= 250) {
    return 'Uso industrial liviano: fábricas pequeñas, supermercados completos, estaciones de servicio, edificios residenciales enteros.';
  }
  if (kva <= 1000) {
    return 'Uso industrial pesado: centros comerciales, hospitales, grandes fábricas, frigoríficos industriales.';
  }
  return 'Gran escala: industrias electrointensivas, minería, respaldo para barrios enteros o centros de datos masivos.';
}

// ─────────────────────────────────────────────────────────────────────────
// MOTORES ELÉCTRICOS (HP)
// ─────────────────────────────────────────────────────────────────────────
//
// A diferencia del generador y la bomba, acá no hay una fórmula física
// limpia que derive "HP → tipo de máquina": qué equipo usa qué potencia es
// una convención de la industria, no algo que se calcule. Es una tabla de
// referencia, y así se lo dejamos documentado.
export function estimateMotor(hp: number): string {
  if (hp <= 1) return 'Hormigoneras chicas, cortadoras de fiambre, portones eléctricos residenciales, ventiladores grandes.';
  if (hp <= 3) return 'Compresores medianos, sierras circulares, tornos pequeños, cintas transportadoras livianas.';
  if (hp <= 10) return 'Amasadoras industriales, elevadores de autos, extractores pesados, trituradoras medianas, bombas centrífugas grandes.';
  if (hp <= 50) return 'Maquinaria industrial de planta, cintas transportadoras largas, molinos, prensas hidráulicas pesadas.';
  if (hp <= 200) return 'Industria pesada, grandes compresores de planta, trituradoras de piedra, maquinaria minera liviana.';
  return 'Uso extremo: industria naviera, minería pesada, bombas de acueductos, grandes molinos industriales.';
}

// ─────────────────────────────────────────────────────────────────────────
// BOMBAS DE AGUA (HP + tipo)
// ─────────────────────────────────────────────────────────────────────────
//
// Por qué NO calculamos con caudal/altura reales: las specs de los
// productos vienen en unidades mezcladas (m³/h, L/min, L/h) y muchos
// productos no publican caudal o altura completos. En vez de una fórmula
// hidráulica poco confiable por datos incompletos, usamos la convención
// de la industria: para cada tipo de bomba, qué es lo típico a cada
// potencia. Es una tabla de referencia por (tipo, HP) — igual que
// motores, pero separada por tipo porque el mismo HP rinde muy distinto
// según sea periférica, sumergible de pozo, drenaje o piscina.
export type TipoBomba = 'hogar' | 'pozo' | 'drenaje' | 'piscina' | 'combustion';

const TABLA_BOMBA: Record<TipoBomba, { hasta: number; texto: string }[]> = {
  hogar: [
    { hasta: 1, texto: 'Uso doméstico: llenado de tanques hasta 15m de altura, riego de jardines chicos, circulación de agua.' },
    { hasta: 3, texto: 'Uso residencial/comercial: presurización de edificios de 3 a 5 pisos, riego por aspersión mediano, llenado rápido de piscinas.' },
    { hasta: 10, texto: 'Edificios altos (más de 10 pisos), riego agrícola por goteo o aspersión en superficies medianas.' },
    { hasta: Infinity, texto: 'Uso industrial: torres de refrigeración, sistemas de presurización de gran escala.' },
  ],
  pozo: [
    { hasta: 1, texto: 'Pozos poco profundos, uso doméstico de agua subterránea a baja profundidad.' },
    { hasta: 3, texto: 'Pozos artesianos de profundidad media, abastecimiento de agua para una casa o finca chica.' },
    { hasta: 10, texto: 'Pozos profundos, abastecimiento agrícola o de varias viviendas.' },
    { hasta: Infinity, texto: 'Extracción de pozos artesianos muy profundos, abastecimiento industrial o de acueductos.' },
  ],
  drenaje: [
    { hasta: 1, texto: 'Achique doméstico: vaciar piscinas chicas, sótanos, desagotes livianos.' },
    { hasta: 3, texto: 'Desagote de aguas cloacales o pluviales en volumen medio, obras chicas.' },
    { hasta: 10, texto: 'Sistemas contra incendios pequeños, drenaje de obras o plantas de tamaño mediano.' },
    { hasta: Infinity, texto: 'Drenaje industrial de gran volumen, sistemas contra incendios industriales, drenaje de minas.' },
  ],
  piscina: [
    { hasta: 1, texto: 'Recirculación de filtro para piscinas domésticas chicas o medianas.' },
    { hasta: 3, texto: 'Recirculación de filtro para piscinas grandes o de uso semi-comercial.' },
    { hasta: Infinity, texto: 'Piscinas de uso comercial o público, con alto volumen de recirculación.' },
  ],
  combustion: [
    { hasta: 3, texto: 'Riego agrícola chico, achique de obra, uso portátil donde no hay electricidad.' },
    { hasta: 10, texto: 'Riego agrícola mediano, abastecimiento de agua en zonas rurales sin electricidad.' },
    { hasta: Infinity, texto: 'Riego agrícola de gran escala, trasvase de agua en volumen alto para uso rural o de obra.' },
  ],
};

export function estimateBomba(hp: number, tipo: TipoBomba): string {
  const tabla = TABLA_BOMBA[tipo] || TABLA_BOMBA.hogar;
  const match = tabla.find((r) => hp <= r.hasta);
  return match ? match.texto : tabla[tabla.length - 1].texto;
}
