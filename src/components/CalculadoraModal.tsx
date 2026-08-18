import * as Sentry from '@sentry/react-native';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput, FlatList, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
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
};

export default function CalculadoraModal({ visible, onClose, navigation }: CalculadoraModalProps) {
  const [calcMode, setCalcMode] = useState('');
  const [calcInput, setCalcInput] = useState('');
  const [bombaTab, setBombaTab] = useState<'guiado' | 'avanzado'>('guiado');
  const [wizardStep, setWizardStep] = useState(1);
  const [pumpWizard, setPumpWizard] = useState<PumpWizardState>({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '' });
  
  // Advanced state
  const [adv, setAdv] = useState({ caudal: '', diamIdx: 4, lRecta: '', hGeo: '', acc: [0,0,0,0,0,0] });

  const [calcResult, setCalcResult] = useState<ExtendedCalcProduct[] | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [waitingForCatalog, setWaitingForCatalog] = useState(false);

  useEffect(() => {
    if (!visible) {
      setHasCalculated(false);
      setCalcResult(null);
      setCalcInput('');
      setCalcMode('');
      setWaitingForCatalog(false);
      setBombaTab('guiado');
      setWizardStep(1);
      setPumpWizard({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '' });
      setAdv({ caudal: '', diamIdx: 4, lRecta: '', hGeo: '', acc: [0,0,0,0,0,0] });
    }
  }, [visible]);

  function extractNum(val: string | null | undefined): number | null {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/([\d]+[\.,]?[\d]*)/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.'));
  }

  // Advanced friction math
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
           targetCaudalLpm = targetCaudalInput;
           if (pumpWizard.unidadCaudal === 'm3/h') targetCaudalLpm = targetCaudalInput * 16.6667;
           if (pumpWizard.unidadCaudal === 'l/h') targetCaudalLpm = targetCaudalInput / 60;
        } else {
           // Modo Avanzado
           targetCaudalInput = parseFloat(adv.caudal) || 0;
           targetCaudalLpm = targetCaudalInput * 16.6667; // m3/h to lpm
           targetAlturaInput = hTotal;
           reqFase = ''; // Sin filtro de fase en avanzado por defecto
        }
        
        let targetHp = (targetCaudalLpm * targetAlturaInput) / 2736;
        if (targetHp > 0 && targetHp < 0.5) targetHp = 0.5;
        
        const dbProducts = await getProductsBySubcategory('BOMBA', true);
        
        const mapped = dbProducts.map((p: ParsedProduct): ExtendedCalcProduct => {
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
                     if (valStr.includes(' W') || valStr.match(/\d+W/)) n = n * 0.00134;
                     if (n > hpVal) hpVal = n;
                  }
               }
               
               if (key.includes('CAUDAL') || key.includes('FLUJO')) {
                  const nums = valStr.match(/([\d]+[\.,]?[\d]*)/g);
                  if (nums) {
                     const maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',','.'))));
                     let valLpm = maxNum;
                     if (valStr.includes('M3/H') || valStr.includes('M³/H')) valLpm = maxNum * 16.6667;
                     if (valStr.includes('L/H')) valLpm = maxNum / 60;
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
           
           if (!is220 && !is380) {
              if (hpVal <= 3) is220 = true;
              else is380 = true;
           }

           let score = 999999;
           if (hpVal > 0) {
               score = Math.abs(hpVal - targetHp); 
           } else {
               score = 9999;
           }

           if (maxCaudalLpm > 0 && maxAlturaMca > 0) {
              if (maxCaudalLpm >= targetCaudalLpm && maxAlturaMca >= targetAlturaInput) {
                 score -= 5; 
              } else {
                 score += 10; 
              }
           }
           
           if (reqFase === 'sinelec' && (is220 || is380)) score = -1;
           if (reqFase === '220v' && !is220) score = -1;
           if (reqFase === '380v' && !is380) score = -1;

           let displayVal = hpVal > 0 ? `${hpVal.toFixed(1)} HP` : '? HP';
           if (hpVal === 0 || p.modelo.toUpperCase().includes('EJE LIBRE') || p.modelo.toUpperCase().includes('SIN MOTOR')) {
              if (maxCaudalLpm > 0 && maxAlturaMca > 0) {
                 displayVal = `Máx: ${maxCaudalLpm.toFixed(0)}L/m | ${maxAlturaMca.toFixed(0)}mca`;
              } else if (maxCaudalLpm > 0) {
                 displayVal = `Máx: ${maxCaudalLpm.toFixed(0)} L/min`;
              } else if (maxAlturaMca > 0) {
                 displayVal = `Máx: ${maxAlturaMca.toFixed(0)} m.c.a`;
              } else {
                 displayVal = 'Eje Libre / Sin Motor';
              }
           }

           return { ...p, calcVal: hpVal, score, displayValue: displayVal };
        });

        filtered = mapped.filter((p) => {
            if ((p.score ?? -1) < 0) return false;
            if (bombaTab === 'guiado') {
               const sub = String(p.subcategoria).toUpperCase();
               const uso = pumpWizard.uso;
               if (uso === 'vivienda' && !sub.includes('AGUA') && !sub.includes('CENTRÍFUGA') && !sub.includes('PRESURIZA') && !sub.includes('PERIFÉRICA')) return false;
               if (uso === 'pozo' && !sub.includes('SUMERGIBLE') && !sub.includes('PROFUNDO')) return false;
               if (uso === 'drenaje' && !sub.includes('ACHIQUE') && !sub.includes('DRENAJE') && !sub.includes('SUCIA')) return false;
               if (uso === 'piscina' && !sub.includes('PISCINA') && !sub.includes('PILETA')) return false;
               if (uso === 'combustion') {
                  let hasFuel = false;
                  if (sub.includes('COMBUSTIÓN') || sub.includes('NAFTERA') || sub.includes('DIESEL') || sub.includes('GASOLINA') || sub.includes('NAFTA')) hasFuel = true;
                  if (p.specs) {
                    const allSpecs = JSON.stringify(p.specs).toUpperCase();
                    if (allSpecs.includes('NAFTA') || allSpecs.includes('DIESEL') || allSpecs.includes('GASOLINA') || allSpecs.includes('COMBUSTIÓN') || allSpecs.includes('CILINDRADA')) hasFuel = true;
                  }
                  return hasFuel;
               }
            }
            return true;
         })
         .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
         .map((p) => {
            const { score, ...rest } = p;
            return rest as ExtendedCalcProduct;
         })
         .slice(0, 4);

         const hasEjeLibre = filtered.some(p => p.calcVal === 0 || p.modelo.toUpperCase().includes('EJE LIBRE') || p.modelo.toUpperCase().includes('SIN MOTOR'));
         
         if (hasEjeLibre && targetHp > 0) {
            const dbMotors = await getProductsBySubcategory('MOTOR', true);
            const bestMotor = dbMotors.map((m: ParsedProduct): ExtendedCalcProduct => {
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
               return { ...m, calcVal: mHp, score: mHp >= targetHp ? mHp - targetHp : 9999 };
            }).filter((m) => m.score !== undefined && m.score >= 0 && m.score < 1000)
            .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))[0];
            
            if (bestMotor) {
               bestMotor.marca = 'Sugerencia de motor: ' + bestMotor.marca;
               bestMotor.displayValue = bestMotor.calcVal > 0 ? `${bestMotor.calcVal.toFixed(1)} HP` : '? HP';
               filtered.push(bestMotor);
            }
         }
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

  useEffect(() => {
    if (visible && calcMode && calcResult && calcResult.length === 0 && !waitingForCatalog) {
       handleCalculate();
    }
  }, [waitingForCatalog]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Calculadora Beta</Text>
            <TouchableOpacity onPress={() => {
              if (calcMode) {
                setCalcMode('');
                setHasCalculated(false);
                setCalcResult(null);
                setBombaTab('guiado');
                setWizardStep(1);
              } else {
                onClose();
              }
            }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!calcMode ? (
            <View>
              <Text style={styles.subtitle}>Seleccioná un tipo de equipo para hacer un cálculo rápido:</Text>
              <View style={styles.optionsContainer}>
                <TouchableOpacity onPress={() => { setCalcMode('gen'); setHasCalculated(false); setCalcResult(null); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="gen" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Generador Eléctrico</Text>
                    <Text style={styles.optionSubtitle}>Cálculo rápido en KVA</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('motor'); setHasCalculated(false); setCalcResult(null); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="motor" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Motor Eléctrico</Text>
                    <Text style={styles.optionSubtitle}>Cálculo rápido en HP</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('bomba'); setBombaTab('guiado'); setHasCalculated(false); setCalcResult(null); setWizardStep(1); }} style={styles.optionCard}>
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
                      onPress={() => { setBombaTab('guiado'); setHasCalculated(false); setCalcResult(null); }}
                    >
                      <Text style={[styles.tabText, bombaTab === 'guiado' && styles.tabTextActive]}>GUIADO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.tabBtn, bombaTab === 'avanzado' && styles.tabBtnActive]} 
                      onPress={() => { setBombaTab('avanzado'); setHasCalculated(false); setCalcResult(null); }}
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
                        style={[styles.calculateBtn, {marginTop: 10, paddingVertical: 10}, (!adv.caudal || !adv.lRecta || !adv.hGeo || status==='sin-datos') && { backgroundColor: COLORS.gray4 }]} 
                        disabled={!adv.caudal || !adv.lRecta || !adv.hGeo || status==='sin-datos'}
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
                          <View style={styles.usosGrid}>
                            {['vivienda', 'riego', 'pozo', 'drenaje', 'piscina', 'combustion'].map(uso => (
                              <TouchableOpacity 
                                key={uso}
                                style={[styles.usoCard, pumpWizard.uso === uso && styles.usoCardActive]}
                                onPress={() => setPumpWizard({...pumpWizard, uso})}
                              >
                                <Text style={[styles.usoTitle, pumpWizard.uso === uso && styles.usoTitleActive]}>
                                  {uso === 'vivienda' ? 'Vivienda' : uso === 'riego' ? 'Riego' : uso === 'pozo' ? 'Pozo' : uso === 'drenaje' ? 'Drenaje' : uso === 'piscina' ? 'Piscina' : 'Combustión'}
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
                          <TouchableOpacity style={styles.backBtn} onPress={() => { setWizardStep(1); setHasCalculated(false); setCalcResult(null); }}>
                            <Text style={styles.backBtnText}>← Volver a Uso</Text>
                          </TouchableOpacity>

                          <View style={styles.grid2Cols}>
                             <View style={styles.col}>
                                <Text style={styles.inputTitleSmall}>Caudal</Text>
                                <View style={styles.caudalRow}>
                                  <TextInput style={[styles.textInputSmall, { flex: 1, marginHorizontal: 0, marginRight: 5 }]} keyboardType="numeric" placeholder="Ej: 100" placeholderTextColor={COLORS.gray4} value={pumpWizard.caudal} onChangeText={(t) => setPumpWizard({...pumpWizard, caudal: t})} />
                                  <TouchableOpacity onPress={() => setPumpWizard({...pumpWizard, unidadCaudal: pumpWizard.unidadCaudal === 'l/min' ? 'm3/h' : 'l/min'})} style={styles.unitBtnSmall}>
                                     <Text style={styles.unitBtnTextSmall}>{pumpWizard.unidadCaudal}</Text>
                                  </TouchableOpacity>
                                </View>
                             </View>
                             <View style={styles.col}>
                                <Text style={styles.inputTitleSmall}>Altura (mca)</Text>
                                <TextInput style={[styles.textInputSmall, { marginHorizontal: 0 }]} keyboardType="numeric" placeholder="Ej: 20" placeholderTextColor={COLORS.gray4} value={pumpWizard.altura} onChangeText={(t) => setPumpWizard({...pumpWizard, altura: t})} />
                             </View>
                          </View>

                          <Text style={styles.inputTitleSmall}>Alimentación Eléctrica (Opcional)</Text>
                          <View style={styles.faseGrid}>
                            <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '220v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '220v' ? '' : '220v'})}>
                              <Text style={[styles.faseBtnText, pumpWizard.fase === '220v' && styles.faseBtnTextActive]}>220V</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '380v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '380v' ? '' : '380v'})}>
                              <Text style={[styles.faseBtnText, pumpWizard.fase === '380v' && styles.faseBtnTextActive]}>380V</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === 'nose' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === 'nose' ? '' : 'nose'})}>
                              <Text style={[styles.faseBtnText, pumpWizard.fase === 'nose' && styles.faseBtnTextActive]}>No sé</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === 'sinelec' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === 'sinelec' ? '' : 'sinelec'})}>
                              <Text style={[styles.faseBtnText, pumpWizard.fase === 'sinelec' && styles.faseBtnTextActive]}>Sin Motor</Text>
                            </TouchableOpacity>
                          </View>

                          <TouchableOpacity 
                            style={[styles.calculateBtn, {paddingVertical: 10, marginBottom: 5}, (!pumpWizard.caudal || !pumpWizard.altura) && { backgroundColor: COLORS.gray4 }]} 
                            disabled={!pumpWizard.caudal || !pumpWizard.altura}
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
                          style={[styles.suggestedCard, item.marca.includes('Sugerencia de motor') && { borderColor: COLORS.green, borderWidth: 2 }]}
                          onPress={() => {
                              navigation.navigate('ProductViewer', { sku: item.modelo, contextSkus: calcResult.map(r => r.modelo) });
                          }}
                        >
                          {item.imagen ? (
                            <Image source={{ uri: item.imagen }} style={styles.suggestedImg} contentFit="contain" />
                          ) : (
                            <View style={styles.suggestedImgPlaceholder} />
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
  usosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  usoCard: {
    width: '31%',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  usoCardActive: {
    backgroundColor: '#E6F0F9',
    borderColor: COLORS.navy
  },
  usoTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.gray4,
    textAlign: 'center'
  },
  usoTitleActive: {
    color: COLORS.navy
  },
  caudalRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  unitBtnSmall: {
    backgroundColor: COLORS.navy,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center'
  },
  unitBtnTextSmall: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: 'bold'
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
    color: COLORS.gray4,
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
    fontSize: 11
  },
  advWarn: {
    fontSize: 11,
    color: '#e0a93a',
    textAlign: 'center',
    marginBottom: 5
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
  }
});
