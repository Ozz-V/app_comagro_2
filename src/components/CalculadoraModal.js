import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';
import SvgIcon from './SvgIcon';
import { getProductsBySubcategory } from '../utils/database';

export default function CalculadoraModal({ visible, onClose, navigation }) {
  const [calcMode, setCalcMode] = useState('');
  const [calcInput, setCalcInput] = useState('');
  const [calcInput2, setCalcInput2] = useState('');
  const [pumpWizard, setPumpWizard] = useState({ step: 0, type: '', appType: '', waterType: '', params: {} });
  const [calcResult, setCalcResult] = useState(null);
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

  function extractNum(val) {
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
    let filtered = [];
    try {
      if (calcMode === 'gen') {
        const target = parseFloat(calcInput) || 0;
        const dbProducts = await getProductsBySubcategory('GENERADOR', true);
        filtered = dbProducts.filter(p => {
          let hasFuel = false;
          const sub = String(p.subcategoria).toUpperCase();
          if (sub.includes('NAFTA') || sub.includes('DIESEL') || sub.includes('DIÉSEL') || sub.includes('GASOLINA')) hasFuel = true;
          if (p.specs) {
            const allSpecs = JSON.stringify(p.specs).toUpperCase();
            if (allSpecs.includes('NAFTA') || allSpecs.includes('DIESEL') || allSpecs.includes('DIÉSEL') || allSpecs.includes('GASOLINA')) hasFuel = true;
          }
          return hasFuel;
        }).map(p => {
          let val = 0;
          if (p.specs) {
            p.specs.forEach(s => {
              const k = String(s[0]).toUpperCase();
              if (k.includes('POTENCIA') || k.includes('KVA')) {
                const n = extractNum(s[1]);
                if (n) val = n;
              }
            });
          }
          return { ...p, calcVal: val };
        }).filter(p => p.calcVal > 0)
        .sort((a,b) => Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target)).slice(0, 5);
      } else if (calcMode === 'motor') {
        const target = parseFloat(calcInput) || 0;
        const dbProducts = await getProductsBySubcategory('MOTOR', true);
        filtered = dbProducts.filter(p => {
          const sub = String(p.subcategoria).toUpperCase();
          return sub.includes('ELEC') || sub.includes('ELÉC');
        }).map(p => {
          let val = 0;
          if (p.specs) {
            p.specs.forEach(s => {
              const k = String(s[0]).toUpperCase();
              if (k.includes('HP') || k.includes('POTENCIA')) {
                const n = extractNum(s[1]);
                if (n) val = n;
              }
            });
          }
          return { ...p, calcVal: val };
        }).filter(p => p.calcVal > 0)
        .sort((a,b) => Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target)).slice(0, 5);
      } else if (calcMode === 'bomba') {
        const target = parseFloat(calcInput) || 0;
        const dbProducts = await getProductsBySubcategory('BOMBA', true);
        filtered = dbProducts.map(p => {
           let hpVal = 0;
           if (p.specs) {
             p.specs.forEach(s => {
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
         }).filter(p => {
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
         }).filter(p => p.calcVal > 0)
         .sort((a,b) => {
            return Math.abs(a.calcVal - target) - Math.abs(b.calcVal - target);
         }).slice(0, 5);
      }
    } catch (e) {
      console.log('Error calculando productos', e);
    }
    setCalcResult(filtered);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
      >
        <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, height: '90%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.navy }}>Calculadora Beta</Text>
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
              <Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false}>
          {!calcMode ? (
            <View>
              <Text style={{ color: COLORS.gray4, marginBottom: 15 }}>Seleccioná un tipo de equipo para hacer un cálculo rápido:</Text>
              <View style={{ flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                <TouchableOpacity onPress={() => { setCalcMode('gen'); setHasCalculated(false); setCalcResult(null); }} style={{ flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.white }}>
                  <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <SvgIcon name="gen" size={28} color={COLORS.navy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.navy }}>Generador Eléctrico</Text>
                    <Text style={{ fontSize: 13, color: COLORS.gray4, marginTop: 2 }}>Cálculo rápido en KVA</Text>
                  </View>
                  <Text style={{ fontSize: 24, color: COLORS.gray4 }}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('motor'); setHasCalculated(false); setCalcResult(null); }} style={{ flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.white }}>
                  <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <SvgIcon name="motor" size={28} color={COLORS.navy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.navy }}>Motor Eléctrico</Text>
                    <Text style={{ fontSize: 13, color: COLORS.gray4, marginTop: 2 }}>Cálculo rápido en HP</Text>
                  </View>
                  <Text style={{ fontSize: 24, color: COLORS.gray4 }}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('bomba'); setHasCalculated(false); setCalcResult(null); setPumpWizard({ step: 1, type: '', appType: '', waterType: '', params: {} }); }} style={{ flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.white }}>
                  <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <SvgIcon name="bomba" size={28} color={COLORS.navy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.navy }}>Bomba de Agua</Text>
                    <Text style={{ fontSize: 13, color: COLORS.gray4, marginTop: 2 }}>Cálculo por Altura y Caudal</Text>
                  </View>
                  <Text style={{ fontSize: 24, color: COLORS.gray4 }}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>

              <Text style={{ fontWeight: 'bold', color: COLORS.navy, marginBottom: 10 }}>
                {calcMode === 'gen' ? 'Ingresá el valor (1 a 3000 KVA)' : calcMode === 'motor' ? 'Ingresá el valor (1 a 500 HP)' : 'Ingresá la potencia en HP'}
              </Text>
              
              {calcMode === 'bomba' && pumpWizard.step === 1 ? (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, color: COLORS.navy, marginBottom: 15 }}>¿Qué tipo de bomba estás buscando?</Text>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'hogar' })} style={{ padding: 15, backgroundColor: '#F0F4F8', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>Superficie / Periférica</Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray4 }}>Tanques elevados, presurización, riego</Text>
                    </View>
                    <Text style={{ fontSize: 20, color: COLORS.gray4 }}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'pozo' })} style={{ padding: 15, backgroundColor: '#F0F4F8', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>Sumergible de Pozo</Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray4 }}>Pozos profundos artesianos</Text>
                    </View>
                    <Text style={{ fontSize: 20, color: COLORS.gray4 }}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'drenaje' })} style={{ padding: 15, backgroundColor: '#F0F4F8', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>Drenaje / Achique</Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray4 }}>Vaciar piscinas, desagotes, aguas cloacales</Text>
                    </View>
                    <Text style={{ fontSize: 20, color: COLORS.gray4 }}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'piscina' })} style={{ padding: 15, backgroundColor: '#F0F4F8', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>Bomba de Piscina</Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray4 }}>Recirculación para filtros de piscina</Text>
                    </View>
                    <Text style={{ fontSize: 20, color: COLORS.gray4 }}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPumpWizard({ step: 2, type: 'combustion' })} style={{ padding: 15, backgroundColor: '#F0F4F8', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>Motobombas / Combustión</Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray4 }}>Bombas a nafta, diésel o gasolina</Text>
                    </View>
                    <Text style={{ fontSize: 20, color: COLORS.gray4 }}>›</Text>
                  </TouchableOpacity>
                </View>
              ) : (calcMode === 'bomba' && pumpWizard.step === 2) || calcMode !== 'bomba' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.navy, width: 50, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      if (current > 1) { setCalcInput(String(current - 1)); setHasCalculated(false); }
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: 'bold' }}>-</Text>
                  </TouchableOpacity>
                  
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, fontSize: 18, color: COLORS.black, backgroundColor: '#F0F4F8', marginHorizontal: 10, textAlign: 'center' }}
                    keyboardType="numeric"
                    placeholder="Ej: 2"
                    placeholderTextColor={COLORS.gray4}
                    value={calcInput}
                    onChangeText={(t) => { setCalcInput(t); setHasCalculated(false); }}
                  />

                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.navy, width: 50, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      const max = calcMode === 'gen' ? 3000 : 500;
                      if (current < max) { setCalcInput(String(current + 1)); setHasCalculated(false); }
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: 'bold' }}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {((calcMode === 'bomba' && pumpWizard.step === 2) || (calcMode !== 'bomba')) && (
              <TouchableOpacity 
                style={{ backgroundColor: COLORS.green, padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 }}
                onPress={handleCalculate}
              >
                <Text style={{ color: COLORS.white, fontWeight: 'bold', fontSize: 16 }}>Calcular y Ver Equipos</Text>
              </TouchableOpacity>
              )}

              {hasCalculated && (parseFloat(calcInput) > 0 || parseFloat(calcInput2) > 0) && (
                <View style={{ marginBottom: 20 }}>
                  <View style={{ backgroundColor: '#E3FAED', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: COLORS.green }}>
                    <Text style={{ fontWeight: 'bold', color: COLORS.green, marginBottom: 10 }}>Estimación rápida:</Text>
                  {calcMode === 'gen' && (
                    <View>
                      {parseFloat(calcInput) < 2 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>3 Luces · 1 TV · 1 Notebook · 1 WiFi</Text> :
                       parseFloat(calcInput) < 4 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>1 Heladera pequeña · 5 Luces · 1 TV · 1 WiFi</Text> :
                       parseFloat(calcInput) < 6 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>1 Aire (12.000 BTU) · 1 Heladera · 8 Luces · 2 TV</Text> :
                       parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>2 Aires (12.000 BTU) · 1 Heladera · Toda la casa · 3 TV</Text> :
                       parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Locales comerciales medianos, oficinas con varios aires acondicionados, servidores y cámaras frigoríficas.</Text> :
                       parseFloat(calcInput) <= 250 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso Industrial Liviano: Fábricas pequeñas, supermercados completos, estaciones de servicio, edificios residenciales enteros.</Text> :
                       parseFloat(calcInput) <= 1000 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso Industrial Pesado: Centros comerciales, hospitales, grandes fábricas, frigoríficos industriales.</Text> :
                       <Text style={{ color: COLORS.navy, fontSize: 14 }}>Gran Escala: Industrias electrointensivas, minería, respaldo para barrios enteros o centros de datos masivos.</Text>}
                    </View>
                  )}
                  {calcMode === 'motor' && (
                    <View>
                      {parseFloat(calcInput) <= 1 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Hormigoneras chicas, cortadoras de fiambre, portones eléctricos residenciales, ventiladores grandes.</Text> :
                       parseFloat(calcInput) <= 3 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Compresores medianos, sierras circulares, tornos pequeños, cintas transportadoras livianas.</Text> :
                       parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Amasadoras industriales, elevadores de autos, extractores pesados, trituradoras medianas, bombas centrífugas grandes.</Text> :
                       parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Maquinaria industrial de planta, cintas transportadoras largas, molinos, prensas hidráulicas pesadas.</Text> :
                       parseFloat(calcInput) <= 200 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Industria pesada, grandes compresores de planta, trituradoras de piedra, maquinaria minera liviana.</Text> :
                       <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso Extremo: Industria naviera, minería pesada, bombas de acueductos, grandes molinos industriales.</Text>}
                    </View>
                  )}
                  {calcMode === 'bomba' && (
                    <View>
                      {parseFloat(calcInput) <= 1 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso doméstico: Llenado de tanques (hasta 15m), riego de jardines chicos, circulación de agua, pozos poco profundos.</Text> :
                       parseFloat(calcInput) <= 3 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso comercial/Residencial: Edificios de 3-5 pisos, riego por aspersión mediano, llenado de piscinas rápido.</Text> :
                       parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso agrícola/Edificios: Riego agrícola por goteo/aspersión, edificios altos (más de 10 pisos), sistemas contra incendios pequeños.</Text> :
                       parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso Industrial: Torres de refrigeración, sistemas contra incendios industriales, extracción de pozos artesianos profundos.</Text> :
                       <Text style={{ color: COLORS.navy, fontSize: 14 }}>Uso Gran Escala: Plantas de tratamiento de agua, acueductos, riego agrícola masivo, drenaje de minas.</Text>}
                    </View>
                  )}
                </View>

                {calcResult && calcResult.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontWeight: 'bold', color: COLORS.navy, marginBottom: 10 }}>Equipos Sugeridos:</Text>
                    <FlatList
                      data={calcResult}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={item => item.modelo}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={{ width: 140, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, marginRight: 10 }}
                          onPress={() => {
                              navigation.navigate('ProductViewer', { sku: item.modelo, contextSkus: calcResult.map(r => r.modelo) });
                          }}
                        >
                          {item.imagen ? (
                            <Image source={{ uri: item.imagen }} style={{ width: '100%', height: 80, marginBottom: 10 }} contentFit="contain" />
                          ) : (
                            <View style={{ width: '100%', height: 80, backgroundColor: '#f0f0f0', marginBottom: 10, borderRadius: 4 }} />
                          )}
                          <Text style={{ fontSize: 10, color: COLORS.gray4, fontWeight: 'bold' }} numberOfLines={1}>{item.marca}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.navy, fontWeight: 'bold', marginBottom: 5 }} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={{ fontSize: 11, color: COLORS.green, fontWeight: 'bold' }}>
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
