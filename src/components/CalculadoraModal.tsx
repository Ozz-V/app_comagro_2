import * as Sentry from '@sentry/react-native';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput, FlatList, StyleSheet, ActivityIndicator, Keyboard, Alert } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';
import SvgIcon from './SvgIcon';
import { getProductsBySubcategory } from '../utils/database';
import { isCatalogSyncing, subscribeToCatalogUpdates } from '../services/catalogService';
import { estimateGenerador, estimateMotor } from '../utils/CapacityEstimator';
import { ParsedProduct, CalcProduct, PumpWizardState, SpecTuple } from '../types';
import { FRICCION_DIAMS, FIT_HEADERS, FIT_ROWS, interpolateFriction } from '../utils/frictionLogic';

interface CalculadoraModalProps {
  visible: boolean;
  onClose: () => void;
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; [key: string]: unknown };
}

type ExtendedCalcProduct = CalcProduct & {
  score?: number;
  displayValue?: string;
  isSinAltura?: boolean;
  pairedSku?: string; // SKU asociado
};

const USOS = [
  { id: 'vivienda', title: 'Vivienda / uso general', subtitle: 'Hogares, presurización, piletas y pozos domésticos.', tipos: ['BOMBA DE AGUA','MOTOBOMBA CENTRÍFUGA','MOTOBOMBA AUTOCEBANTE','BOMBAS ELECTRICAS CON INVERSOR', 'MOTOBOMBA VIBRATORIA', 'BOMBA PARA PISCINA', 'MOTOBOMBA RECIRCULADORA', 'ELECTROBOMBA SUMERGIBLE MONOBLOQUE'] },
  { id: 'riego_presion', title: 'Alta presión / industrial', subtitle: 'Procesos industriales, sistemas de gran caudal y riego agrícola.', tipos: ['BOMBA DE AGUA','MOTOBOMBA CENTRÍFUGA','MOTOBOMBA AUTOCEBANTE','BOMBA A COMBUSTIÓN', 'MOTOBOMBA VIBRATORIA', 'CUERPO SUMERGIBLE', 'ELECTROBOMBAS SUMERGIDAS MULTIETAPAS'], pref: ['MULTIETAPAS','MEGANORM','SPY','BIROTOR','CENTRÍFUGA EJE LIBRE'] },
  { id: 'pozo', title: 'Pozo / napa subterránea', subtitle: 'Extracción profunda de napas, desde artesianos hasta usos industriales.', tipos: ['ELECTROBOMBA SUMERGIBLE MONOBLOQUE','ELECTROBOMBAS SUMERGIDAS MULTIETAPAS','MOTOBOMBA SUMERGIBLE DE TORNILLO','MOTOBOMBA INYECTORA','BOMBA SUMERGIBLE SOLAR', 'CUERPO SUMERGIBLE'] },
  { id: 'drenaje', title: 'Agua sucia / desagote', subtitle: 'Drenaje de sótanos, aguas servidas y achique de obras.', tipos: ['BOMBA DE DRENAJE','BOMBA DE ACHIQUE'] },
  { id: 'combustion', title: 'Sin electricidad en el lugar', subtitle: 'Equipos a combustión para zonas sin red eléctrica.', tipos: ['BOMBA A COMBUSTIÓN'], forzarCombustible: true }
];

