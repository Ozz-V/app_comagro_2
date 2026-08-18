import * as Sentry from '@sentry/react-native';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';
import SvgIcon from './SvgIcon';
import { getProductsBySubcategory } from '../utils/database';
import { isCatalogSyncing, subscribeToCatalogUpdates } from '../services/catalogService';
import { estimateGenerador, estimateMotor, estimateBomba, TipoBomba } from '../utils/CapacityEstimator';
import { ParsedProduct, CalcProduct, PumpWizardState, SpecTuple } from '../types';

interface CalculadoraModalProps {
  visible: boolean;
  onClose: () => void;
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; [key: string]: unknown };
  allProdsCache?: ParsedProduct[];
}

export default function CalculadoraModal({ visible, onClose, navigation, allProdsCache }: CalculadoraModalProps) {
  const [calcMode, setCalcMode] = useState('');
  const [calcInput, setCalcInput] = useState('');
  const [calcInput2, setCalcInput2] = useState('');
  const [bombaTab, setBombaTab] = useState<'guiado' | 'avanzado'>('guiado');
  const [pumpWizard, setPumpWizard] = useState<PumpWizardState>({ uso: '', caudal: '', unidadCaudal: 'm3/h', altura: '', fase: '' });
  const [calcResult, setCalcResult] = useState<CalcProduct[] | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [waitingForCatalog, setWaitingForCatalog] = useState(false);

  useEffect(() => {
    if (!visible) {
      setHasCalculated(false);
      setCalcResult(null);
      setCalcInput('');
      setCalcInput2('');
      setCalcMode('');
      setWaitingForCatalog(false);
      setBombaTab('guiado');
      setPumpWizard({ uso: '', caudal: '', unidadCaudal: 'm3/h', altura: '', fase: '' });
    }
  }, [visible]);

  function extractNum(val: string | null | undefined): number | null {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/([\d]+[\.,]?[\d]*)/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.'));
  }

  async function handleCalculate() {
    if (calcMode === 'bomba' && !pumpWizard.uso && bombaTab === 'guiado') {
      alert("Por favor seleccioná el uso de la bomba.");
      return;
    }
    
    setHasCalculated(true);
    let filtered: CalcProduct[] = [];
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
        }).map((p: ParsedProduct): CalcProduct => {
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
        }).filter((p: CalcProduct) => p.calcVal > 0)
        .sort((a: CalcProduct, b: CalcProduct) => Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target)).slice(0, 5);
      } else if (calcMode === 'motor') {
        const target = parseFloat(calcInput) || 0;
        const dbProducts = await getProductsBySubcategory('MOTOR', true);
        filtered = dbProducts.filter((p: ParsedProduct) => {
          const sub = String(p.subcategoria).toUpperCase();
          return sub.includes('ELEC') || sub.includes('ELÉC');
        }).map((p: ParsedProduct): CalcProduct => {
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
        }).filter((p: CalcProduct) => p.calcVal > 0)
        .sort((a: CalcProduct, b: CalcProduct) => Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target)).slice(0, 5);
      } else if (calcMode === 'bomba') {
        const targetCaudalInput = parseFloat(pumpWizard.caudal) || 0;
        const targetAlturaInput = parseFloat(pumpWizard.altura) || 0;
        const reqFase = pumpWizard.fase;
        
        let targetCaudalLpm = targetCaudalInput;
        if (pumpWizard.unidadCaudal === 'm3/h') targetCaudalLpm = targetCaudalInput * 16.6667;
        if (pumpWizard.unidadCaudal === 'l/h') targetCaudalLpm = targetCaudalInput / 60;
        
        const dbProducts = await getProductsBySubcategory('BOMBA', true);
        
        const mapped = dbProducts.map((p: ParsedProduct): CalcProduct & { score?: number } => {
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
           if (maxCaudalLpm > 0 && maxAlturaMca > 0) {
              if (maxCaudalLpm >= targetCaudalLpm && maxAlturaMca >= targetAlturaInput) {
                 score = (maxCaudalLpm - targetCaudalLpm) + (maxAlturaMca - targetAlturaInput);
              } else {
                 score = -1;
              }
           } else {
             if (targetCaudalInput === 0 && targetAlturaInput === 0) {
                score = 1000;
             } else {
                score = -1;
             }
           }
           
           if (reqFase === '220v' && !is220) score = -1;
           if (reqFase === '380v' && !is380) score = -1;

           return { ...p, calcVal: hpVal, score };
        });

        filtered = mapped.filter((p: CalcProduct & { score?: number }) => {
            if ((p.score ?? -1) < 0) return false;
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
            return true;
         })
         .sort((a: CalcProduct & { score?: number }, b: CalcProduct & { score?: number }) => (a.score ?? 999) - (b.score ?? 999))
         .map((p: CalcProduct & { score?: number }) => {
            const { score, ...rest } = p;
            return rest as CalcProduct;
         })
         .slice(0, 5);
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
        handleCalculate();
      }
    });
    return unsubscribe;
  }, [visible, waitingForCatalog]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
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
                setPumpWizard({ uso: '', caudal: '', unidadCaudal: 'm3/h', altura: '', fase: '' });
              } else {
                onClose();
              }
            }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false}>
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

                <TouchableOpacity onPress={() => { setCalcMode('bomba'); setBombaTab('guiado'); setHasCalculated(false); setCalcResult(null); setPumpWizard({ uso: '', caudal: '', unidadCaudal: 'm3/h', altura: '', fase: '' }); }} style={styles.optionCard}>
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
                      onPress={() => setBombaTab('guiado')}
                    >
                      <Text style={[styles.tabText, bombaTab === 'guiado' && styles.tabTextActive]}>RECOMENDADOR GUIADO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.tabBtn, bombaTab === 'avanzado' && styles.tabBtnActive]} 
                      onPress={() => setBombaTab('avanzado')}
                    >
                      <Text style={[styles.tabText, bombaTab === 'avanzado' && styles.tabTextActive]}>CÁLCULO AVANZADO</Text>
                    </TouchableOpacity>
                  </View>

                  {bombaTab === 'avanzado' ? (
                    <View style={styles.avanzadoPlaceholder}>
                      <Text style={styles.avanzadoText}>Sección en construcción.</Text>
                      <Text style={styles.avanzadoSub}>Próximamente: Cálculo de fricción de cañerías.</Text>
                    </View>
                  ) : (
                    <View style={styles.guiadoContainer}>
                      <Text style={styles.inputTitle}>1. ¿Para qué necesita la bomba?</Text>
                      <View style={styles.usosGrid}>
                        {['vivienda', 'riego', 'pozo', 'drenaje', 'piscina', 'combustion'].map(uso => (
                          <TouchableOpacity 
                            key={uso}
                            style={[styles.usoCard, pumpWizard.uso === uso && styles.usoCardActive]}
                            onPress={() => setPumpWizard({...pumpWizard, uso})}
                          >
                            <Text style={[styles.usoTitle, pumpWizard.uso === uso && styles.usoTitleActive]}>
                              {uso === 'vivienda' ? 'Vivienda / Uso Gral' : uso === 'riego' ? 'Riego / Agrícola' : uso === 'pozo' ? 'Pozo Profundo' : uso === 'drenaje' ? 'Achique / Drenaje' : uso === 'piscina' ? 'Piscina' : 'Motobombas'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.inputTitle}>2. Caudal Necesario</Text>
                      <View style={styles.caudalRow}>
                        <TextInput
                          style={[styles.textInput, { flex: 1, marginHorizontal: 0, marginRight: 10 }]}
                          keyboardType="numeric"
                          placeholder="Ej: 100"
                          placeholderTextColor={COLORS.gray4}
                          value={pumpWizard.caudal}
                          onChangeText={(t) => setPumpWizard({...pumpWizard, caudal: t})}
                        />
                        <View style={styles.unitPickerContainer}>
                           <TouchableOpacity onPress={() => setPumpWizard({...pumpWizard, unidadCaudal: 'l/min'})} style={[styles.unitBtn, pumpWizard.unidadCaudal === 'l/min' && styles.unitBtnActive]}>
                              <Text style={[styles.unitBtnText, pumpWizard.unidadCaudal === 'l/min' && styles.unitBtnTextActive]}>l/min</Text>
                           </TouchableOpacity>
                           <TouchableOpacity onPress={() => setPumpWizard({...pumpWizard, unidadCaudal: 'm3/h'})} style={[styles.unitBtn, pumpWizard.unidadCaudal === 'm3/h' && styles.unitBtnActive]}>
                              <Text style={[styles.unitBtnText, pumpWizard.unidadCaudal === 'm3/h' && styles.unitBtnTextActive]}>m³/h</Text>
                           </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={styles.inputTitle}>3. Altura Manométrica (m.c.a.)</Text>
                      <TextInput
                        style={[styles.textInput, { marginHorizontal: 0, marginBottom: 20 }]}
                        keyboardType="numeric"
                        placeholder="Ej: 20"
                        placeholderTextColor={COLORS.gray4}
                        value={pumpWizard.altura}
                        onChangeText={(t) => setPumpWizard({...pumpWizard, altura: t})}
                      />

                      <Text style={styles.inputTitle}>4. Alimentación Eléctrica (Opcional)</Text>
                      <View style={styles.faseRow}>
                        <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '220v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '220v' ? '' : '220v'})}>
                          <Text style={[styles.faseBtnText, pumpWizard.fase === '220v' && styles.faseBtnTextActive]}>Monofásico (220V)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '380v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '380v' ? '' : '380v'})}>
                          <Text style={[styles.faseBtnText, pumpWizard.fase === '380v' && styles.faseBtnTextActive]}>Trifásico (380V)</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity style={styles.calculateBtn} onPress={handleCalculate}>
                        <Text style={styles.calculateBtnText}>Ver Recomendaciones</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View>
                  <Text style={styles.inputTitle}>
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
                        No encontramos equipos que coincidan con ese valor. Probá con otro número.
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
                      keyExtractor={item => item.modelo}
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
                          <Text style={styles.suggestedMarca} numberOfLines={1}>{item.marca}</Text>
                          <Text style={styles.suggestedModelo} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={styles.suggestedVal}>
                            {calcMode === 'gen' ? `${item.calcVal} KVA` : calcMode === 'motor' ? `${item.calcVal} HP` : `${item.calcVal > 0 ? item.calcVal.toFixed(1) : '?'} HP`}
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
    padding: 24,
    height: '90%'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.navy
  },
  closeBtn: {
    fontSize: 24,
    color: COLORS.gray4
  },
  subtitle: {
    color: COLORS.gray4,
    marginBottom: 15
  },
  optionsContainer: {
    flexDirection: 'column',
    gap: 14,
    marginBottom: 20
  },
  optionCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.white
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16
  },
  optionTextContainer: {
    flex: 1
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.navy
  },
  optionSubtitle: {
    fontSize: 13,
    color: COLORS.gray4,
    marginTop: 2
  },
  arrowIcon: {
    fontSize: 24,
    color: COLORS.gray4
  },
  inputTitle: {
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 10
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  counterBtn: {
    backgroundColor: COLORS.navy,
    width: 50,
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  counterBtnText: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: 'bold'
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    color: '#000',
    backgroundColor: '#F0F4F8',
    marginHorizontal: 10,
    textAlign: 'center'
  },
  calculateBtn: {
    backgroundColor: COLORS.green,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20
  },
  calculateBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16
  },
  resultContainer: {
    marginBottom: 20
  },
  estimationBox: {
    backgroundColor: '#E3FAED',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.green
  },
  estimationTitle: {
    fontWeight: 'bold',
    color: COLORS.green,
    marginBottom: 10
  },
  estimationText: {
    color: COLORS.navy,
    fontSize: 14
  },
  suggestedContainer: {
    marginTop: 10
  },
  suggestedTitle: {
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 10
  },
  suggestedCard: {
    width: 140,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginRight: 10
  },
  suggestedImg: {
    width: '100%',
    height: 80,
    marginBottom: 10
  },
  suggestedImgPlaceholder: {
    width: '100%',
    height: 80,
    backgroundColor: '#f0f0f0',
    marginBottom: 10,
    borderRadius: 4
  },
  suggestedMarca: {
    fontSize: 10,
    color: COLORS.gray4,
    fontWeight: 'bold'
  },
  suggestedModelo: {
    fontSize: 12,
    color: COLORS.navy,
    fontWeight: 'bold',
    marginBottom: 5
  },
  suggestedVal: {
    fontSize: 11,
    color: COLORS.green,
    fontWeight: 'bold'
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center'
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.navy
  },
  tabText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.gray4
  },
  tabTextActive: {
    color: COLORS.navy
  },
  guiadoContainer: {
    paddingBottom: 20
  },
  usosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20
  },
  usoCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    padding: 15,
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
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.gray4,
    textAlign: 'center'
  },
  usoTitleActive: {
    color: COLORS.navy
  },
  caudalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  unitPickerContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden'
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  unitBtnActive: {
    backgroundColor: COLORS.navy
  },
  unitBtnText: {
    fontSize: 14,
    color: COLORS.gray4,
    fontWeight: 'bold'
  },
  unitBtnTextActive: {
    color: COLORS.white
  },
  faseRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 25
  },
  faseBtn: {
    flex: 1,
    padding: 12,
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
    fontWeight: 'bold'
  },
  faseBtnTextActive: {
    color: COLORS.white
  },
  avanzadoPlaceholder: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed'
  },
  avanzadoText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.navy,
    marginBottom: 10
  },
  avanzadoSub: {
    fontSize: 13,
    color: COLORS.gray4,
    textAlign: 'center'
  }
});
