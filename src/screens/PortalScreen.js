import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, SafeAreaView, StatusBar, ScrollView, Platform, Modal, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import { calcSuperficie, calcPozo, calcDrenaje, normalizeCaudal, normalizeMca } from '../utils/PumpCalculations';

const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';

// Lista de opciones reemplazada por layout grid hardcoded en el render

export default function PortalScreen({ navigation }) {
  // Calculadora Beta
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcMode, setCalcMode] = useState(''); // 'gen', 'motor', 'bomba'
  const [calcInput, setCalcInput] = useState('');
  const [calcInput2, setCalcInput2] = useState(''); // Caudal L/min (for bombas)
  const [pumpWizard, setPumpWizard] = useState({ step: 0, type: '', appType: '', waterType: '', params: {} });
  const [calcResult, setCalcResult] = useState(null); // Recommended products
  const [hasCalculated, setHasCalculated] = useState(false);
  const [allProdsCache, setAllProdsCache] = useState([]);
  
  // Nota: El chatbot fue migrado a ChatScreen.js (pantalla dedicada con Edge Function segura)
  const [remoteConfig, setRemoteConfig] = useState(null);

  // Perfil obligatorio
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profName, setProfName] = useState('');
  const [profPhoneCode, setProfPhoneCode] = useState('+595');
  const [profPhone, setProfPhone] = useState('');
  const [profSaving, setProfSaving] = useState(false);

  useEffect(() => {
    syncAnalyticsQueue();
    checkProfile();
    fetchRemoteConfig();
  }, []);

  async function fetchRemoteConfig() {
    try {
      const { data } = await supabase.from('app_config').select('*').eq('id', 'global').single();
      if (data) {
        setRemoteConfig(data);
      }
    } catch(e) {
      // Error silente al obtener config remota
    }
  }

  // Recargar al volver a esta pantalla
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      checkProfile();
    });
    return unsubscribe;
  }, [navigation]);

  const parseRawProducts = (rawData) => {
    const COLS_EXCLUIDAS = new Set(['SKU','imagen 1','imagen 2','imagen 3','imagen 4','imagen 5','Brand','Marca','id','ID','Tipo de Producto','Categoria Magento','url_key','visibility','status','price','Precio']);
    return JSON.parse(rawData).map(row => {
      const marca = (row['Brand'] || row['Marca'] || row['marca'] || row['MARCA'] || '').toString().trim();
      const subcategoria = (row['Tipo de Producto'] || row['Categoria Magento'] || 'General').toString().trim().toUpperCase();
      const imagen = row['imagen 1'] || row['imagen'] || null;
      const specs = [];
      for (const [col, val] of Object.entries(row)) {
        if (!COLS_EXCLUIDAS.has(col) && !col.startsWith('_')) {
          if (val !== null && val !== undefined && val !== '') {
            const s = String(val).trim().toLowerCase();
            if (s.length > 0 && !/^0([.,]0+)?$/.test(s)) {
              const basura = ['n/a','na','n.a','n.a.','no aplica','sin dato','sin datos','no','no tiene','no disponible','pim','-','--','---','st','sin información'];
              if (!basura.includes(s)) specs.push([col, String(val).trim()]);
            }
          }
        }
      }
      return { modelo: (row['SKU'] || '').toString().trim(), marca, subcategoria, imagen, specs };
    });
  };

  useEffect(() => {
    if (showCalcModal) {
      const loadCache = async () => {
        try {
          let res = await AsyncStorage.getItem('@productos_cache');
          let parsed = false;
          if (res) {
            try {
              setAllProdsCache(parseRawProducts(res));
              parsed = true;
            } catch (e) {
              console.log('Error parseando @productos_cache', e);
            }
          }
          if (!parsed) {
            let res2 = await AsyncStorage.getItem('comagro_productos_v3');
            if (res2) {
              setAllProdsCache(parseRawProducts(res2));
            }
          }
        } catch (e) {
          console.log('Error general cargando cache', e);
        }
      };
      loadCache();
    } else {
      setHasCalculated(false);
      setCalcResult(null);
      setCalcInput('');
      setCalcInput2('');
    }
  }, [showCalcModal]);

  function extractNum(val) {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/([\d]+[\.,]?[\d]*)/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.'));
  }

  function handleCalculate() {
    if (calcMode === 'bomba' && !pumpWizard.type) {
      alert("Por favor seleccioná el tipo de bomba.");
      return;
    }
    
    setHasCalculated(true);
    let filtered = [];
    if (calcMode === 'gen') {
      const target = parseFloat(calcInput) || 0;
      filtered = allProdsCache.filter(p => p.subcategoria && p.subcategoria.includes('GENERADOR')).map(p => {
        let val = 0;
        if (p.specs) {
          p.specs.forEach(s => {
            const k = s[0].toUpperCase();
            if (k.includes('POTENCIA') || k.includes('KVA')) {
              const n = extractNum(s[1]);
              if (n) val = n;
            }
          });
        }
        return { ...p, calcVal: val };
      }).filter(p => p.calcVal >= target * 0.95)
        .sort((a,b) => a.calcVal - b.calcVal).slice(0, 5);
    } else if (calcMode === 'motor') {
      const target = parseFloat(calcInput) || 0;
      filtered = allProdsCache.filter(p => p.subcategoria && p.subcategoria.includes('MOTOR') && (p.subcategoria.includes('ELEC') || p.subcategoria.includes('ELÉC'))).map(p => {
        let val = 0;
        if (p.specs) {
          p.specs.forEach(s => {
            const k = s[0].toUpperCase();
            if (k.includes('HP') || k.includes('POTENCIA')) {
              const n = extractNum(s[1]);
              if (n) val = n;
            }
          });
        }
        return { ...p, calcVal: val };
      }).filter(p => p.calcVal >= target * 0.95)
        .sort((a,b) => a.calcVal - b.calcVal).slice(0, 5);
    } else if (calcMode === 'bomba') {
      const target = parseFloat(calcInput) || 0;
      
      filtered = allProdsCache.filter(p => p.subcategoria && p.subcategoria.includes('BOMBA')).map(p => {
         let hpVal = 0;
         if (p.specs) {
           p.specs.forEach(s => {
             const key = s[0].toUpperCase();
             const val = s[1].toUpperCase();
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
          if (target > 0 && p.calcVal < target * 0.8) return false;
          
          const sub = p.subcategoria.toUpperCase();
          if (pumpWizard.type === 'hogar' && !sub.includes('AGUA') && !sub.includes('CENTRÍFUGA') && !sub.includes('PRESURIZA')) return false;
          if (pumpWizard.type === 'pozo' && !sub.includes('SUMERGIBLE')) return false;
          if (pumpWizard.type === 'drenaje' && !sub.includes('ACHIQUE') && !sub.includes('DRENAJE')) return false;
          if (pumpWizard.type === 'piscina' && !sub.includes('PISCINA')) return false;
          if (pumpWizard.type === 'combustion' && !sub.includes('COMBUSTIÓN') && !sub.includes('NAFTERA') && !sub.includes('AUTOCEBANTE')) return false;
          
          return true;
       }).sort((a,b) => {
          const diffA = Math.abs(a.calcVal - target);
          const diffB = Math.abs(b.calcVal - target);
          return diffA - diffB;
       }).slice(0, 5);
    setCalcResult(filtered);
  }



  async function checkProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!data || !data.full_name || data.full_name === 'EMPTY' || !data.telefono || data.telefono === '+595') {
        setProfName(data?.full_name && data.full_name !== 'EMPTY' ? data.full_name : '');
        if (data?.telefono && data.telefono !== '+595') {
          if (data.telefono.includes(' ')) {
            const parts = data.telefono.split(' ');
            setProfPhoneCode(parts[0]);
            setProfPhone(parts.slice(1).join(' '));
          } else {
            setProfPhone(data.telefono);
          }
        }
        setShowProfileModal(true);
      } else {
        // PERFIL COMPLETADO, guardar el nombre para usarlo en saludos e IA
        setProfName(data.full_name);
      }
    } catch (e) {
      // Error silente al verificar perfil
    }
  }

  async function saveRequiredProfile() {
    if (!profName.trim() || !profPhone.trim()) {
      alert('Por favor completa tu nombre y teléfono.');
      return;
    }
    setProfSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const combinedPhone = `${profPhoneCode.trim()} ${profPhone.trim()}`;
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: profName,
        telefono: combinedPhone,
        email: user.email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (!error) setShowProfileModal(false);
      else alert('Error DB: ' + (error.message || JSON.stringify(error)));
    } catch (e) {
      alert('Error guardando perfil.');
    } finally {
      setProfSaving(false);
    }
  }
  async function syncAnalyticsQueue() {
    try {
      const q = await AsyncStorage.getItem('@analytics_queue');
      if (!q) return;
      const queue = JSON.parse(q);
      if (queue.length === 0) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // Esperar a tener internet/sesión

      const { error } = await supabase.from('producto_analytics').insert(queue);
      if (!error) {
        await AsyncStorage.removeItem('@analytics_queue');
      }
    } catch (e) {
      // Ignorar, se volverá a intentar después
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <LottieView
          source={require('../../assets/iso.json')}
          autoPlay
          loop={true}
          style={styles.logoAnimado}
          resizeMode="contain"
        />
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ alignItems: 'center', marginBottom: 30 }}>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 26, fontWeight: '700', color: COLORS.navy, textAlign: 'center', marginBottom: 4 }}>Herramienta de Ventas</Text>
          <Text style={{ fontFamily: FONTS.body, fontSize: 16, color: COLORS.gray4, textAlign: 'center' }}>Comagro S.A.</Text>
        </View>

        {/* Fila 1 */}
        <TouchableOpacity style={styles.gridCardFull} activeOpacity={0.8} onPress={() => navigation.navigate('Productos')}>
          <View style={styles.gridIconFull}>
            <SvgIcon name="buscar" size={32} color={COLORS.navy} />
          </View>
          <Text style={styles.gridTitleFull}>Todos los productos</Text>
        </TouchableOpacity>

        {/* Fila 2 */}
        <View style={styles.gridRow2}>
          <TouchableOpacity style={styles.gridCardHalf} activeOpacity={0.8} onPress={() => navigation.navigate('Catalogos')}>
            <View style={styles.gridIconHalf}>
              <SvgIcon name="doc" size={28} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleHalf}>Catálogos Generales</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridCardHalf} activeOpacity={0.8} onPress={() => navigation.navigate('Fichas')}>
            <View style={styles.gridIconHalf}>
              <SvgIcon name="doc4" size={28} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleHalf}>Fichas Técnicas</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.gridSeparator} />

        {/* Fila 3 */}
        <View style={styles.gridRow3}>
          <TouchableOpacity style={styles.gridCardThird} activeOpacity={0.8} onPress={() => { setCalcMode(''); setCalcInput(''); setCalcInput2(''); setHasCalculated(false); setCalcResult(null); setShowCalcModal(true); }}>
            <View style={styles.gridIconThird}>
              <SvgIcon name="calculadora" size={24} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleThird}>Calculadora</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridCardThird} activeOpacity={0.8} onPress={() => navigation.navigate('ChatScreen')}>
            <View style={styles.gridIconThird}>
              <SvgIcon name="agenteIA" size={24} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleThird}>Asistente IA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridCardThird} activeOpacity={0.8} onPress={() => navigation.navigate('Config')}>
            <View style={styles.gridIconThird}>
              <SvgIcon name="config" size={24} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleThird}>Configuración</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal Calculadora Beta */}
      <Modal visible={showCalcModal} animationType="slide" transparent onRequestClose={() => setShowCalcModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, height: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.navy }}>Calculadora Beta</Text>
              <TouchableOpacity onPress={() => setShowCalcModal(false)}><Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text></TouchableOpacity>
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
                <TouchableOpacity onPress={() => { setCalcMode(''); setHasCalculated(false); setCalcResult(null); setPumpWizard({ step: 0, type: '', appType: '', waterType: '', params: {} }); }} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, backgroundColor: COLORS.navy, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 16, color: COLORS.white, fontWeight: 'bold', marginRight: 8 }}>←</Text>
                  <Text style={{ fontSize: 14, color: COLORS.white, fontWeight: 'bold' }}>Volver a Selección</Text>
                </TouchableOpacity>

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
                        <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>Motobomba Naftera/Diésel</Text>
                        <Text style={{ fontSize: 12, color: COLORS.gray4 }}>Autocebantes, riego a combustión</Text>
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
                            onPress={() => navigation.navigate('ProductViewer', { sku: item.modelo, contextSkus: calcResult.map(r => r.modelo) })}
                          >
                            {item.imagen ? (
                              <Image source={{ uri: item.imagen }} style={{ width: '100%', height: 80, resizeMode: 'contain', marginBottom: 10 }} />
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

      {/* El Chat IA ahora es una pantalla nativa (ChatScreen.js) */}

      {/* Modal Perfil Obligatorio */}
      <Modal visible={showProfileModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 15, padding: 24, elevation: 5 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <SvgIcon name="agenteIA" size={48} color={COLORS.navy} />
              <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginTop: 12 }}>Completa tu perfil</Text>
              <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, textAlign: 'center', marginTop: 8 }}>
                Para ofrecerte una mejor experiencia, necesitamos que nos indiques tu nombre y número de teléfono.
              </Text>
            </View>

            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray1, marginBottom: 4 }}>Nombre completo</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, marginBottom: 16, fontFamily: FONTS.body, color: COLORS.navy }}
              placeholder="Ej. Juan Pérez"
              value={profName}
              onChangeText={setProfName}
            />

            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray1, marginBottom: 4 }}>Teléfono</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#F7F8FA' }}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>{profPhoneCode === '+595' ? '🇵🇾' : '🌍'}</Text>
                <TextInput
                  style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, paddingVertical: 12, minWidth: 40 }}
                  value={profPhoneCode}
                  onChangeText={setProfPhoneCode}
                  keyboardType="phone-pad"
                />
              </View>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontFamily: FONTS.body, color: COLORS.navy }}
                placeholder="Ej. 981 123 456"
                keyboardType="phone-pad"
                value={profPhone}
                onChangeText={setProfPhone}
              />
            </View>

            <TouchableOpacity
              style={{ backgroundColor: COLORS.navy, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
              onPress={saveRequiredProfile}
              disabled={profSaving}
            >
              {profSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 15, color: COLORS.white, fontWeight: '700' }}>Continuar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },

  content: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 100,
  },

  gridCardFull: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16
  },
  gridIconFull: { marginBottom: 12 },
  gridTitleFull: { fontFamily: FONTS.heading, fontSize: 20, fontWeight: '700', color: COLORS.navy, textAlign: 'center' },

  gridRow2: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  gridCardHalf: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 24, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center'
  },
  gridIconHalf: { marginBottom: 12 },
  gridTitleHalf: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, textAlign: 'center' },

  gridSeparator: { height: 3, backgroundColor: COLORS.green, borderRadius: 2, marginBottom: 24, marginHorizontal: '5%' },

  gridRow3: { flexDirection: 'row', gap: 10 },
  gridCardThird: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center'
  },
  gridIconThird: { marginBottom: 8 },
  gridTitleThird: { fontFamily: FONTS.heading, fontSize: 11, fontWeight: '700', color: COLORS.navy, textAlign: 'center' },

});
