import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, SafeAreaView, StatusBar, ScrollView, Platform, Modal, TextInput, FlatList
} from 'react-native';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';

const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';

const OPCIONES = [
  {
    id: 'catalogos',
    screen: 'Catalogos',
    icon: 'doc',
    titulo: 'Catálogos Generales',
    desc: 'PDFs de catálogos por marca',
  },
  {
    id: 'fichas',
    screen: 'Fichas',
    icon: 'doc4',
    titulo: 'Fichas Técnicas',
    desc: 'Fichas técnicas por categoría',
  },
  {
    id: 'productos',
    screen: 'Productos',
    icon: 'buscar',
    titulo: 'Todos los Productos',
    desc: 'Catálogo completo con specs',
  },
  {
    id: 'config',
    screen: 'Config',
    icon: 'config',
    titulo: 'Configuración',
    desc: 'Versión, datos y sesión',
  },
];

export default function PortalScreen({ navigation }) {
  const [recientes, setRecientes] = useState([]);
  const [tendencias, setTendencias] = useState({ vistos: [], buscados: [], compartidos: [] });
  const [activeTrendTab, setActiveTrendTab] = useState('Vistos'); // Vistos | Buscados | Compartidos
  
  // Calculadora Beta
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcMode, setCalcMode] = useState(''); // 'gen', 'motor', 'bomba'
  const [calcInput, setCalcInput] = useState('');

  // Modales para listas
  const [showRecientesModal, setShowRecientesModal] = useState(false);
  const [showCompartidosModal, setShowCompartidosModal] = useState(false);

  // Perfil obligatorio
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profName, setProfName] = useState('');
  const [profPhone, setProfPhone] = useState('');
  const [profSaving, setProfSaving] = useState(false);

  useEffect(() => {
    cargarRecientes();
    cargarTendencias();
    checkProfile();
  }, []);

  // Recargar al volver a esta pantalla
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      cargarRecientes();
      cargarTendencias();
      checkProfile();
    });
    return unsubscribe;
  }, [navigation]);

  async function checkProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!data || !data.full_name || !data.telefono) {
        setProfName(data?.full_name || '');
        setProfPhone(data?.telefono || '');
        setShowProfileModal(true);
      }
    } catch (e) {
      console.log('Error check profile:', e);
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
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: profName,
        telefono: profPhone,
        email: user.email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (!error) setShowProfileModal(false);
      else alert('Hubo un error al guardar. Asegúrate de tener conexión.');
    } catch (e) {
      alert('Error guardando perfil.');
    } finally {
      setProfSaving(false);
    }
  }

  async function cargarRecientes() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku, created_at')
        .eq('user_email', user.email)
        .eq('action', 'view')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        const seen = new Set();
        const unique = [];
        for (const item of data) {
          if (!seen.has(item.sku)) {
            seen.add(item.sku);
            unique.push(item);
          }
          if (unique.length >= 5) break;
        }
        setRecientes(unique);
      }
    } catch (e) {
      console.log('Error cargando recientes:', e);
    }
  }

  async function cargarTendencias() {
    try {
      // Función para obtener top por acción
      const getTop = async (action) => {
        const { data } = await supabase
          .from('producto_analytics')
          .select('modelo, marca, sku, action')
          .eq('action', action);
        
        if (!data) return [];
        
        // Contar ocurrencias por SKU
        const counts = {};
        data.forEach(item => {
          const key = item.sku || item.modelo;
          if (!counts[key]) counts[key] = { ...item, count: 0 };
          counts[key].count++;
        });

        return Object.values(counts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      };

      const [v, b, c] = await Promise.all([
        getTop('view'),
        getTop('search'),
        getTop('share')
      ]);

      setTendencias({ vistos: v, buscados: b, compartidos: c });
    } catch (e) {
      console.log('Error cargando tendencias:', e);
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
        <Text style={styles.titulo}>Portal de Documentación</Text>
        <Text style={styles.subtitulo}>Elegí una sección para continuar</Text>

        {OPCIONES.map(op => (
          <TouchableOpacity
            key={op.id}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(op.screen)}
          >
            <View style={styles.iconWrap}>
              <SvgIcon name={op.icon} size={26} color={COLORS.navy} />
            </View>
            <View style={styles.cardTexts}>
              <Text style={styles.cardTitulo}>{op.titulo}</Text>
              <Text style={styles.cardDesc}>{op.desc}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.card, { backgroundColor: COLORS.navy, borderColor: COLORS.navy, marginTop: 10 }]}
          activeOpacity={0.8}
          onPress={() => { setCalcMode(''); setCalcInput(''); setShowCalcModal(true); }}
        >
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={{ fontSize: 24 }}>🧮</Text>
          </View>
          <View style={styles.cardTexts}>
            <Text style={[styles.cardTitulo, { color: COLORS.white }]}>Calculadora Beta</Text>
            <Text style={[styles.cardDesc, { color: 'rgba(255,255,255,0.7)' }]}>Dimensionamiento rápido de equipos</Text>
          </View>
        </TouchableOpacity>

        {/* Más vistos - Carrusel abajo */}
        {tendencias.vistos.length > 0 && (
          <View style={[styles.recientesSection, { marginTop: 32 }]}>
            <Text style={styles.recientesTitulo}>Más vistos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recientesScroll}>
              {tendencias.vistos.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.recienteCard, { backgroundColor: '#F0F4F8' }]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Productos', { 
                    openProductSku: item.sku || item.modelo
                  })}
                >
                  <Image
                    source={{ uri: `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\s+/g, '_')}.jpg` }}
                    style={styles.recienteLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.recienteModelo} numberOfLines={1}>{item.modelo}</Text>
                  <Text style={styles.recienteMarca} numberOfLines={1}>{item.marca}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Enlaces sutiles para más recientes y más compartidos */}
        <View style={styles.subtleLinksRow}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => setShowRecientesModal(true)}
            style={styles.subtleLink}
          >
            <SvgIcon name="buscar" size={14} color={COLORS.navy} />
            <Text style={styles.subtleLinkText}>Más recientes</Text>
          </TouchableOpacity>
          <View style={styles.subtleDivider} />
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => setShowCompartidosModal(true)}
            style={styles.subtleLink}
          >
            <SvgIcon name="share" size={14} color={COLORS.navy} />
            <Text style={styles.subtleLinkText}>Más compartidos</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal Más recientes */}
      <Modal visible={showRecientesModal} animationType="slide" transparent onRequestClose={() => setShowRecientesModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 24, width: '90%', maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.navy }}>Más recientes</Text>
              <TouchableOpacity onPress={() => setShowRecientesModal(false)}><Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text></TouchableOpacity>
            </View>
            <FlatList
              data={recientes}
              keyExtractor={(item, idx) => idx.toString()}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
                  onPress={() => { setShowRecientesModal(false); navigation.navigate('Productos', { openProductSku: item.sku || item.modelo }); }}
                >
                  <Image
                    source={{ uri: `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\s+/g, '_')}.jpg` }}
                    style={{ width: 40, height: 40, marginRight: 10 }}
                    resizeMode="contain"
                  />
                  <View>
                    <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>{item.modelo}</Text>
                    <Text style={{ color: COLORS.gray4 }}>{item.marca}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: COLORS.gray4 }}>No hay productos recientes</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Más compartidos */}
      <Modal visible={showCompartidosModal} animationType="slide" transparent onRequestClose={() => setShowCompartidosModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 24, width: '90%', maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.navy }}>Más compartidos</Text>
              <TouchableOpacity onPress={() => setShowCompartidosModal(false)}><Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text></TouchableOpacity>
            </View>
            <FlatList
              data={tendencias.compartidos}
              keyExtractor={(item, idx) => idx.toString()}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
                  onPress={() => { setShowCompartidosModal(false); navigation.navigate('Productos', { openProductSku: item.sku || item.modelo }); }}
                >
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: 'bold' }}>{index + 1}</Text>
                  </View>
                  <Image
                    source={{ uri: `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\s+/g, '_')}.jpg` }}
                    style={{ width: 40, height: 40, marginRight: 10 }}
                    resizeMode="contain"
                  />
                  <View>
                    <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>{item.modelo}</Text>
                    <Text style={{ color: COLORS.gray4 }}>{item.marca}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: COLORS.gray4 }}>No hay productos compartidos</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Calculadora Beta */}
      <Modal visible={showCalcModal} animationType="slide" transparent onRequestClose={() => setShowCalcModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, minHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.navy }}>Calculadora Beta</Text>
              <TouchableOpacity onPress={() => setShowCalcModal(false)}><Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text></TouchableOpacity>
            </View>
            
            <Text style={{ color: COLORS.gray4, marginBottom: 15 }}>Seleccioná un tipo de equipo para hacer un cálculo rápido:</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <TouchableOpacity onPress={() => setCalcMode('gen')} style={[{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, calcMode === 'gen' && { backgroundColor: COLORS.navy, borderColor: COLORS.navy }]}>
                <Text style={{ fontSize: 20, marginBottom: 5 }}>⚡</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: calcMode === 'gen' ? COLORS.white : COLORS.navy, textAlign: 'center' }}>Generador (KVA)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCalcMode('motor')} style={[{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, calcMode === 'motor' && { backgroundColor: COLORS.navy, borderColor: COLORS.navy }]}>
                <Text style={{ fontSize: 20, marginBottom: 5 }}>⚙️</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: calcMode === 'motor' ? COLORS.white : COLORS.navy, textAlign: 'center' }}>Motor Eléctrico (HP)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCalcMode('bomba')} style={[{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, calcMode === 'bomba' && { backgroundColor: COLORS.navy, borderColor: COLORS.navy }]}>
                <Text style={{ fontSize: 20, marginBottom: 5 }}>💧</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: calcMode === 'bomba' ? COLORS.white : COLORS.navy, textAlign: 'center' }}>Bomba de Agua (HP/Caudal)</Text>
              </TouchableOpacity>
            </View>

            {calcMode ? (
              <View>
                <Text style={{ fontWeight: 'bold', color: COLORS.navy, marginBottom: 10 }}>
                  Ingresá el valor {calcMode === 'gen' ? '(1 a 3000 KVA)' : calcMode === 'motor' ? '(1 a 500 HP)' : '(Caudal L/min o HP)'}
                </Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.navy, width: 50, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      if (current > 1) setCalcInput(String(current - 1));
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: 'bold' }}>-</Text>
                  </TouchableOpacity>
                  
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, fontSize: 18, color: COLORS.black, backgroundColor: '#F0F4F8', marginHorizontal: 10, textAlign: 'center' }}
                    keyboardType="numeric"
                    placeholder="Ej: 2"
                    value={calcInput}
                    onChangeText={setCalcInput}
                  />

                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.navy, width: 50, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      const max = calcMode === 'gen' ? 3000 : 500;
                      if (current < max) setCalcInput(String(current + 1));
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: 'bold' }}>+</Text>
                  </TouchableOpacity>
                </View>

                {parseFloat(calcInput) > 0 && (
                  <View style={{ backgroundColor: '#E3FAED', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: COLORS.green }}>
                    <Text style={{ fontWeight: 'bold', color: COLORS.green, marginBottom: 10 }}>Estimación rápida:</Text>
                    {calcMode === 'gen' && (
                      <View>
                        {parseFloat(calcInput) < 2 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💡 3 Luces{'\n'}📺 1 TV{'\n'}💻 1 Notebook{'\n'}📡 1 WiFi</Text> :
                         parseFloat(calcInput) < 4 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>❄️ 1 Heladera pequeña{'\n'}💡 5 Luces{'\n'}📺 1 TV{'\n'}📡 1 WiFi</Text> :
                         parseFloat(calcInput) < 6 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🌬️ 1 Aire (12.000 BTU){'\n'}❄️ 1 Heladera{'\n'}💡 8 Luces{'\n'}📺 2 TV</Text> :
                         parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🌬️ 2 Aires (12.000 BTU){'\n'}❄️ 1 Heladera{'\n'}💡 Toda la casa{'\n'}📺 3 TV</Text> :
                         parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🏢 Capacidad para locales comerciales medianos, oficinas con varios aires acondicionados, servidores y cámaras frigoríficas.</Text> :
                         parseFloat(calcInput) <= 250 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🏭 Uso Industrial Liviano: Fábricas pequeñas, supermercados completos, estaciones de servicio, edificios residenciales enteros.</Text> :
                         parseFloat(calcInput) <= 1000 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🏗️ Uso Industrial Pesado: Centros comerciales (Shoppings), hospitales, grandes fábricas, frigoríficos industriales.</Text> :
                         <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚡ Gran Escala: Industrias electrointensivas, minería, respaldo para barrios enteros o centros de datos masivos.</Text>}
                      </View>
                    )}
                    {calcMode === 'motor' && (
                      <View>
                        {parseFloat(calcInput) <= 1 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Hormigoneras chicas, cortadoras de fiambre, portones eléctricos residenciales, ventiladores grandes.</Text> :
                         parseFloat(calcInput) <= 3 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Compresores medianos, sierras circulares, tornos pequeños, cintas transportadoras livianas.</Text> :
                         parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Amasadoras industriales, elevadores de autos, extractores pesados, trituradoras medianas, bombas centrífugas grandes.</Text> :
                         parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Maquinaria industrial de planta, cintas transportadoras largas, molinos, prensas hidráulicas pesadas.</Text> :
                         parseFloat(calcInput) <= 200 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Industria pesada, grandes compresores de planta, trituradoras de piedra, maquinaria minera liviana.</Text> :
                         <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso Extremo: Industria naviera, minería pesada, bombas de acueductos, grandes molinos industriales.</Text>}
                      </View>
                    )}
                    {calcMode === 'bomba' && (
                      <View>
                        {parseFloat(calcInput) <= 1 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso doméstico: Llenado de tanques (hasta 15m), riego de jardines chicos, circulación de agua, pozos poco profundos.</Text> :
                         parseFloat(calcInput) <= 3 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso comercial/Residencial: Edificios de 3-5 pisos, riego por aspersión mediano, llenado de piscinas rápido.</Text> :
                         parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso agrícola/Edificios: Riego agrícola por goteo/aspersión, edificios altos (más de 10 pisos), sistemas contra incendios pequeños.</Text> :
                         parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso Industrial: Torres de refrigeración, sistemas contra incendios industriales, extracción de pozos artesianos profundos.</Text> :
                         <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso Gran Escala: Plantas de tratamiento de agua, acueductos, riego agrícola masivo, drenaje de minas.</Text>}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

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

            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray1, marginBottom: 4 }}>Teléfono (con código de área)</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, marginBottom: 24, fontFamily: FONTS.body, color: COLORS.navy }}
              placeholder="Ej. +595 9XX XXX XXX"
              keyboardType="phone-pad"
              value={profPhone}
              onChangeText={setProfPhone}
            />

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
  },

  titulo: {
    fontFamily: FONTS.heading,
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 6,
  },
  subtitulo: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    marginBottom: 28,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    padding: 18,
    marginBottom: 14,
    borderRadius: 12,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTexts: { flex: 1 },
  cardTitulo: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
  },
  cardArrow: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    color: COLORS.gray5,
  },

  // Recientes
  recientesSection: {
    marginTop: 24,
  },
  recientesTitulo: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 14,
  },
  recientesScroll: {
    flexDirection: 'row',
  },
  recienteCard: {
    width: 110,
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    alignItems: 'center',
  },
  recienteLogo: {
    width: 50,
    height: 30,
    marginBottom: 8,
  },
  recienteModelo: {
    fontFamily: FONTS.heading,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
    textAlign: 'center',
  },
  recienteMarca: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.gray4,
    textAlign: 'center',
    marginTop: 2,
  },

  // Tendencias
  trendTabs: {
    flexDirection: 'row',
    backgroundColor: '#F0F4F8',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  trendTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  trendTabActive: {
    backgroundColor: COLORS.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  trendTabText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
  },
  trendTabTextActive: {
    color: COLORS.navy,
    fontWeight: '700',
  },
  badgeTrend: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.green,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  badgeTrendText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    includeFontPadding: false,
  },

  // Subtle links row
  subtleLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
    gap: 8,
  },
  subtleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  subtleLinkText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 13,
    color: COLORS.navy,
    textDecorationLine: 'underline',
  },
  subtleDivider: {
    width: 1,
    height: 16,
    backgroundColor: COLORS.gray5,
    marginHorizontal: 4,
  },
});