export default function CalculadoraModal({ visible, onClose, navigation }: CalculadoraModalProps) {
  const [calcMode, setCalcMode] = useState('');
  const [calcInput, setCalcInput] = useState('');
  const [bombaTab, setBombaTab] = useState<'guiado' | 'avanzado'>('guiado');
  const [wizardStep, setWizardStep] = useState(1);
  const [pumpWizard, setPumpWizard] = useState<PumpWizardState>({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '' });
  
  const [adv, setAdv] = useState({ caudal: '', diamIdx: 4, lRecta: '', hGeo: '', acc: [0,0,0,0,0,0], unidadCaudal: 'l/min' as 'l/min' | 'm3/h' | 'l/h' });

  const [calcResult, setCalcResult] = useState<ExtendedCalcProduct[] | null>(null);
  const [motorResult, setMotorResult] = useState<ExtendedCalcProduct[] | null>(null);
  const [motorResultTitle, setMotorResultTitle] = useState('Motores Sugeridos (Eje Libre):');
  const [hasCalculated, setHasCalculated] = useState(false);
  const [waitingForCatalog, setWaitingForCatalog] = useState(false);
  
  // Pre-read stats
  const [catStats, setCatStats] = useState<{maxQ: number, maxH: number} | null>(null);
  const [motorWarning, setMotorWarning] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setHasCalculated(false);
      setCalcResult(null);
      setMotorResult(null);
      setCalcInput('');
      setCalcMode('');
      setWaitingForCatalog(false);
      setBombaTab('guiado');
      setWizardStep(1);
      setPumpWizard({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '' });
      setAdv({ caudal: '', diamIdx: 4, lRecta: '', hGeo: '', acc: [0,0,0,0,0,0], unidadCaudal: 'l/min' });
      setCatStats(null);
      setMotorWarning(null);
    }
  }, [visible]);

  function extractNum(val: string | null | undefined): number | null {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/([\d]+[\.,]?[\d]*)/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.'));
  }

  const { hTotal, perdida, lEquiv, lTotal, status } = useMemo(() => {
    if (bombaTab !== 'avanzado') return { hTotal: 0, perdida: 0, lEquiv: 0, lTotal: 0, status: 'ok' };
    const q = parseFloat(adv.caudal) || 0;
    const lRecta = parseFloat(adv.lRecta) || 0;
    const hGeo = parseFloat(adv.hGeo) || 0;
    
    const { value: loss100, status } = interpolateFriction(q, adv.diamIdx);
    const fitRow = FIT_ROWS[adv.diamIdx + 1];
    
    let lAcc = 0;
    adv.acc.forEach((qty, i) => {
      lAcc += qty * fitRow[1][i];
    });
    
    const lTot = lRecta + lAcc;
    const pFric = loss100 !== null ? (lTot * loss100) / 100 : 0;
    const hTot = hGeo + pFric;
    
    return { hTotal: hTot, perdida: pFric, lEquiv: lAcc, lTotal: lTot, status };
  }, [adv, bombaTab]);

  // Extract specs accurately
  function parsePumpSpecs(p: ParsedProduct) {
     let maxCaudalLpm = 0;
     let maxAlturaMca = 0;
     let hpVal = 0;
     let is380 = false;
     let is220 = false;

     if (p.specs) {
       p.specs.forEach((s: SpecTuple) => {
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
               // La unidad puede venir escrita en el VALOR ("180 L/MIN") o en
               // el propio nombre de la columna de Plytix ("Caudal (m3/h)"),
               // según cómo esté cargado cada producto. Miramos los dos
               // lugares para no asumir L/min por error cuando en realidad
               // es m3/h o L/h (eso hacía que bombas quedaran mal calculadas
               // por un factor de hasta 60x).
               const unitHint = valStr + ' ' + key;
               let valLpm = maxNum; // default: L/min (o sin unidad detectada)
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

         if (key.includes('ALTURA') || key.includes('ELEVACIÓN') || key.includes('MCA')) {
            const nums = valStr.match(/([\d]+[\.,]?[\d]*)/g);
            if (nums) {
               const maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',','.'))));
               if (maxNum > maxAlturaMca) maxAlturaMca = maxNum;
            }
         }
         
         if (key.includes('VOLTAJE') || key.includes('TENSIÓN') || key.includes('ALIMENTACIÓN') || key.includes('FASE')) {
            if (valStr.includes('380') || valStr.includes('TRIF')) is380 = true;
            if (valStr.includes('220') || valStr.includes('MONO')) is220 = true;
         }
       });
     }
     
      let isEjeLibreOrCombustion = String(p.modelo).toUpperCase().includes('EJE LIBRE') || String(p.modelo).toUpperCase().includes('SIN MOTOR');
      const subcatStr = String(p.subcategoria).toUpperCase();
      if (subcatStr.includes('NAFTA') || subcatStr.includes('DIESEL')) isEjeLibreOrCombustion = true;
      if (p.specs && JSON.stringify(p.specs).toUpperCase().includes('COMBUSTIÓN')) isEjeLibreOrCombustion = true;

      if (!is220 && !is380 && !isEjeLibreOrCombustion) {
         if (hpVal <= 3) is220 = true;
         else is380 = true;
      }

      let isEjeLibre = String(p.modelo).toUpperCase().includes('EJE LIBRE') || String(p.subcategoria).toUpperCase().includes('EJE LIBRE') || String(p.modelo).toUpperCase().includes('SIN MOTOR') || String(p.subcategoria).toUpperCase().includes('SIN MOTOR');
      if (!isEjeLibre && p.specs) {
          const allSpecsStr = JSON.stringify(p.specs).toUpperCase();
          if (allSpecsStr.includes('SIN MOTOR') || allSpecsStr.includes('EJE LIBRE')) {
              isEjeLibre = true;
          }
      }

      return { hpVal, maxCaudalLpm, maxAlturaMca, is220, is380, isEjeLibre };
  }

  // Pre-read stats effect
  useEffect(() => {
    if (wizardStep === 2 && calcMode === 'bomba' && pumpWizard.uso) {
      setStatsLoading(true);
      const usoConf = USOS.find(u => u.id === pumpWizard.uso);
      getProductsBySubcategory('BOMBA', true).then(dbProducts => {
         let mxQ = 0;
         let mxH = 0;
         dbProducts.forEach(p => {
            const sub = String(p.subcategoria).toUpperCase();
            const nom = String(p.modelo).toUpperCase();
            if (usoConf && usoConf.tipos.some(t => sub.includes(t) || nom.includes(t))) {
               const specs = parsePumpSpecs(p as ParsedProduct);
               if (specs.maxCaudalLpm > mxQ) mxQ = specs.maxCaudalLpm;
               if (specs.maxAlturaMca > mxH) mxH = specs.maxAlturaMca;
            }
         });
         setCatStats({maxQ: mxQ, maxH: mxH});
         setStatsLoading(false);
      }).catch(e => {
         setStatsLoading(false);
         console.error(e);
      });
    }
  }, [wizardStep, pumpWizard.uso, calcMode]);

  const handleUnitChange = (newUnit: 'l/min' | 'm3/h' | 'l/h') => {
    const currentVal = parseFloat(pumpWizard.caudal);
    if (!currentVal || isNaN(currentVal)) {
       setPumpWizard({...pumpWizard, unidadCaudal: newUnit});
       return;
    }
    let valLpm = currentVal;
    if (pumpWizard.unidadCaudal === 'm3/h') valLpm = currentVal * (1000/60);
    else if (pumpWizard.unidadCaudal === 'l/h') valLpm = currentVal / 60;

    let newVal = valLpm;
    if (newUnit === 'm3/h') newVal = valLpm / (1000/60);
    else if (newUnit === 'l/h') newVal = valLpm * 60;

    const newValStr = Number.isInteger(newVal) ? newVal.toString() : newVal.toFixed(2).replace(/\.00$/, '');
    setPumpWizard({...pumpWizard, unidadCaudal: newUnit, caudal: newValStr});
  };

  function getTargetCaudalLpm() {
    const targetCaudalInput = parseFloat(pumpWizard.caudal) || 0;
    let targetCaudalLpm = targetCaudalInput;
    if (pumpWizard.unidadCaudal === 'm3/h') targetCaudalLpm = targetCaudalInput * (1000 / 60);
    if (pumpWizard.unidadCaudal === 'l/h') targetCaudalLpm = targetCaudalInput / 60;
    return targetCaudalLpm;
  }

  async function handleCalculate() {
    Keyboard.dismiss();
    setHasCalculated(true);
    let filtered: ExtendedCalcProduct[] = [];
    try {
      if (calcMode === 'gen') {
        const target = parseFloat(calcInput) || 0;
        const dbProducts = await getProductsBySubcategory('GENERADOR', true);
        filtered = dbProducts.filter((p: ParsedProduct) => {
          let hasFuel = false;
          const sub = String(p.subcategoria).toUpperCase();
          if (sub.includes('NAFTA') || sub.includes('DIESEL') || sub.includes('DIÉSEL') || sub.includes('GASOLINA')) hasFuel = true;
          if (p.specs) {
            const allSpecs = JSON.stringify(p.specs).toUpperCase();
            if (allSpecs.includes('NAFTA') || allSpecs.includes('DIESEL') || allSpecs.includes('DIÉSEL') || allSpecs.includes('GASOLINA')) hasFuel = true;
          }
          return hasFuel;
        }).map((p: ParsedProduct): ExtendedCalcProduct => {
          let val = 0;
          if (p.specs) {
            p.specs.forEach((s: SpecTuple) => {
              const k = String(s[0]).toUpperCase();
              if (k.includes('POTENCIA') || k.includes('KVA')) {
                const n = extractNum(s[1]);
                if (n) val = n;
              }
            });
          }
          return { ...p, calcVal: val };
        }).filter((p: ExtendedCalcProduct) => p.calcVal > 0)
        .sort((a: ExtendedCalcProduct, b: ExtendedCalcProduct) => Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target)).slice(0, 5);
      } else if (calcMode === 'motor') {
        const target = parseFloat(calcInput) || 0;
        const dbProducts = await getProductsBySubcategory('MOTOR', true);
        filtered = dbProducts.filter((p: ParsedProduct) => {
          const sub = String(p.subcategoria).toUpperCase();
          return sub.includes('ELEC') || sub.includes('ELÉC');
        }).map((p: ParsedProduct): ExtendedCalcProduct => {
          let val = 0;
          if (p.specs) {
            p.specs.forEach((s: SpecTuple) => {
              const k = String(s[0]).toUpperCase();
              if (k.includes('HP') || k.includes('POTENCIA')) {
                const n = extractNum(s[1]);
                if (n) val = n;
              }
            });
          }
          return { ...p, calcVal: val };
        }).filter((p: ExtendedCalcProduct) => p.calcVal > 0)
        .sort((a: ExtendedCalcProduct, b: ExtendedCalcProduct) => Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target)).slice(0, 5);
      } else if (calcMode === 'bomba') {
        let targetCaudalInput = 0;
        let targetAlturaInput = 0;
        let reqFase = '';
        let targetCaudalLpm = 0;
        
        if (bombaTab === 'guiado') {
           targetCaudalInput = parseFloat(pumpWizard.caudal) || 0;
           targetAlturaInput = parseFloat(pumpWizard.altura) || 0;
           reqFase = pumpWizard.fase;
           targetCaudalLpm = getTargetCaudalLpm();
        } else {
           // Modo avanzado: convertir caudal a L/min según unidad seleccionada
           const advCaudalRaw = parseFloat(adv.caudal) || 0;
           if (adv.unidadCaudal === 'm3/h') targetCaudalLpm = advCaudalRaw * (1000 / 60);
           else if (adv.unidadCaudal === 'l/h') targetCaudalLpm = advCaudalRaw / 60;
           else targetCaudalLpm = advCaudalRaw; // L/min por defecto
           targetCaudalInput = targetCaudalLpm;
           targetAlturaInput = hTotal;
           reqFase = '';
        }
        
        let targetHp = (targetCaudalLpm * targetAlturaInput) / 1915.2;
        if (targetHp > 0 && targetHp < 0.5) targetHp = 0.5;
        
        // Pool de bombas: traer BOMBA + CUERPO SUMERGIBLE en una sola query unificada
        const [dbBombas, dbCuerpos] = await Promise.all([
           getProductsBySubcategory('BOMBA', true),
           getProductsBySubcategory('CUERPO SUMERGIBLE', true),
        ]);
        // Unir evitando duplicados por SKU
        const skuSet = new Set(dbBombas.map(p => p.modelo));
        const dbProducts = [...dbBombas, ...dbCuerpos.filter(c => !skuSet.has(c.modelo))];

        let pool = dbProducts;
        const usoConf = USOS.find(u => u.id === pumpWizard.uso);
        
        // ── FILTRO POR CATEGORÍA ──────────────────────────────────────────────
        if (bombaTab === 'guiado' && usoConf) {
           pool = pool.filter(p => {
              const sub = String(p.subcategoria).toUpperCase();
              const nom = String(p.modelo).toUpperCase();

              // Solo pasan los tipos definidos en la categoría
              if (!usoConf.tipos.some(t => sub.includes(t) || nom.includes(t))) return false;

              // ── VIVIENDA: doble barrera (HP + Caudal como fallback) ──
              if (pumpWizard.uso === 'vivienda') {
                 const specs = parsePumpSpecs(p as ParsedProduct);
                 // Si tiene HP explícito → debe ser <= 3 HP
                 if (specs.hpVal > 3) return false;
                 // Si no tiene HP pero tiene caudal → caudal máx 165 L/min (~10 m³/h)
                 if (specs.hpVal === 0 && specs.maxCaudalLpm > 165) return false;
              }

              // ── INDUSTRIAL: piso de 3 HP (excluir domésticas explícitas) ──
              if (pumpWizard.uso === 'riego_presion') {
                 const specs = parsePumpSpecs(p as ParsedProduct);
                 // Si tiene HP explícito y es < 3 → excluir
                 if (specs.hpVal > 0 && specs.hpVal < 3) return false;
              }

              return true;
           });
        }
        
        // Strict fuel filter
        if (usoConf?.forzarCombustible) {
           pool = pool.filter(p => {
             const sub = String(p.subcategoria).toUpperCase();
             const allSpecs = p.specs ? JSON.stringify(p.specs).toUpperCase() : '';
             return sub.includes('NAFTA') || sub.includes('DIESEL') || sub.includes('COMBUSTIÓN') || sub.includes('GASOLINA') || allSpecs.includes('NAFTA') || allSpecs.includes('DIESEL') || allSpecs.includes('COMBUSTIÓN') || allSpecs.includes('GASOLINA');
           });
        }

        const mapped = pool.map((p: ParsedProduct): ExtendedCalcProduct => {
           const specs = parsePumpSpecs(p);
           
           let score = 0;
           
           if (specs.maxCaudalLpm > 0 && targetCaudalLpm > 0) {
              score += Math.max(0, (specs.maxCaudalLpm - targetCaudalLpm) / targetCaudalLpm);
           }
           if (specs.maxAlturaMca > 0 && targetAlturaInput > 0) {
              score += Math.max(0, (specs.maxAlturaMca - targetAlturaInput) / targetAlturaInput);
           }

           if (reqFase === '220v' && specs.is220) score -= 0.15;
           if (reqFase === '380v' && specs.is380) score -= 0.15;
           
           if (usoConf?.pref && usoConf.pref.some(pr => String(p.modelo).toUpperCase().includes(pr))) {
              score -= 0.3;
           }

           let displayVal = specs.hpVal > 0 ? `${specs.hpVal.toFixed(1)} HP` : '? HP';
           if (specs.hpVal === 0 || String(p.modelo).toUpperCase().includes('EJE LIBRE') || String(p.modelo).toUpperCase().includes('SIN MOTOR')) {
              if (specs.maxCaudalLpm > 0 && specs.maxAlturaMca > 0) {
                 displayVal = `Máx: ${specs.maxCaudalLpm.toFixed(0)}L/m | ${specs.maxAlturaMca.toFixed(0)}mca`;
              } else if (specs.maxCaudalLpm > 0) {
                 displayVal = `Máx: ${specs.maxCaudalLpm.toFixed(0)} L/min`;
              } else if (specs.maxAlturaMca > 0) {
                 displayVal = `Máx: ${specs.maxAlturaMca.toFixed(0)} m.c.a`;
              } else {
                 displayVal = 'Eje Libre / Sin Motor';
              }
           }

           return { ...p, calcVal: specs.hpVal, score, displayValue: displayVal, isSinAltura: specs.maxAlturaMca === 0, _q: specs.maxCaudalLpm, _h: specs.maxAlturaMca, _is220: specs.is220, _is380: specs.is380, _isEjeLibre: specs.isEjeLibre } as any;
        });

        // 75% Filter
        let conAltura = mapped.filter(p => !p.isSinAltura);
        let sinAltura = mapped.filter(p => p.isSinAltura);

        if (targetCaudalLpm > 0) {
           let byQ = conAltura.filter(p => (p as any)._q >= targetCaudalLpm && (p as any)._q <= targetCaudalLpm * 1.3);
           if (byQ.length < 2) {
              byQ = conAltura.filter(p => (p as any)._q >= targetCaudalLpm * 0.75 && (p as any)._q <= targetCaudalLpm * 1.5);
           }
           conAltura = byQ;
           
           sinAltura = sinAltura.filter(p => ((p as any)._q >= targetCaudalLpm * 0.75 && (p as any)._q <= targetCaudalLpm * 1.5) || (p as any)._q === 0);
        }

        if (targetAlturaInput > 0) {
           let byH = conAltura.filter(p => (p as any)._h >= targetAlturaInput && (p as any)._h <= targetAlturaInput * 1.3);
           if (byH.length < 2) {
              byH = conAltura.filter(p => (p as any)._h >= targetAlturaInput * 0.75 && (p as any)._h <= targetAlturaInput * 1.5);
           }
           conAltura = byH;
        }
        
        // Fase Filter
        if (reqFase === 'sinelec') {
           conAltura = conAltura.filter(p => (!(p as any)._is220 && !(p as any)._is380) || (p as any)._isEjeLibre);
           sinAltura = sinAltura.filter(p => (!(p as any)._is220 && !(p as any)._is380) || (p as any)._isEjeLibre);
        } else if (reqFase === '220v') {
           conAltura = conAltura.filter(p => (p as any)._is220 || (p as any)._isEjeLibre);
           sinAltura = sinAltura.filter(p => (p as any)._is220 || (p as any)._isEjeLibre);
        } else if (reqFase === '380v') {
           conAltura = conAltura.filter(p => (p as any)._is380 || (p as any)._isEjeLibre);
           sinAltura = sinAltura.filter(p => (p as any)._is380 || (p as any)._isEjeLibre);
}

        conAltura.sort((a, b) => (a.score ?? 999) - (b.score ?? 999));
        sinAltura.sort((a, b) => (a.score ?? 999) - (b.score ?? 999));

        filtered = [...conAltura, ...sinAltura].slice(0, 5).map(p => {
           const { _q, _h, _is220, _is380, ...rest } = p as any;
           return rest;
        });

        const checkNeedsMotor = (p: any) => {
           const isEjeLibre = p._isEjeLibre || String(p.modelo).toUpperCase().includes('EJE LIBRE') || String(p.modelo).toUpperCase().includes('SIN MOTOR');
           const isCuerpo = String(p.subcategoria).toUpperCase().includes('CUERPO SUMERGIBLE');
           return isEjeLibre || isCuerpo;
        };

        const hasEjeLibre = filtered.some(checkNeedsMotor);
        
        let mResults: ExtendedCalcProduct[] = [];
        let finalTargetHp = targetHp;
        
        setMotorWarning(null);
        if (hasEjeLibre) {
            const ejeLibrePumps = filtered.filter(checkNeedsMotor);
            // Traer SOLO motores eléctricos reales: eléctricos de superficie Y sumergibles
            // La query %MOTOR% trae llaves motorizadas y otros accesorios - aquí los excluimos
            const [dbMotoresElec, dbMotoresSub] = await Promise.all([
               getProductsBySubcategory('MOTOR ELÉCTRICO', true),
               getProductsBySubcategory('MOTOR SUMERGIBLE', true),
            ]);
            const motorSkuSet = new Set(dbMotoresElec.map((m: ParsedProduct) => m.modelo));
            const dbMotors: ParsedProduct[] = [...dbMotoresElec, ...dbMotoresSub.filter((m: ParsedProduct) => !motorSkuSet.has(m.modelo))];
            let highestTargetHp = 0;
            
            for (const pump of ejeLibrePumps) {
                let rawHp = 0;
                if ((pump as any)._q > 0 && (pump as any)._h > 0) {
                    rawHp = ((pump as any)._q * (pump as any)._h) / 3150;
                } else if (pump.calcVal > 0) {
                    rawHp = pump.calcVal;
                } else {
                    rawHp = (targetCaudalLpm * targetAlturaInput) / 3150;
                }
                
                const pumpTargetHp = (pump.calcVal > 0 && rawHp === pump.calcVal) ? rawHp : rawHp * 1.25;
                
                // Si faltan datos y el HP calculado es 0, abortamos la sugerencia de motor para esta bomba
                if (pumpTargetHp === 0) {
                    setMotorWarning('⚠️ Ingresá la altura (mca) para poder sugerir el motor correcto.');
                    continue;
                }
                
                if (pumpTargetHp > highestTargetHp) highestTargetHp = pumpTargetHp;
                
                const isPumpSumergible = String(pump.subcategoria).toUpperCase().includes('SUMERGIBLE') || String(pump.modelo).toUpperCase().includes('SUMERGIBLE') || usoConf?.id === 'pozo';
                
                const validMotors = dbMotors.filter(m => {
                   const mSub = String(m.subcategoria).toUpperCase();
                   const mMod = String(m.modelo).toUpperCase();
                   const isMotorSumergible = mSub.includes('SUMERGIBLE') || mMod.includes('SUMERGIBLE') || mMod.includes('4PD') || mMod.includes('6PD');
                   return isPumpSumergible ? isMotorSumergible : !isMotorSumergible;
                }).map((m: ParsedProduct): ExtendedCalcProduct => {
                   let mHp = 0;
                   if (m.specs) {
                      m.specs.forEach((s) => {
                         const k = String(s[0]).toUpperCase();
                         if (k.includes('HP') || k.includes('POTENCIA')) {
                            const n = extractNum(s[1]);
                            if (n) mHp = n;
                         }
                      });
                   }
                   // Excluir motores con 0 HP asignándoles score alto
                   return { ...m, calcVal: mHp, score: (mHp > 0 && mHp >= pumpTargetHp) ? mHp - pumpTargetHp : 9999 };
                });

                let bestMotor: ExtendedCalcProduct | undefined = validMotors.filter((m) => m.score !== undefined && m.score >= 0 && m.score < 1000).sort((a, b) => (a.score ?? 999) - (b.score ?? 999))[0];
                
                // CAMBIO 6: Regla Universal de Cero Bombas Huérfanas
                // Si no encontramos un motor ideal que cubra la potencia, sugerimos el máximo posible.
                if (!bestMotor) {
                    const maxValMotors = validMotors.map((m) => {
                        return { ...m, calcVal: m.calcVal || 0 };
                    });
                    const maxCatalogHp = Math.max(...maxValMotors.map(m => m.calcVal), 0);
                    bestMotor = maxValMotors.find(m => m.calcVal === maxCatalogHp);
                    
                    if (bestMotor && maxCatalogHp > 0) {
                        bestMotor = { ...bestMotor }; // clone
                        bestMotor.displayValue = `Máx cap. ${maxCatalogHp} HP (Aviso: Requiere ~${Math.round(pumpTargetHp)} HP)`;
                        
                        if (pumpTargetHp > highestTargetHp) {
                            if (targetAlturaInput > 0) {
                                const maxLpm = (maxCatalogHp * 3150) / targetAlturaInput;
                                let maxDisplay = '';
                                if (pumpWizard.unidadCaudal === 'm3/h') maxDisplay = (maxLpm * 60 / 1000).toFixed(1) + ' m³/h';
                                else if (pumpWizard.unidadCaudal === 'l/h') maxDisplay = (maxLpm * 60).toFixed(0) + ' L/h';
                                else maxDisplay = maxLpm.toFixed(0) + ' L/min';
                                setMotorWarning(`⚠️ Una de las bombas sugeridas exige ~${Math.round(pumpTargetHp)} HP. Al acoplarle nuestro motor más grande en stock (${maxCatalogHp} HP) a ${targetAlturaInput} mca, entregará máx. ${maxDisplay}.`);
                            } else {
                                setMotorWarning(`⚠️ Una de las bombas exige ~${Math.round(pumpTargetHp)} HP. Se sugiere el motor de máxima capacidad en stock (${maxCatalogHp} HP) como Plan B.`);
                            }
                        }
                    }
                }
                
                if (bestMotor) {
                    const motorClone = { ...bestMotor };
                    motorClone.marca = 'Motor Sugerido: ' + motorClone.marca;
                    motorClone.displayValue = motorClone.displayValue || (motorClone.calcVal > 0 ? `${motorClone.calcVal.toFixed(1)} HP (Est. ${Math.round(pumpTargetHp)} HP req)` : '? HP');
                    motorClone.pairedSku = pump.modelo;
                    
                    mResults.push(motorClone);
                    
                    const idxInFiltered = filtered.findIndex(p => p.modelo === pump.modelo);
                    if (idxInFiltered >= 0 && !filtered[idxInFiltered].pairedSku) {
                       filtered[idxInFiltered].pairedSku = motorClone.modelo;
                    }
                }
            }
            
            finalTargetHp = highestTargetHp;
            setMotorResultTitle('Motores Sugeridos:');
        }

        // Caso inverso: si el resultado principal es un MOTOR SUMERGIBLE
        // suelto (sin cuerpo), no sirve de nada solo — hace falta sugerir
        // el cuerpo sumergible que le corresponde.
        if (mResults.length === 0) {
           const motorSumergibleSolo = filtered.find(p => {
              const sub = String(p.subcategoria).toUpperCase();
              return sub.includes('MOTOR') && sub.includes('SUMERGIBLE');
           });

           if (motorSumergibleSolo && motorSumergibleSolo.calcVal > 0) {
              const motorHp = motorSumergibleSolo.calcVal;
              const dbCuerpos = await getProductsBySubcategory('CUERPO SUMERGIBLE', true);
              const validCuerpos = dbCuerpos.map((c: ParsedProduct): ExtendedCalcProduct => {
                 let cuerpoHpReq = 0;
                 if (c.specs) {
                    for (const s of c.specs) {
                       const match = String(s[1]).match(/PARA\s+MOTOR\s+([\d.,]+)\s*HP/i);
                       if (match) { cuerpoHpReq = parseFloat(match[1].replace(',', '.')); break; }
                    }
                 }
                 return { ...c, calcVal: cuerpoHpReq, score: (cuerpoHpReq > 0 && motorHp >= cuerpoHpReq) ? (motorHp - cuerpoHpReq) : 9999 };
              }).filter((c) => c.score !== undefined && c.score < 1000).sort((a, b) => (a.score ?? 999) - (b.score ?? 999));

              mResults = validCuerpos.slice(0, 3).map(c => {
                 c.marca = 'Cuerpo Sugerido: ' + c.marca;
                 c.displayValue = c.calcVal > 0 ? `Requiere motor ${c.calcVal.toFixed(0)} HP (tenés ${motorHp.toFixed(0)} HP)` : '';
                 c.pairedSku = motorSumergibleSolo.modelo;
                 return c;
              });

              if (mResults.length > 0) {
                 const idxInFiltered = filtered.findIndex(p => p.modelo === motorSumergibleSolo.modelo);
                 if (idxInFiltered >= 0) filtered[idxInFiltered].pairedSku = mResults[0].modelo;
              }
              setMotorResultTitle('Cuerpos Sumergibles Sugeridos:');
           }
        }
        setMotorResult(mResults);
      }
    } catch (e: unknown) {
      Sentry.captureException(e);
    }
    setCalcResult(filtered);
    setWaitingForCatalog(filtered.length === 0 && isCatalogSyncing());
  }

  useEffect(() => {
    if (!visible || !waitingForCatalog) return;
    const unsubscribe = subscribeToCatalogUpdates(() => {
      if (!isCatalogSyncing()) {
        setWaitingForCatalog(false);
      }
    });
    return unsubscribe;
  }, [visible, waitingForCatalog]);

  const handleBack = () => {
    if (calcMode === 'bomba' && bombaTab === 'guiado' && wizardStep > 1) {
      setWizardStep(1);
      setHasCalculated(false);
      setCalcResult(null);
      setMotorResult(null);
    } else if (calcMode) {
      setCalcMode('');
      setHasCalculated(false);
      setCalcResult(null);
      setMotorResult(null);
      setBombaTab('guiado');
      setWizardStep(1);
      setCatStats(null);
      setPumpWizard({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '' });
    } else {
      onClose();
    }
  };

  const getHeaderTitle = () => {
    if (calcMode === 'bomba' && pumpWizard.uso) {
       return USOS.find(u => u.id === pumpWizard.uso)?.title || 'Calculadora';
    }
    return 'Calculadora de Equipos';
  };

  useEffect(() => {
    if (visible && calcMode && calcResult && calcResult.length === 0 && !waitingForCatalog) {
       handleCalculate();
    }
  }, [waitingForCatalog]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleBack}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.modalContent}>
          <View style={[styles.header, { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center' }]}>
            {calcMode ? (
               <TouchableOpacity onPress={handleBack} style={{ padding: 5 }}>
                  <Text style={{ fontSize: 24, color: COLORS.navy }}>←</Text>
               </TouchableOpacity>
            ) : <View style={{ width: 30 }} />}
            <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 5 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!calcMode ? (
            <View>
              <Text style={styles.subtitle}>Seleccioná un tipo de equipo para hacer un cálculo rápido:</Text>
              <View style={styles.optionsContainer}>
                <TouchableOpacity onPress={() => { setCalcMode('gen'); setHasCalculated(false); setCalcResult(null);
      setMotorResult(null); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="gen" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Generador Eléctrico</Text>
                    <Text style={styles.optionSubtitle}>Cálculo rápido en KVA</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('motor'); setHasCalculated(false); setCalcResult(null);
      setMotorResult(null); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="motor" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Motor Eléctrico</Text>
                    <Text style={styles.optionSubtitle}>Cálculo rápido en HP</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('bomba'); setBombaTab('guiado'); setHasCalculated(false); setCalcResult(null);
      setMotorResult(null); setWizardStep(1); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="bomba" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Bomba de Agua</Text>
                    <Text style={styles.optionSubtitle}>Cálculo por Altura y Caudal</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              {calcMode === 'bomba' ? (
                <View>
                  <View style={styles.tabContainer}>
                    <TouchableOpacity 
                      style={[styles.tabBtn, bombaTab === 'guiado' && styles.tabBtnActive]} 
                      onPress={() => { setBombaTab('guiado'); setHasCalculated(false); setCalcResult(null);
      setMotorResult(null); }}
                    >
                      <Text style={[styles.tabText, bombaTab === 'guiado' && styles.tabTextActive]}>GUIADO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.tabBtn, bombaTab === 'avanzado' && styles.tabBtnActive]} 
                      onPress={() => { setBombaTab('avanzado'); setHasCalculated(false); setCalcResult(null);
      setMotorResult(null); }}
                    >
                      <Text style={[styles.tabText, bombaTab === 'avanzado' && styles.tabTextActive]}>CÁLCULO AVANZADO</Text>
                    </TouchableOpacity>
                  </View>

                  {bombaTab === 'avanzado' ? (
                    <View style={styles.avanzadoContainer}>
                      <View style={styles.grid2Cols}>
                        <View style={styles.col}>
                           <Text style={styles.inputTitleSmall}>Caudal (m³/h)</Text>
                           <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 15" placeholderTextColor={COLORS.gray4} value={adv.caudal} onChangeText={(t) => setAdv({...adv, caudal: t})} />
                        </View>
                        <View style={styles.col}>
                           <Text style={styles.inputTitleSmall}>Diámetro</Text>
                           <TouchableOpacity style={styles.textInputSmall} onPress={() => {
                               const next = adv.diamIdx >= FRICCION_DIAMS.length - 1 ? 0 : adv.diamIdx + 1;
                               setAdv({...adv, diamIdx: next});
                           }}>
                              <Text style={{color: COLORS.navy}}>{FRICCION_DIAMS[adv.diamIdx]}</Text>
                           </TouchableOpacity>
                        </View>
                      </View>
                      
                      <View style={styles.grid2Cols}>
                        <View style={styles.col}>
                           <Text style={styles.inputTitleSmall}>Longitud recta (m)</Text>
                           <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 200" placeholderTextColor={COLORS.gray4} value={adv.lRecta} onChangeText={(t) => setAdv({...adv, lRecta: t})} />
                        </View>
                        <View style={styles.col}>
                           <Text style={styles.inputTitleSmall}>Desnivel (m)</Text>
                           <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 1" placeholderTextColor={COLORS.gray4} value={adv.hGeo} onChangeText={(t) => setAdv({...adv, hGeo: t})} />
                        </View>
                      </View>

                      <Text style={[styles.inputTitleSmall, { marginTop: 5, marginBottom: 5 }]}>Accesorios (Cantidades)</Text>
                      <View style={styles.accGrid}>
                         {FIT_HEADERS.map((h, i) => (
                           <View key={h} style={styles.accCell}>
                             <Text style={styles.accLabel}>{h}</Text>
                             <TextInput 
                               style={styles.accInput} 
                               keyboardType="numeric" 
                               value={adv.acc[i] ? String(adv.acc[i]) : ''} 
                               onChangeText={(t) => {
                                 const n = parseInt(t) || 0;
                                 const newAcc = [...adv.acc];
                                 newAcc[i] = n;
                                 setAdv({...adv, acc: newAcc});
                               }} 
                             />
                           </View>
                         ))}
                      </View>

                      {status === 'sin-datos' && parseFloat(adv.caudal) > 0 ? (
                         <Text style={styles.advWarn}>No hay datos de fricción para este caudal y diámetro.</Text>
                      ) : parseFloat(adv.caudal) > 0 && (
                         <View style={styles.advResultBox}>
                            <View style={styles.advResultRow}>
                               <Text style={styles.advResultLbl}>Altura Total:</Text>
                               <Text style={styles.advResultVal}>{hTotal.toFixed(2)} mca</Text>
                            </View>
                            <View style={styles.advResultRow}>
                               <Text style={styles.advResultLbl}>Fricción:</Text>
                               <Text style={styles.advResultLbl}>{perdida.toFixed(2)} mca</Text>
                            </View>
                         </View>
                      )}

                      <TouchableOpacity 
                        style={[styles.calculateBtn, {marginTop: 10, paddingVertical: 10}]} 
                        onPress={handleCalculate}
                      >
                        <Text style={styles.calculateBtnText}>Buscar Equipos</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.guiadoContainer}>
                      {wizardStep === 1 ? (
                        <View>
                          <Text style={styles.inputTitleSmall}>¿Para qué necesita la bomba?</Text>
                          <View style={styles.usosList}>
                            {USOS.map(u => (
                              <TouchableOpacity 
                                key={u.id}
                                style={[styles.usoListCard, pumpWizard.uso === u.id && styles.usoCardActive]}
                                onPress={() => setPumpWizard({...pumpWizard, uso: u.id})}
                              >
                                <Text style={[styles.usoListTitle, pumpWizard.uso === u.id && styles.usoTitleActive]}>
                                  {u.title}
                                </Text>
                                <Text style={styles.usoListSubtitle}>
                                  {u.subtitle}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          
                          <TouchableOpacity 
                            style={[styles.calculateBtn, !pumpWizard.uso && { backgroundColor: COLORS.gray4 }]} 
                            disabled={!pumpWizard.uso}
                            onPress={() => setWizardStep(2)}
                          >
                            <Text style={styles.calculateBtnText}>Siguiente →</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View>
                          <TouchableOpacity style={styles.backBtn} onPress={() => { setWizardStep(1); setHasCalculated(false); setCalcResult(null);
      setMotorResult(null); setCatStats(null); }}>
                            <Text style={styles.backBtnText}>← Volver a Uso</Text>
                          </TouchableOpacity>

                          {statsLoading && <ActivityIndicator size="small" color={COLORS.navy} style={{marginBottom: 10}} />}
                          <View style={styles.colList}>
                             <View style={styles.colListRow}>
                                <Text style={styles.inputTitleSmall}>Caudal</Text>
                                <View style={styles.unitTabs}>
                                   <TouchableOpacity style={[styles.unitTabBtn, pumpWizard.unidadCaudal === 'l/min' && styles.unitTabBtnActive]} onPress={() => handleUnitChange('l/min')}>
                                      <Text style={[styles.unitTabTxt, pumpWizard.unidadCaudal === 'l/min' && styles.unitTabTxtActive]}>L/min</Text>
                                   </TouchableOpacity>
                                   <TouchableOpacity style={[styles.unitTabBtn, pumpWizard.unidadCaudal === 'm3/h' && styles.unitTabBtnActive]} onPress={() => handleUnitChange('m3/h')}>
                                      <Text style={[styles.unitTabTxt, pumpWizard.unidadCaudal === 'm3/h' && styles.unitTabTxtActive]}>m³/h</Text>
                                   </TouchableOpacity>
                                   <TouchableOpacity style={[styles.unitTabBtn, pumpWizard.unidadCaudal === 'l/h' && styles.unitTabBtnActive]} onPress={() => handleUnitChange('l/h')}>
                                      <Text style={[styles.unitTabTxt, pumpWizard.unidadCaudal === 'l/h' && styles.unitTabTxtActive]}>L/h</Text>
                                   </TouchableOpacity>
                                </View>
                                <View style={styles.caudalRow}>
                                  <TextInput style={[styles.textInputSmall, { flex: 1, marginHorizontal: 0, marginRight: 5 }]} keyboardType="numeric" placeholder="Ej: 100" placeholderTextColor={COLORS.gray4} value={pumpWizard.caudal} onChangeText={(t) => setPumpWizard({...pumpWizard, caudal: t})} />
                                </View>
                             </View>
              <View style={styles.colListRow}>
                                <Text style={styles.inputTitleSmall}>Altura (mca)</Text>
                                <TextInput style={[styles.textInputSmall, { marginHorizontal: 0 }]} keyboardType="numeric" placeholder="Ej: 20" placeholderTextColor={COLORS.gray4} value={pumpWizard.altura} maxLength={3} onChangeText={(t) => setPumpWizard({...pumpWizard, altura: t})} />
                             </View>
                          </View>

                          <Text style={{fontSize: 12, marginBottom: 10, textAlign: 'center', color: COLORS.gray4}}>
                            * Ingresa al menos uno de los valores para calcular
                          </Text>

                          {pumpWizard.uso !== 'combustion' && (
                            <>
                              <Text style={styles.inputTitleSmall}>Alimentación Eléctrica (Opcional)</Text>
                              <View style={styles.faseGrid}>
                                <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '220v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '220v' ? '' : '220v'})}>
                                  <Text style={[styles.faseBtnText, pumpWizard.fase === '220v' && styles.faseBtnTextActive]}>220V</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '380v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '380v' ? '' : '380v'})}>
                                  <Text style={[styles.faseBtnText, pumpWizard.fase === '380v' && styles.faseBtnTextActive]}>380V</Text>
                                </TouchableOpacity>

                                {(!['combustion', 'drenaje'].includes(pumpWizard.uso)) && (
                                  <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === 'sinelec' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === 'sinelec' ? '' : 'sinelec'})}>
                                    <Text style={[styles.faseBtnText, pumpWizard.fase === 'sinelec' && styles.faseBtnTextActive]}>Sin Motor</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </>
                          )}

                          <TouchableOpacity 
                            style={[styles.calculateBtn, {paddingVertical: 10, marginBottom: 5}, (!pumpWizard.caudal && !pumpWizard.altura) && { backgroundColor: COLORS.gray4 }]} 
                            disabled={!pumpWizard.caudal && !pumpWizard.altura}
                            onPress={handleCalculate}
                          >
                            <Text style={styles.calculateBtnText}>Ver Recomendaciones</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ) : (
                <View>
                  <Text style={styles.inputTitleSmall}>
                    {calcMode === 'gen' ? 'Ingresá el valor (1 a 3000 KVA)' : 'Ingresá el valor (1 a 500 HP)'}
                  </Text>
                  
                  <View style={styles.inputRow}>
                    <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(calcInput) || 0; if (current > 1) { setCalcInput(String(current - 1)); setHasCalculated(false); } }}>
                      <Text style={styles.counterBtnText}>-</Text>
                    </TouchableOpacity>
                    <TextInput style={styles.textInput} keyboardType="numeric" placeholder="Ej: 2" placeholderTextColor={COLORS.gray4} value={calcInput} onChangeText={(t) => { setCalcInput(t); setHasCalculated(false); }} />
                    <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(calcInput) || 0; const max = calcMode === 'gen' ? 3000 : 500; if (current < max) { setCalcInput(String(current + 1)); setHasCalculated(false); } }}>
                      <Text style={styles.counterBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.calculateBtn} onPress={handleCalculate}>
                    <Text style={styles.calculateBtnText}>Calcular y Ver Equipos</Text>
                  </TouchableOpacity>
                </View>
              )}

              {hasCalculated && (parseFloat(calcInput) > 0 || calcMode === 'bomba') && (
                <View style={styles.resultContainer}>
                  {calcMode !== 'bomba' && (
                  <View style={styles.estimationBox}>
                    <Text style={styles.estimationTitle}>Estimación rápida:</Text>
                    <Text style={styles.estimationText}>
                      {calcMode === 'gen' ? estimateGenerador(parseFloat(calcInput)) :
                       calcMode === 'motor' ? estimateMotor(parseFloat(calcInput)) :
                       ''}
                    </Text>
                  </View>
                  )}

                {calcResult && calcResult.length === 0 && (
                  <View style={styles.suggestedContainer}>
                    {waitingForCatalog ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color={COLORS.navy} />
                        <Text style={styles.estimationText}>
                          Estamos terminando de descargar el catálogo. El resultado va a aparecer solo en un momento…
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.estimationText}>
                        No encontramos equipos que coincidan con ese requerimiento en la categoría seleccionada.
                      </Text>
                    )}
                  </View>
                )}

                {calcResult && calcResult.length > 0 && (
                  <View style={styles.suggestedContainer}>
                    <Text style={styles.suggestedTitle}>Equipos Sugeridos:</Text>
                    <FlatList
                      data={calcResult}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item, index) => item.modelo + index}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={styles.suggestedCard}
                          onPress={() => {
                              navigation.navigate('ProductViewer', { sku: item.modelo, contextSkus: calcResult.map(r => r.modelo) });
                          }}
                        >
                          {item.imagen ? (
                            <Image source={{ uri: item.imagen }} style={styles.suggestedImg} contentFit="contain" />
                          ) : (
                            <View style={styles.suggestedImgPlaceholder} />
                          )}
                          {item.pairedSku && (
                            <View style={styles.pairedBadge}>
                              <Text style={styles.pairedBadgeText}>🔗 Requiere componente</Text>
                            </View>
                          )}
                          <Text style={styles.suggestedMarca} numberOfLines={1}>{item.marca}</Text>
                          <Text style={styles.suggestedModelo} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={styles.suggestedVal}>
                            {item.displayValue || (calcMode === 'gen' ? `${item.calcVal} KVA` : calcMode === 'motor' ? `${item.calcVal} HP` : `${item.calcVal > 0 ? item.calcVal.toFixed(1) : '?'} HP`)}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                )}

                {motorResult && motorResult.length === 0 && motorWarning && (
                  <Text style={styles.advWarn}>{motorWarning}</Text>
                )}
                {motorResult && motorResult.length > 0 && (
                  <View style={[styles.suggestedContainer, {marginTop: 5}]}>
                    <Text style={styles.suggestedTitle}>{motorResultTitle}</Text>
                    <FlatList
                      data={motorResult}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item, index) => item.modelo + index}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={[styles.suggestedCard, { borderColor: COLORS.green, borderWidth: 2 }]}
                          onPress={() => {
                              navigation.navigate('ProductViewer', { sku: item.modelo, contextSkus: motorResult.map(r => r.modelo) });
                          }}
                        >
                          {item.imagen ? (
                            <Image source={{ uri: item.imagen }} style={styles.suggestedImg} contentFit="contain" />
                          ) : (
                            <View style={styles.suggestedImgPlaceholder} />
                          )}
                          {item.pairedSku && (
                            <View style={[styles.pairedBadge, { backgroundColor: COLORS.green }]}>
                              <Text style={styles.pairedBadgeText}>🔗 Para: {item.pairedSku}</Text>
                            </View>
                          )}
                          <Text style={styles.suggestedMarca} numberOfLines={1}>{item.marca}</Text>
                          <Text style={styles.suggestedModelo} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={[styles.suggestedVal, {color: COLORS.green}]}>
                            {item.displayValue || `${item.calcVal} HP`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                )}
                </View>
              )}

            </View>
          )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '92%'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.navy
  },
  closeBtn: {
    fontSize: 22,
    color: COLORS.gray4,
    paddingHorizontal: 10
  },
  subtitle: {
    color: COLORS.gray4,
    marginBottom: 10,
    fontSize: 13
  },
  optionsContainer: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 10
  },
  optionCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.white
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  optionTextContainer: {
    flex: 1
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.navy
  },
  optionSubtitle: {
    fontSize: 12,
    color: COLORS.gray4,
    marginTop: 2
  },
  arrowIcon: {
    fontSize: 20,
    color: COLORS.gray4
  },
  inputTitleSmall: {
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 5,
    fontSize: 12
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15
  },
  counterBtn: {
    backgroundColor: COLORS.navy,
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  counterBtnText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold'
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#F0F4F8',
    marginHorizontal: 10,
    textAlign: 'center'
  },
  textInputSmall: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    color: '#000',
    backgroundColor: '#F0F4F8',
    textAlign: 'center'
  },
  grid2Cols: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10
  },
  col: {
    flex: 1
  },
  calculateBtn: {
    backgroundColor: COLORS.green,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 5
  },
  calculateBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 14
  },
  backBtn: {
    marginBottom: 5,
  },
  backBtnText: {
    color: COLORS.navy,
    fontSize: 12,
    fontWeight: 'bold'
  },
  resultContainer: {
    marginBottom: 10
  },
  estimationBox: {
    backgroundColor: '#E3FAED',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.green,
    marginBottom: 5
  },
  estimationTitle: {
    fontWeight: 'bold',
    color: COLORS.green,
    marginBottom: 5,
    fontSize: 12
  },
  estimationText: {
    color: COLORS.navy,
    fontSize: 12
  },
  suggestedContainer: {
    marginTop: 5
  },
  suggestedTitle: {
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 5,
    fontSize: 13
  },
  suggestedCard: {
    width: 120,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    marginRight: 8
  },
  suggestedImg: {
    width: '100%',
    height: 60,
    marginBottom: 5
  },
  suggestedImgPlaceholder: {
    width: '100%',
    height: 60,
    backgroundColor: '#f0f0f0',
    marginBottom: 5,
    borderRadius: 4
  },
  pairedBadge: {
    backgroundColor: COLORS.navy,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginBottom: 4,
    alignSelf: 'flex-start'
  },
  pairedBadgeText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: 'bold'
  },
  suggestedMarca: {
    fontSize: 9,
    color: COLORS.gray4,
    fontWeight: 'bold'
  },
  suggestedModelo: {
    fontSize: 11,
    color: COLORS.navy,
    fontWeight: 'bold',
    marginBottom: 2
  },
  suggestedVal: {
    fontSize: 10,
    color: COLORS.green,
    fontWeight: 'bold'
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center'
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.navy
  },
  tabText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.gray4
  },
  tabTextActive: {
    color: COLORS.navy
  },
  guiadoContainer: {
    paddingBottom: 5
  },
  usosList: {
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10
  },
  usoListCard: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'flex-start',
    justifyContent: 'center'
  },
  usoListTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 2
  },
  usoListSubtitle: {
    fontSize: 11,
    color: COLORS.gray4
  },
  usoCardActive: {
    backgroundColor: '#E6F0F9',
    borderColor: COLORS.navy
  },
  usoTitleActive: {
    color: COLORS.navy
  },
  colList: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 10
  },
  colListRow: {
    width: '100%'
  },
  unitTabs: {
    flexDirection: 'row',
    marginBottom: 5,
    gap: 5
  },
  unitTabBtn: {
    flex: 1,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: COLORS.white
  },
  unitTabBtnActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy
  },
  unitTabTxt: {
    fontSize: 11,
    color: COLORS.gray4,
    fontWeight: 'bold'
  },
  unitTabTxtActive: {
    color: COLORS.white
  },
  caudalRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  faseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  faseBtn: {
    width: '23%',
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    alignItems: 'center'
  },
  faseBtnActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy
  },
  faseBtnText: {
    color: COLORS.gray4,
    fontWeight: 'bold',
    fontSize: 10
  },
  faseBtnTextActive: {
    color: COLORS.white
  },
  avanzadoContainer: {
    paddingBottom: 5
  },
  accGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  accCell: {
    width: '31%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 5,
    alignItems: 'center'
  },
  accLabel: {
    fontSize: 9,
    color: COLORS.navy,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center'
  },
  accInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    backgroundColor: COLORS.white,
    width: '80%',
    padding: 2,
    textAlign: 'center',
    fontSize: 11,
    color: '#000'
  },
  advWarn: {
    fontSize: 11,
    color: '#D9381E',
    marginTop: 4
  },
  advResultBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.navy,
    borderRadius: 8,
    padding: 8,
    marginBottom: 5
  },
  advResultRow: {
    alignItems: 'center'
  },
  advResultLbl: {
    fontSize: 10,
    color: COLORS.gray4
  },
  advResultVal: {
    fontSize: 13,
    color: COLORS.navy,
    fontWeight: 'bold'
  },
  preReadBox: {
    backgroundColor: '#E6F0F9',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navy,
    marginBottom: 10
  },
  preReadText: {
    fontSize: 12,
    color: COLORS.navy
  }
});
