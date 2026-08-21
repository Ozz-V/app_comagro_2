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

type RulesCategory = typeof DEFAULT_RULES.categorias[0];


import { useRules } from '../hooks/useRules';
import { DEFAULT_RULES } from '../services/rulesService';

export default function CalculadoraModal({ visible, onClose, navigation }: CalculadoraModalProps) {
  const reglas = useRules();
  const [calcMode, setCalcMode] = useState('');
  const [calcInput, setCalcInput] = useState('');
  const [bombaTab, setBombaTab] = useState<'guiado' | 'avanzado'>('guiado');
  const [wizardStep, setWizardStep] = useState(1);
  const [pumpWizard, setPumpWizard] = useState<PumpWizardState>({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '' });
  
  const [genUnit, setGenUnit] = useState<'KVA'|'AMPER'>('KVA');
  const [genFase, setGenFase] = useState<'220v'|'380v'>('380v');

  const [adv, setAdv] = useState({ caudal: '', diamIdx: 4, lRecta: '', hGeo: '', acc: [0,0,0,0,0,0], unidadCaudal: 'm3/h' as 'l/min' | 'm3/h' | 'l/h' });

  const [calcResult, setCalcResult] = useState<ExtendedCalcProduct[] | null>(null);
  const [motorResult, setMotorResult] = useState<ExtendedCalcProduct[] | null>(null);
  const [motorResultTitle, setMotorResultTitle] = useState('Motores Sugeridos (Eje Libre):');
  const [hasCalculated, setHasCalculated] = useState(false);
  const [waitingForCatalog, setWaitingForCatalog] = useState(false);
  const [showDiamPicker, setShowDiamPicker] = useState(false);
  
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
      setBombaTab('guiado');
      setWizardStep(1);
      setPumpWizard({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '' });
      setAdv({ caudal: '', diamIdx: 4, lRecta: '', hGeo: '', acc: [0,0,0,0,0,0], unidadCaudal: 'm3/h' });
      setCatStats(null);
      setMotorWarning(null);
      setWaitingForCatalog(false);
    }
  }, [visible]);

  function extractNum(val: string | null | undefined): number | null {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/([\d]+[\.,]?[\d]*)/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.'));
  }

  // Devuelve la tensión numérica de un producto leyendo sus specs.
  // Regla: < 300V = monofásico, >= 300V = trifásico, null = sin dato (se muestra siempre)
  function getProductTension(p: ParsedProduct): number | null {
    if (!p.specs) return null;
    for (const s of p.specs) {
      const k = String(s[0]).toUpperCase();
      if (k.includes('TENSI') || k.includes('VOLTAJE') || k.includes('TENSION')) {
        const n = extractNum(String(s[1]));
        if (n && n > 50) return n; // ignorar valores ridículos tipo "0" o "1"
      }
    }
    return null;
  }

  // Devuelve true si el producto es compatible con la fase seleccionada.
  // Si no tiene tensión cargada, siempre es compatible (no excluir fichas incompletas).
  function matchesFase(p: ParsedProduct, fase: '220v' | '380v'): boolean {
    const tension = getProductTension(p);
    if (tension === null) return true; // sin dato → siempre mostrar
    if (fase === '220v') return tension < 300;
    return tension >= 300;
  }

  const { hTotal, perdida, lEquiv, lTotal, status } = useMemo(() => {
    if (bombaTab !== 'avanzado') return { hTotal: 0, perdida: 0, lEquiv: 0, lTotal: 0, status: 'ok' };
    const q = parseFloat(adv.caudal) || 0;
    const lRecta = parseFloat(adv.lRecta) || 0;
    const hGeo = parseFloat(adv.hGeo) || 0;
    
    // Si el caudal es tan alto que NINGÚN diámetro lo soporta, no calculamos fricción (quedaría por las nubes)
    const allDiamsInvalid = q > 0 && FRICCION_DIAMS.every((_, idx) => {
      const s = interpolateFriction(q, idx).status;
      return s === 'above' || s === 'sin-datos';
    });
    
    const { value: loss100, status } = allDiamsInvalid ? { value: 0, status: 'sin-datos' as const } : interpolateFriction(q, adv.diamIdx);
    const fitRow = FIT_ROWS[adv.diamIdx + 1];
    
    let lAcc = 0;
    adv.acc.forEach((qty, i) => {
      lAcc += qty * fitRow[1][i];
    });
    
    const lTot = lRecta + lAcc;
    const pFric = (loss100 !== null && !allDiamsInvalid) ? (lTot * loss100) / 100 : 0;
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
      const usoConf = reglas.categorias.find((u: any) => u.id === pumpWizard.uso);
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
        let targetKva = parseFloat(calcInput) || 0;
        if (genUnit === 'AMPER') {
            if (genFase === '220v') targetKva = (targetKva * 220) / 1000;
            else targetKva = (targetKva * 380 * 1.732) / 1000;
        }
        
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
          let ampers = '';
          if (p.specs) {
            p.specs.forEach((s: SpecTuple) => {
              const k = String(s[0]).toUpperCase();
              const v = String(s[1]);
              if (k.includes('POTENCIA') || k.includes('KVA')) {
                const n = extractNum(v);
                if (n) val = n;
              }
              if (k.includes('CORRIENTE NOMINAL')) {
                ampers = v.trim();
              }
            });
          }
          const displayValue = ampers ? `${val} KVA - ${ampers}A` : `${val} KVA`;
          return { ...p, calcVal: val, displayValue };
        }).filter((p: ExtendedCalcProduct) => p.calcVal > 0)
        .filter((p: ExtendedCalcProduct) => matchesFase(p, genFase)) // filtrar por tensión
        .sort((a: ExtendedCalcProduct, b: ExtendedCalcProduct) => Math.abs(a.calcVal - targetKva) - Math.abs(b.calcVal - targetKva)).slice(0, 5);
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
        
        let targetHp = (targetCaudalLpm * targetAlturaInput) / reglas.matematica.divisorHpTeorico;
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
        const usoConf = reglas.categorias.find((u: any) => u.id === pumpWizard.uso);
        
        // ── FILTRO POR CATEGORÍA ──────────────────────────────────────────────
        if (usoConf) {
           pool = pool.filter(p => {
              const sub = String(p.subcategoria).toUpperCase();
              const nom = String(p.modelo).toUpperCase();

              // Solo pasan los tipos definidos en la categoría
              if (!usoConf.tipos.some(t => sub.includes(t) || nom.includes(t))) return false;

              // ── VIVIENDA: doble barrera (HP + Caudal como fallback) ──
              if (pumpWizard.uso === 'vivienda') {
                 const specs = parsePumpSpecs(p as ParsedProduct);
                 // Si tiene HP explícito → debe ser <= 3 HP
                 if (specs.hpVal > reglas.filtros.vivienda.maxHp) return false;
                 // Si no tiene HP pero tiene caudal → caudal máx 165 L/min (~10 m³/h)
                 if (specs.hpVal === 0 && specs.maxCaudalLpm > reglas.filtros.vivienda.maxCaudalLpm) return false;
              }

              // ── INDUSTRIAL: piso de 3 HP (excluir domésticas explícitas) ──
              if (pumpWizard.uso === 'riego_presion') {
                 const specs = parsePumpSpecs(p as ParsedProduct);
                 // Si tiene HP explícito y es < 3 → excluir
                 if (specs.hpVal > 0 && specs.hpVal < reglas.filtros.industrial.minHp) return false;
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
           
           if (usoConf?.pref && usoConf.pref.some((pr: any) => String(p.modelo).toUpperCase().includes(pr))) {
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

        const tolCurva = reglas.matematica.toleranciaCurva || 1.15; // 15% de margen extra por si acaso
        const minCaudalTol = reglas.matematica.toleranciaCaudalMinimo || 0.85;

        if (targetCaudalLpm > 0 && targetAlturaInput > 0) {
           const maxMultiplo = reglas.matematica.maxMultiploCaudalPermitido ?? 8;
           conAltura = conAltura.filter(p => {
              const qmax = (p as any)._q;
              const hmax = (p as any)._h;
              // Nunca sugerir bombas con caudal máximo > N veces lo requerido
              if (qmax > targetCaudalLpm * maxMultiplo) return false;
              if (qmax < targetCaudalLpm * minCaudalTol || hmax < targetAlturaInput) return false;
              // Verificar si el punto de operación cae bajo la curva teórica (H = Hmax * (1 - (Q/Qmax)^2))
              const curvaH = hmax * (1 - Math.pow(targetCaudalLpm / qmax, 2));
              return curvaH >= targetAlturaInput && curvaH <= targetAlturaInput * (tolCurva + 0.5);
           });
           
           // Ordenar por qué tan cerca está la curva de lo requerido (score dinámico basado en la física)
           const pesoExcesoH    = reglas.matematica.pesoExcesoH    ?? 1.0;
           const pesoExcesoQmax = reglas.matematica.pesoExcesoQmax ?? 0.5;
           const pesoExcesoHmax = reglas.matematica.pesoExcesoHmax ?? 0.2;
           conAltura.forEach(p => {
              const qmax = (p as any)._q;
              const hmax = (p as any)._h;
              const curvaH = hmax * (1 - Math.pow(targetCaudalLpm / qmax, 2));
              const excesoH    = Math.abs(curvaH - targetAlturaInput) / targetAlturaInput;
              const excesoQmax = Math.max(0, (qmax - targetCaudalLpm) / targetCaudalLpm);
              const excesoHmax = Math.max(0, (hmax - targetAlturaInput) / targetAlturaInput);
              (p as any).score = excesoH * pesoExcesoH + excesoQmax * pesoExcesoQmax + excesoHmax * pesoExcesoHmax;
           });
        } else {
           if (targetCaudalLpm > 0) {
              conAltura = conAltura.filter(p => (p as any)._q >= targetCaudalLpm * minCaudalTol);
           }
           if (targetAlturaInput > 0) {
              conAltura = conAltura.filter(p => (p as any)._h >= targetAlturaInput);
           }
        }
        
        if (targetCaudalLpm > 0) {
           sinAltura = sinAltura.filter(p => (p as any)._q >= targetCaudalLpm * minCaudalTol || ((p as any)._q === 0 && (p as any)._isEjeLibre));
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
                    rawHp = ((pump as any)._q * (pump as any)._h) / reglas.matematica.divisorHpBomba;
                } else if (pump.calcVal > 0) {
                    rawHp = pump.calcVal;
                } else {
                    rawHp = (targetCaudalLpm * targetAlturaInput) / reglas.matematica.divisorHpBomba;
                }
                
                const pumpTargetHp = (pump.calcVal > 0 && rawHp === pump.calcVal) ? rawHp : rawHp * reglas.matematica.margenSeguridadMotor;
                
                // Si faltan datos y el HP calculado es 0, no podemos saber el target,
                // pero por la "Regla Universal" DEBEMOS sugerir un motor. Asignamos un número inalcanzable
                // para que caiga en el bloque de 'Plan B' (sugerir el mayor posible).
                const searchHp = pumpTargetHp === 0 ? 999999 : pumpTargetHp;
                
                if (pumpTargetHp > highestTargetHp) highestTargetHp = pumpTargetHp;
                
                const isPumpSumergible = String(pump.subcategoria).toUpperCase().includes('SUMERGIBLE') || String(pump.modelo).toUpperCase().includes('SUMERGIBLE') || usoConf?.id === 'pozo';
                
                const validMotors = dbMotors.filter(m => {
                    const mSub = String(m.subcategoria).toUpperCase();
                    const mMod = String(m.modelo).toUpperCase();
                    const isMotorSumergible = mSub.includes('SUMERGIBLE') || mMod.includes('SUMERGIBLE') || mMod.includes('4PD') || mMod.includes('6PD');
                    const tipoOk = isPumpSumergible ? isMotorSumergible : !isMotorSumergible;
                    // Filtrar también por tensión si el vendedor la seleccionó
                    const faseOk = pumpWizard.fase === '220v' || pumpWizard.fase === '380v'
                       ? matchesFase(m, pumpWizard.fase as '220v' | '380v')
                       : true;
                    return tipoOk && faseOk;
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
                   return { ...m, calcVal: mHp, score: (mHp > 0 && mHp >= searchHp) ? mHp - searchHp : 9999 };
                });

                let selectedMotors = validMotors.filter(m => m.calcVal > 0 && m.calcVal >= searchHp && m.calcVal <= searchHp * 1.20);
                
                // Si no hay motores en ese rango (ej: la bomba pide 2500 HP y el mayor es 500 HP)
                if (selectedMotors.length === 0) {
                    const maxCatalogHp = Math.max(...validMotors.map((m: any) => m.calcVal || 0), 0);
                    selectedMotors = validMotors.filter(m => m.calcVal === maxCatalogHp && maxCatalogHp > 0);
                    
                    if (selectedMotors.length > 0) {
                        const m = selectedMotors[0];
                        if (pumpTargetHp === 0) {
                            m.displayValue = `Máx cap. ${maxCatalogHp} HP`;
                            setMotorWarning(`⚠️ Motor de mayor potencia sugerido como referencia. Falta altura (mca) para el exacto.`);
                        } else {
                            m.displayValue = `Máx cap. ${maxCatalogHp} HP`;
                            if (pumpTargetHp > highestTargetHp) {
                                if (targetAlturaInput > 0 && targetCaudalLpm > 0) {
                                    // Calcular limitación real si mantenemos el caudal constante
                                    const maxMCA = (maxCatalogHp * reglas.matematica.divisorHpBomba) / targetCaudalLpm;
                                    setMotorWarning(`⚠️ Requiere ~${Math.round(pumpTargetHp)} HP. Con este motor máximo (${maxCatalogHp} HP), solo elevará hasta ${maxMCA.toFixed(0)} MCA.`);
                                } else {
                                    setMotorWarning(`⚠️ Requiere ~${Math.round(pumpTargetHp)} HP. Se sugiere el motor máximo en stock (${maxCatalogHp} HP) como Plan B.`);
                                }
                            }
                        }
                    }
                }
                
                selectedMotors.forEach(m => {
                    const motorClone = { ...m };
                    motorClone.marca = 'Motor Sugerido: ' + motorClone.marca;
                    motorClone.displayValue = motorClone.displayValue || (motorClone.calcVal > 0 ? `${motorClone.calcVal.toFixed(1)} HP` : '? HP');
                    motorClone.pairedSku = pump.modelo;
                    
                    mResults.push(motorClone);
                    
                    const idxInFiltered = filtered.findIndex(p => p.modelo === pump.modelo);
                    if (idxInFiltered >= 0 && !filtered[idxInFiltered].pairedSku) {
                       filtered[idxInFiltered].pairedSku = motorClone.modelo;
                    }
                });
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

        // Sugerencia de Paneles Solares para Bombas Solares
        if (mResults.length === 0) {
           const bombaSolar = filtered.find(p => {
              const sub = String(p.subcategoria).toUpperCase();
              const mod = String(p.modelo).toUpperCase();
              return sub.includes('SOLAR') || mod.includes('SOLAR');
           });

           if (bombaSolar && bombaSolar.calcVal > 0) {
               // Reparar lectura de Watts de la bomba (para que "350 W" no se multiplique por 745 como si fueran HP)
               let pumpWatts = 0;
               if (bombaSolar.specs) {
                   for (const s of bombaSolar.specs) {
                       const k = String(s[0]).toUpperCase();
                       const v = String(s[1]).toUpperCase();
                       if (k.includes('POTENCIA')) {
                           const n = extractNum(v);
                           if (n) {
                               if (v.includes('W') && !v.includes('KW')) pumpWatts = n; // Esta en Watts puros
                               else if (v.includes('KW')) pumpWatts = n * 1000;
                               else pumpWatts = n * 745.7; // Asumir HP
                           }
                       }
                   }
               }
               // Fallback por si no lo encontramos
               if (pumpWatts === 0) pumpWatts = bombaSolar.calcVal * 745.7; 

               const targetPanelWatts = pumpWatts * 1.4; // 40% margin recommended for solar

               const dbPaneles = await getProductsBySubcategory('PANEL SOLAR', true);
               const validPaneles = dbPaneles.map((p: ParsedProduct): ExtendedCalcProduct => {
                   let panelWatts = 0;
                   if (p.specs) {
                      for (const s of p.specs) {
                         const k = String(s[0]).toUpperCase();
                         // Ignorar atributos que digan VOLTAJE o TENSION para no pisar la potencia real
                         if ((k.includes('POTENCIA') || k.includes('WATT')) && !k.includes('VOLTAJE') && !k.includes('TENSIÓN')) {
                             const n = extractNum(String(s[1]));
                             if (n && n > 10) panelWatts = n;
                         }
                      }
                   }
                   if (panelWatts === 0) {
                       const match = String(p.modelo).match(/(\d+)\s*W/i);
                       if (match) panelWatts = parseInt(match[1]);
                   }
                   return { ...p, calcVal: panelWatts, score: panelWatts > 0 ? 1 : 9999 };
               }).filter(p => p.calcVal > 0).sort((a,b) => b.calcVal - a.calcVal); // prefer bigger panels

               if (validPaneles.length > 0) {
                   const bestPanel = validPaneles[0];
                   const numPanels = Math.ceil(targetPanelWatts / bestPanel.calcVal);
                   const pClone = { ...bestPanel };
                   pClone.marca = 'Panel Sugerido: ' + pClone.marca;
                   pClone.displayValue = `Llevar ${numPanels} unidades de ${bestPanel.calcVal}W`;
                   pClone.pairedSku = bombaSolar.modelo;
                   mResults.push(pClone);

                   const idxInFiltered = filtered.findIndex(p => p.modelo === bombaSolar.modelo);
                   if (idxInFiltered >= 0) filtered[idxInFiltered].pairedSku = pClone.modelo;
                   
                   setMotorResultTitle('Paneles Solares Sugeridos:');
               }
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
      setCatStats(null);
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
       return reglas.categorias.find((u: any) => u.id === pumpWizard.uso)?.title || 'Calculadora';
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
                  {!(bombaTab === 'guiado' && wizardStep > 1) && (
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
                  )}

                  {bombaTab === 'avanzado' ? (
                    <View style={styles.avanzadoContainer}>
                      <Text style={styles.inputTitleSmall}>Filtro de Categoría</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
                        {reglas.categorias.map((u: any) => (
                          <TouchableOpacity 
                            key={u.id}
                            style={[styles.usoListCard, { flexGrow: 1, minWidth: '45%', padding: 10, minHeight: 40, marginRight: 0 }, pumpWizard.uso === u.id && styles.usoCardActive]}
                            onPress={() => setPumpWizard({...pumpWizard, uso: u.id})}
                          >
                            <Text style={[styles.usoListTitle, { fontSize: 12, textAlign: 'center' }, pumpWizard.uso === u.id && styles.usoTitleActive]}>
                              {u.title}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* ── Textos dinámicos desde Supabase (fallback offline) ── */}
                      {(() => {
                        const tx = (reglas as any)?.textos ?? {};
                        const tCaudal   = tx.label_caudal   ?? 'Caudal (m\u00b3/h)';
                        const tLongitud = tx.label_longitud ?? 'Longitud de Ca\u00f1er\u00eda (m)';
                        const tDesnivel = tx.label_desnivel ?? 'Altura a Elevar (m)';
                        const tDiametro = tx.label_diametro ?? 'Di\u00e1metro de Ca\u00f1er\u00eda';
                        const tAccesorios = tx.label_accesorios ?? 'Accesorios (Cantidades)';
                        const tBtnBuscar = tx.btn_buscar ?? 'Buscar Equipos';
                        const tAvisoDiamInsuf  = tx.aviso_diametro_insuficiente ?? '\u26a0 Di\u00e1metro insuficiente';
                        const tAvisoDiamBloq   = tx.aviso_diametro_bloqueado    ?? 'Rango supera tabla de fricci\u00f3n';
                        const tAvisoSinCaudal  = tx.aviso_sin_caudal            ?? 'Ingres\u00e1 el caudal para buscar';

                        // ── Validación de diámetro ──
                        const advQ = parseFloat(adv.caudal) || 0;
                        const currentDiamSt = advQ > 0 ? interpolateFriction(advQ, adv.diamIdx).status : 'ok';
                        const currentDiamInvalid = currentDiamSt === 'above' || currentDiamSt === 'sin-datos';
                        const allDiamsInvalid = advQ > 0 && FRICCION_DIAMS.every((_, idx) => {
                          const s = interpolateFriction(advQ, idx).status;
                          return s === 'above' || s === 'sin-datos';
                        });

                        const hasCaudal = advQ > 0;
                        const hasUso = !!pumpWizard.uso;
                        const canBuscar = hasCaudal && hasUso;

                        return (
                          <>
                            <View style={styles.grid2Cols}>
                              <View style={styles.col}>
                                <Text style={styles.inputTitleSmall}>{tCaudal}</Text>
                                <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 15" placeholderTextColor={COLORS.gray4} value={adv.caudal} onChangeText={(t) => setAdv({...adv, caudal: t})} />
                              </View>
                              <View style={styles.col}>
                                <Text style={styles.inputTitleSmall}>{tDiametro}</Text>
                                <TouchableOpacity
                                  style={[
                                    styles.textInputSmall,
                                    allDiamsInvalid && { opacity: 0.45, backgroundColor: '#f0f0f0' },
                                    currentDiamInvalid && !allDiamsInvalid && { borderColor: '#c0392b', borderWidth: 1.5 }
                                  ]}
                                  onPress={() => !allDiamsInvalid && setShowDiamPicker(true)}
                                  disabled={allDiamsInvalid}
                                >
                                  <Text style={{ color: allDiamsInvalid ? COLORS.gray3 : currentDiamInvalid ? '#c0392b' : COLORS.navy, fontSize: 14 }}>
                                    {FRICCION_DIAMS[adv.diamIdx]}
                                  </Text>
                                  {currentDiamInvalid && !allDiamsInvalid && (
                                    <Text style={{ fontSize: 10, color: '#c0392b', marginTop: 1 }}>{tAvisoDiamInsuf}</Text>
                                  )}
                                  {allDiamsInvalid && (
                                    <Text style={{ fontSize: 10, color: COLORS.gray3, marginTop: 1 }}>{tAvisoDiamBloq}</Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>

                            <View style={styles.grid2Cols}>
                              <View style={styles.col}>
                                <Text style={styles.inputTitleSmall}>{tLongitud}</Text>
                                <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 200" placeholderTextColor={COLORS.gray4} value={adv.lRecta} onChangeText={(t) => setAdv({...adv, lRecta: t})} />
                              </View>
                              <View style={styles.col}>
                                <Text style={styles.inputTitleSmall}>{tDesnivel}</Text>
                                <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 1" placeholderTextColor={COLORS.gray4} value={adv.hGeo} onChangeText={(t) => setAdv({...adv, hGeo: t})} />
                              </View>
                            </View>

                            <Text style={[styles.inputTitleSmall, { marginTop: 5, marginBottom: 5 }]}>{tAccesorios}</Text>
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
                              <View style={[styles.advResultBox, { flexDirection: 'column', padding: 15, alignItems: 'flex-start', gap: 6 }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                                  <Text style={[styles.advResultLbl, { fontSize: 13 }]}>Altura manométrica total:</Text>
                                  <Text style={[styles.advResultVal, { fontSize: 14 }]}>{hTotal.toFixed(2)} mca</Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                                  <Text style={[styles.advResultLbl, { fontSize: 13 }]}>Pérdida por fricción:</Text>
                                  <Text style={[styles.advResultVal, { fontSize: 14 }]}>{perdida.toFixed(2)} mca</Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                                  <Text style={[styles.advResultLbl, { fontSize: 13 }]}>Longitud equivalente total:</Text>
                                  <Text style={[styles.advResultVal, { fontSize: 14 }]}>{lTotal.toFixed(2)} m</Text>
                                </View>
                              </View>
                            )}

                            <TouchableOpacity
                              style={[styles.calculateBtn, { marginTop: 10, paddingVertical: 10 }, !canBuscar && { backgroundColor: COLORS.gray4 }]}
                              onPress={handleCalculate}
                              disabled={!canBuscar}
                            >
                              <Text style={styles.calculateBtnText}>
                                {canBuscar ? tBtnBuscar : (!hasUso ? 'Seleccioná una categoría arriba' : tAvisoSinCaudal)}
                              </Text>
                            </TouchableOpacity>
                          </>
                        );
                      })()}
                    </View>
                  ) : (
                    <View style={styles.guiadoContainer}>
                      {wizardStep === 1 ? (
                        <View>
                          <Text style={styles.inputTitleSmall}>¿Para qué necesita la bomba?</Text>
                          <View style={styles.usosList}>
                            {reglas.categorias.map((u: any) => (
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
                  {calcMode === 'gen' && (
                    <View style={{ marginBottom: 15 }}>
                      <Text style={styles.inputTitleSmall}>Unidad de medida</Text>
                      <View style={[styles.unitTabs, { marginBottom: 15 }]}>
                        <TouchableOpacity style={[styles.unitTabBtn, genUnit === 'KVA' && styles.unitTabBtnActive]} onPress={() => {setGenUnit('KVA'); setHasCalculated(false);}}>
                          <Text style={[styles.unitTabTxt, genUnit === 'KVA' && styles.unitTabTxtActive]}>KVA</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.unitTabBtn, genUnit === 'AMPER' && styles.unitTabBtnActive]} onPress={() => {setGenUnit('AMPER'); setHasCalculated(false);}}>
                          <Text style={[styles.unitTabTxt, genUnit === 'AMPER' && styles.unitTabTxtActive]}>AMPERES</Text>
                        </TouchableOpacity>
                      </View>

                      {genUnit === 'AMPER' && (
                        <View style={{ marginBottom: 15 }}>
                          <Text style={styles.inputTitleSmall}>Tensión eléctrica</Text>
                          <View style={styles.unitTabs}>
                            <TouchableOpacity style={[styles.unitTabBtn, genFase === '220v' && styles.unitTabBtnActive]} onPress={() => {setGenFase('220v'); setHasCalculated(false);}}>
                              <Text style={[styles.unitTabTxt, genFase === '220v' && styles.unitTabTxtActive]}>220V</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.unitTabBtn, genFase === '380v' && styles.unitTabBtnActive]} onPress={() => {setGenFase('380v'); setHasCalculated(false);}}>
                              <Text style={[styles.unitTabTxt, genFase === '380v' && styles.unitTabTxtActive]}>380V</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  <Text style={styles.inputTitleSmall}>
                    {calcMode === 'gen' ? (genUnit === 'KVA' ? 'Valor en KVA' : 'Valor en Amperes') : 'Ingresá el valor (1 a 500 HP)'}
                  </Text>
                  
                  <View style={styles.inputRow}>
                    <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(calcInput) || 0; if (current > 1) { setCalcInput(String(current - 1)); setHasCalculated(false); } }}>
                      <Text style={styles.counterBtnText}>-</Text>
                    </TouchableOpacity>
                    <TextInput style={styles.textInput} keyboardType="numeric" placeholder="Ej: 50" placeholderTextColor={COLORS.gray4} value={calcInput} onChangeText={(t) => { setCalcInput(t); setHasCalculated(false); }} />
                    <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(calcInput) || 0; const max = calcMode === 'gen' ? (genUnit === 'KVA' ? 3000 : 5000) : 500; if (current < max) { setCalcInput(String(current + 1)); setHasCalculated(false); } }}>
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
                      {calcMode === 'gen' ? (() => {
                          let finalKva = parseFloat(calcInput) || 0;
                          if (genUnit === 'AMPER') {
                              if (genFase === '220v') finalKva = (finalKva * 220) / 1000;
                              else finalKva = (finalKva * 380 * 1.732) / 1000;
                          }
                          const equivalentText = genUnit === 'AMPER' ? `(Equivale a ${finalKva.toFixed(1)} KVA)\n\n` : '';
                          return equivalentText + estimateGenerador(finalKva);
                      })() :
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

                {(() => {
                  const PAIRED_COLORS = ['#2E7D32', '#1565C0', '#D84315', '#6A1B9A', '#00838F', '#AD1457'];
                  const pumpColorMap = new Map<string, string>();
                  if (calcResult) {
                     let colorIdx = 0;
                     calcResult.forEach(item => {
                        if (item.pairedSku && !pumpColorMap.has(item.modelo)) {
                           pumpColorMap.set(item.modelo, PAIRED_COLORS[colorIdx % PAIRED_COLORS.length]);
                           colorIdx++;
                        }
                     });
                  }

                  return (
                    <>
                {calcResult && calcResult.length > 0 && (
                  <View style={styles.suggestedContainer}>
                    <Text style={styles.suggestedTitle}>Equipos Sugeridos:</Text>
                    <FlatList
                      data={calcResult}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item, index) => item.modelo + index}
                      renderItem={({ item }) => {
                        const borderColor = pumpColorMap.get(item.modelo) || COLORS.border;
                        const borderWidth = pumpColorMap.has(item.modelo) ? 2 : 1;
                        return (
                        <TouchableOpacity 
                          style={[styles.suggestedCard, { borderColor: borderColor, borderWidth: borderWidth }]}
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
                            <View style={[styles.pairedBadge, { backgroundColor: borderColor }]}>
                              <Text style={styles.pairedBadgeText}>🔗 Requiere componente</Text>
                            </View>
                          )}
                          <Text style={styles.suggestedMarca} numberOfLines={1}>{item.marca}</Text>
                          <Text style={styles.suggestedModelo} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={[styles.suggestedVal, pumpColorMap.has(item.modelo) && {color: borderColor}]}>
                            {item.displayValue || (calcMode === 'gen' ? `${item.calcVal} KVA` : calcMode === 'motor' ? `${item.calcVal} HP` : `${item.calcVal > 0 ? item.calcVal.toFixed(1) : '?'} HP`)}
                          </Text>
                        </TouchableOpacity>
                        );
                      }}
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
                      renderItem={({ item }) => {
                        // The motor is paired TO a pump. The pump's sku is item.pairedSku
                        const parentColor = item.pairedSku ? pumpColorMap.get(item.pairedSku) : null;
                        const borderColor = parentColor || COLORS.green;
                        return (
                        <TouchableOpacity 
                          style={[styles.suggestedCard, { borderColor: borderColor, borderWidth: 2 }]}
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
                            <View style={[styles.pairedBadge, { backgroundColor: borderColor }]}>
                              <Text style={styles.pairedBadgeText}>🔗 Para: {item.pairedSku}</Text>
                            </View>
                          )}
                          <Text style={styles.suggestedMarca} numberOfLines={1}>{item.marca}</Text>
                          <Text style={styles.suggestedModelo} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={[styles.suggestedVal, {color: borderColor}]}>
                            {item.displayValue || `${item.calcVal} HP`}
                          </Text>
                        </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                )}
                    </>
                  );
                })()}
                </View>
              )}

            </View>
          )}
          </ScrollView>
        </View>

        <Modal visible={showDiamPicker} transparent animationType="fade" onRequestClose={() => setShowDiamPicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: '80%', backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '80%' }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.navy, marginBottom: 4, textAlign: 'center' }}>Seleccione Diámetro</Text>
              <Text style={{ fontSize: 12, color: COLORS.gray3, marginBottom: 15, textAlign: 'center' }}>
                {parseFloat(adv.caudal) > 0 ? `Para ${adv.caudal} ${adv.unidadCaudal} — los grises no son válidos` : 'Ingresá el caudal primero para ver opciones válidas'}
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {FRICCION_DIAMS.map((d, index) => {
                  const qRaw = parseFloat(adv.caudal) || 0;
                  let qM3h = qRaw;
                  if (adv.unidadCaudal === 'l/min') qM3h = qRaw * 60 / 1000;
                  else if (adv.unidadCaudal === 'l/h') qM3h = qRaw / 1000;
                  const { status } = qM3h > 0 ? interpolateFriction(qM3h, index) : { status: 'ok' as const };
                  const isInvalid = status === 'above' || status === 'sin-datos';
                  const isSelected = adv.diamIdx === index;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', opacity: isInvalid ? 0.3 : 1 }}
                      onPress={() => { setAdv({...adv, diamIdx: index}); setShowDiamPicker(false); }}
                      disabled={isInvalid}
                    >
                      <Text style={{ fontSize: 16, color: isSelected ? COLORS.green : (isInvalid ? COLORS.gray3 : COLORS.navy), fontWeight: isSelected ? 'bold' : 'normal' }}>
                        {d}
                      </Text>
                      {isInvalid && <Text style={{ fontSize: 11, color: '#c0392b', marginLeft: 8 }}>✗ caudal excede límite</Text>}
                      {isSelected && !isInvalid && <Text style={{ fontSize: 11, color: COLORS.green, marginLeft: 8 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={{ marginTop: 15, padding: 12, backgroundColor: COLORS.navy, borderRadius: 8 }} onPress={() => setShowDiamPicker(false)}>
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
