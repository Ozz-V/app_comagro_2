import * as Sentry from '@sentry/react-native';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput, FlatList, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';
import SvgIcon from './SvgIcon';
import { getProductsBySubcategory } from '../utils/database';
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
  const [pumpWizard, setPumpWizard] = useState<PumpWizardState>({ step: 0, type: '', appType: '', waterType: '', params: {} });
  const [calcResult, setCalcResult] = useState<CalcProduct[] | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);

  useEffect(() => {
    if (!visible) {
      setHasCalculated(false);
      setCalcResult(null);
      setCalcInput('');
      setCalcInput2('');
      setCalcMode('');
      setPumpWizard({ step: 0, type: '', appType: '', waterType: '', params: {} });
    }
  }, [visible]);

  function extractNum(val: string | null | undefined): number | null {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/([\d]+[\.,]?[\d]*)/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.'));
  }

  async function handleCalculate() {
    if (calcMode === 'bomba' && !pumpWizard.type) {
      alert("Por favor seleccioná el tipo de bomba.");
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
        const target = parseFloat(calcInput) || 0;
        const dbProducts = await getProductsBySubcategory('BOMBA', true);
        filtered = dbProducts.map((p: ParsedProduct): CalcProduct => {
           let hpVal = 0;
           if (p.specs) {
             p.specs.forEach((s: SpecTuple) => {
               const key = String(s[0]).toUpperCase();
               const val = String(s[1]).toUpperCase();
               if (key.includes('HP') || key.includes('POTENCIA')) {
                  let n = extractNum(s[1]);
                  if (n) {
                     if (val.includes('KW')) n = n * 1.34;
                     if (val.includes(' W') || val.match(/\d+W/)) n = n * 0.00134;
                     if (n > hpVal) hpVal = n;
                  }
               }
             });
           }
           return { ...p, calcVal: hpVal };
         }).filter((p: CalcProduct) => {
            const sub = String(p.subcategoria).toUpperCase();
            if (pumpWizard.type === 'hogar' && !sub.includes('AGUA') && !sub.includes('CENTRÍFUGA') && !sub.includes('PRESURIZA') && !sub.includes('PERIFÉRICA')) return false;
            if (pumpWizard.type === 'pozo' && !sub.includes('SUMERGIBLE') && !sub.includes('PROFUNDO')) return false;
            if (pumpWizard.type === 'drenaje' && !sub.includes('ACHIQUE') && !sub.includes('DRENAJE') && !sub.includes('SUCIA')) return false;
            if (pumpWizard.type === 'piscina' && !sub.includes('PISCINA') && !sub.includes('PILETA')) return false;
            if (pumpWizard.type === 'combustion') {
               let hasFuel = false;
               if (sub.includes('COMBUSTIÓN') || sub.includes('NAFTERA') || sub.includes('DIESEL') || sub.includes('DIÉSEL') || sub.includes('GASOLINA') || sub.includes('NAFTA')) {
                   hasFuel = true;
               }
               if (p.specs) {
                 const allSpecs = JSON.stringify(p.specs).toUpperCase();
                 if (allSpecs.includes('NAFTA') || allSpecs.includes('DIESEL') || allSpecs.includes('DIÉSEL') || allSpecs.includes('GASOLINA') || allSpecs.includes('COMBUSTIÓN') || allSpecs.includes('CILINDRADA') || allSpecs.includes(' CC') || allSpecs.includes('COMBUSTIBLE')) {
                     hasFuel = true;
                 }
               }
               return hasFuel;
            }
            return true;
         }).filter((p: CalcProduct) => p.calcVal > 0)
         .sort((a: CalcProduct, b: CalcProduct) => {
            return Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target);
         }).slice(0, 5);
      }
    } catch (e: unknown) {
      Sentry.captureException(e);
    }
    setCalcResult(filtered);
  }

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
                setPumpWizard({ step: 0, type: '', appType: '', waterType: '', params: {} });
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

                <TouchableOpacity onPress={() => { setCalcMode('bomba'); setHasCalculated(false); setCalcResult(null); setPumpWizard({ step: 1, type: '', appType: '', waterType: '', params: {} }); }} style={styles.optionCard}>
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

              <Text style={styles.inputTitle}>
                {calcMode === 'gen' ? 'Ingresá el valor (1 a 3000 KVA)' : calcMode === 'motor' ? 'Ingresá el valor (1 a 500 HP)' : 'Ingresá la potencia en HP'}
              </Text>
              
              {calcMode === 'bomba' && pumpWizard.step === 1 ? (
                <View style={styles.pumpOptionsContainer}>
                  <Text style={styles.pumpSubtitle}>¿Qué tipo de bomba estás buscando?</Text>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'hogar', appType: '', waterType: '', params: {} })} style={styles.pumpOptionCard}>
                    <View style={styles.pumpOptionTextContainer}>
                      <Text style={styles.pumpOptionTitle}>Superficie / Periférica</Text>
                      <Text style={styles.pumpOptionSubtitle}>Tanques elevados, presurización, riego</Text>
                    </View>
                    <Text style={styles.pumpArrowIcon}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'pozo', appType: '', waterType: '', params: {} })} style={styles.pumpOptionCard}>
                    <View style={styles.pumpOptionTextContainer}>
                      <Text style={styles.pumpOptionTitle}>Sumergible de Pozo</Text>
                      <Text style={styles.pumpOptionSubtitle}>Pozos profundos artesianos</Text>
                    </View>
                    <Text style={styles.pumpArrowIcon}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'drenaje', appType: '', waterType: '', params: {} })} style={styles.pumpOptionCard}>
                    <View style={styles.pumpOptionTextContainer}>
                      <Text style={styles.pumpOptionTitle}>Drenaje / Achique</Text>
                      <Text style={styles.pumpOptionSubtitle}>Vaciar piscinas, desagotes, aguas cloacales</Text>
                    </View>
                    <Text style={styles.pumpArrowIcon}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'piscina', appType: '', waterType: '', params: {} })} style={styles.pumpOptionCard}>
                    <View style={styles.pumpOptionTextContainer}>
                      <Text style={styles.pumpOptionTitle}>Bomba de Piscina</Text>
                      <Text style={styles.pumpOptionSubtitle}>Recirculación para filtros de piscina</Text>
                    </View>
                    <Text style={styles.pumpArrowIcon}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'combustion', appType: '', waterType: '', params: {} })} style={styles.pumpOptionCard}>
                    <View style={styles.pumpOptionTextContainer}>
                      <Text style={styles.pumpOptionTitle}>Motobombas / Combustión</Text>
                      <Text style={styles.pumpOptionSubtitle}>Bombas a nafta, diésel o gasolina</Text>
                    </View>
                    <Text style={styles.pumpArrowIcon}>›</Text>
                  </TouchableOpacity>
                </View>
              ) : (calcMode === 'bomba' && pumpWizard.step === 2) || calcMode !== 'bomba' ? (
                <View style={styles.inputRow}>
                  <TouchableOpacity 
                    style={styles.counterBtn}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      if (current > 1) { setCalcInput(String(current - 1)); setHasCalculated(false); }
                    }}
                  >
                    <Text style={styles.counterBtnText}>-</Text>
                  </TouchableOpacity>
                  
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    placeholder="Ej: 2"
                    placeholderTextColor={COLORS.gray4}
                    value={calcInput}
                    onChangeText={(t) => { setCalcInput(t); setHasCalculated(false); }}
                  />

                  <TouchableOpacity 
                    style={styles.counterBtn}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      const max = calcMode === 'gen' ? 3000 : 500;
                      if (current < max) { setCalcInput(String(current + 1)); setHasCalculated(false); }
                    }}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {((calcMode === 'bomba' && pumpWizard.step === 2) || (calcMode !== 'bomba')) && (
              <TouchableOpacity 
                style={styles.calculateBtn}
                onPress={handleCalculate}
              >
                <Text style={styles.calculateBtnText}>Calcular y Ver Equipos</Text>
              </TouchableOpacity>
              )}

              {hasCalculated && (parseFloat(calcInput) > 0 || parseFloat(calcInput2) > 0) && (
                <View style={styles.resultContainer}>
                  <View style={styles.estimationBox}>
                    <Text style={styles.estimationTitle}>Estimación rápida:</Text>
                  {calcMode === 'gen' && (
                    <View>
                      {parseFloat(calcInput) < 2 ? <Text style={styles.estimationText}>3 Luces · 1 TV · 1 Notebook · 1 WiFi</Text> :
                       parseFloat(calcInput) < 4 ? <Text style={styles.estimationText}>1 Heladera pequeña · 5 Luces · 1 TV · 1 WiFi</Text> :
                       parseFloat(calcInput) < 6 ? <Text style={styles.estimationText}>1 Aire (12.000 BTU) · 1 Heladera · 8 Luces · 2 TV</Text> :
                       parseFloat(calcInput) <= 10 ? <Text style={styles.estimationText}>2 Aires (12.000 BTU) · 1 Heladera · Toda la casa · 3 TV</Text> :
                       parseFloat(calcInput) <= 50 ? <Text style={styles.estimationText}>Locales comerciales medianos, oficinas con varios aires acondicionados, servidores y cámaras frigoríficas.</Text> :
                       parseFloat(calcInput) <= 250 ? <Text style={styles.estimationText}>Uso Industrial Liviano: Fábricas pequeñas, supermercados completos, estaciones de servicio, edificios residenciales enteros.</Text> :
                       parseFloat(calcInput) <= 1000 ? <Text style={styles.estimationText}>Uso Industrial Pesado: Centros comerciales, hospitales, grandes fábricas, frigoríficos industriales.</Text> :
                       <Text style={styles.estimationText}>Gran Escala: Industrias electrointensivas, minería, respaldo para barrios enteros o centros de datos masivos.</Text>}
                    </View>
                  )}
                  {calcMode === 'motor' && (
                    <View>
                      {parseFloat(calcInput) <= 1 ? <Text style={styles.estimationText}>Hormigoneras chicas, cortadoras de fiambre, portones eléctricos residenciales, ventiladores grandes.</Text> :
                       parseFloat(calcInput) <= 3 ? <Text style={styles.estimationText}>Compresores medianos, sierras circulares, tornos pequeños, cintas transportadoras livianas.</Text> :
                       parseFloat(calcInput) <= 10 ? <Text style={styles.estimationText}>Amasadoras industriales, elevadores de autos, extractores pesados, trituradoras medianas, bombas centrífugas grandes.</Text> :
                       parseFloat(calcInput) <= 50 ? <Text style={styles.estimationText}>Maquinaria industrial de planta, cintas transportadoras largas, molinos, prensas hidráulicas pesadas.</Text> :
                       parseFloat(calcInput) <= 200 ? <Text style={styles.estimationText}>Industria pesada, grandes compresores de planta, trituradoras de piedra, maquinaria minera liviana.</Text> :
                       <Text style={styles.estimationText}>Uso Extremo: Industria naviera, minería pesada, bombas de acueductos, grandes molinos industriales.</Text>}
                    </View>
                  )}
                  {calcMode === 'bomba' && (
                    <View>
                      {parseFloat(calcInput) <= 1 ? <Text style={styles.estimationText}>Uso doméstico: Llenado de tanques (hasta 15m), riego de jardines chicos, circulación de agua, pozos poco profundos.</Text> :
                       parseFloat(calcInput) <= 3 ? <Text style={styles.estimationText}>Uso comercial/Residencial: Edificios de 3-5 pisos, riego por aspersión mediano, llenado de piscinas rápido.</Text> :
                       parseFloat(calcInput) <= 10 ? <Text style={styles.estimationText}>Uso agrícola/Edificios: Riego agrícola por goteo/aspersión, edificios altos (más de 10 pisos), sistemas contra incendios pequeños.</Text> :
                       parseFloat(calcInput) <= 50 ? <Text style={styles.estimationText}>Uso Industrial: Torres de refrigeración, sistemas contra incendios industriales, extracción de pozos artesianos profundos.</Text> :
                       <Text style={styles.estimationText}>Uso Gran Escala: Plantas de tratamiento de agua, acueductos, riego agrícola masivo, drenaje de minas.</Text>}
                    </View>
                  )}
                  </View>

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
  pumpOptionsContainer: {
    marginBottom: 20
  },
  pumpSubtitle: {
    fontSize: 16,
    color: COLORS.navy,
    marginBottom: 15
  },
  pumpOptionCard: {
    padding: 15,
    backgroundColor: '#F0F4F8',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center'
  },
  pumpOptionTextContainer: {
    flex: 1
  },
  pumpOptionTitle: {
    fontWeight: 'bold',
    color: COLORS.navy
  },
  pumpOptionSubtitle: {
    fontSize: 12,
    color: COLORS.gray4
  },
  pumpArrowIcon: {
    fontSize: 20,
    color: COLORS.gray4
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
  }
});
