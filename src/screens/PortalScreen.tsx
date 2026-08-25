import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ScrollView, Platform, Modal, DeviceEventEmitter, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { syncAnalyticsQueue } from '../utils/analyticsSync';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import CalculadoraModal from '../components/CalculadoraModal';
import ProfileCompleteModal from '../components/ProfileCompleteModal';
import OnboardingTutorial from '../components/OnboardingTutorial';
import ForumModal from '../components/ForumModal';
import { ParsedProduct } from '../types/models';

const ANIMATION_ISO = require('../../assets/iso.json');

const PROFILE_CACHE_KEY = '@profile_status_cache';

export default function PortalScreen({ navigation }: { navigation: any }) {
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [showForumModal, setShowForumModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [allProdsCache, setAllProdsCache] = useState<ParsedProduct[]>([]);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profName, setProfName] = useState('');
  const [profPhoneInit, setProfPhoneInit] = useState('');

  const [showNewProductsModal, setShowNewProductsModal] = useState(false);
  const [newProductsSkus, setNewProductsSkus] = useState<string[]>([]);

  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      checkProfile();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const subForum = DeviceEventEmitter.addListener('OPEN_FORUM', (data) => {
      if (data && data.topicId) {
        setShowForumModal(true);
      }
    });

    const subProducts = DeviceEventEmitter.addListener('OPEN_NEW_PRODUCTS', (data) => {
      if (data && data.skus && Array.isArray(data.skus) && data.skus.length > 0) {
        setNewProductsSkus(data.skus);
        setShowNewProductsModal(true);
      }
    });

    return () => {
      subForum.remove();
      subProducts.remove();
    };
  }, []);

  const parseRawProducts = (rawData: string) => {
    const COLS_EXCLUIDAS = new Set([
      'SKU', 'imagen 1', 'imagen 2', 'imagen 3', 'imagen 4', 'imagen 5',
      'Brand', 'Marca', 'marca', 'id', 'ID', 'Tipo de Producto', 'Categoria Magento',
      'url_key', 'sales_pitch'
    ]);
    return JSON.parse(rawData).map((row: Record<string, unknown>) => {
      const marca = (row['Brand'] || row['Marca'] || row['marca'] || row['MARCA'] || '').toString().trim();
      const subcategoria = (row['Tipo de Producto'] || row['Categoria Magento'] || 'General').toString().trim().toUpperCase();
      const imagen = (row['imagen 1'] || row['imagen'] || null) as string | null;
      const specs = [];
      const basura = ['n/a', 'na', 'n.a', 'n.a.', 'no aplica', 'sin dato', 'sin datos',
        'no', 'no tiene', 'no disponible', 'pim', '-', '--', '---', 'st', 'sin información',
        'no corresponde', 'sin especificar', 'sin info'];

      for (const [col, val] of Object.entries(row)) {
        if (!COLS_EXCLUIDAS.has(col) && !col.startsWith('_')) {
          if (val !== null && val !== undefined && val !== '') {
            const s = String(val).trim();
            const sLower = s.toLowerCase();
            if (s.length > 0 && !/^0([.,]0+)?$/.test(s) && !basura.includes(sLower)) {
              specs.push([col, s]);
            }
          }
        }
      }
      return { modelo: (row['SKU'] || '').toString().trim(), marca, subcategoria, imagen, specs };
    });
  };

  useEffect(() => {
    if (showCalcModal && allProdsCache.length === 0) {
      const loadCache = async () => {
        try {
          const res = await AsyncStorage.getItem('@productos_cache');
          let parsed = false;
          if (res) {
            try {
              setAllProdsCache(parseRawProducts(res));
              parsed = true;
            } catch {}
          }
          if (!parsed) {
            const res2 = await AsyncStorage.getItem('comagro_productos_v3');
            if (res2) {
              setAllProdsCache(parseRawProducts(res2));
            }
          }
        } catch {}
      };
      loadCache();
    }
  }, [showCalcModal, allProdsCache.length]);

  async function applyCachedProfileStatus() {
    try {
      const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
      if (!cached) return;
      const { complete, name, phone } = JSON.parse(cached);
      if (!complete) {
        setProfName(name || '');
        setProfPhoneInit(phone || '');
        setShowProfileModal(true);
      } else {
        const tutorialSeen = await AsyncStorage.getItem('@tutorial_seen');
        if (!tutorialSeen) setShowTutorial(true);
      }
    } catch {}
  }

  async function checkProfile() {
    const withTimeout = <T,>(promise: PromiseLike<T>): Promise<T> =>
      Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]);

    try {
      const { data: { user } } = await withTimeout(supabase.auth.getUser());
      if (!user) return;
      const { data } = await withTimeout(supabase.from('profiles').select('id, full_name, telefono').eq('id', user.id).single());
      if (!isMounted.current) return;

      const incomplete = !data || !data.full_name || data.full_name.trim() === '' || !data.telefono || data.telefono === '' || data.telefono === '+595';

      if (incomplete) {
        const name = data?.full_name && data.full_name.trim() !== '' ? data.full_name : '';
        const phone = data?.telefono && data.telefono !== '+595' ? data.telefono : '';
        setProfName(name);
        setProfPhoneInit(phone);
        setShowProfileModal(true);
        await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ complete: false, name, phone }));
      } else {
        setProfName(data.full_name);
        await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ complete: true }));
        const tutorialSeen = await AsyncStorage.getItem('@tutorial_seen');
        if (!tutorialSeen) setShowTutorial(true);
      }
    } catch {}
  }

  useEffect(() => {
    applyCachedProfileStatus();
    syncAnalyticsQueue();
    checkProfile();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView
          source={ANIMATION_ISO}
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

        <TouchableOpacity style={styles.gridCardFull} activeOpacity={0.8} onPress={() => navigation.navigate('Productos')}>
          <View style={styles.gridIconFull}>
            <SvgIcon name="buscar" size={32} color={COLORS.navy} />
          </View>
          <Text style={styles.gridTitleFull}>Todos los productos</Text>
        </TouchableOpacity>

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

        <View style={styles.gridRow3}>
          <TouchableOpacity style={styles.gridCardThird} activeOpacity={0.8} onPress={() => setShowCalcModal(true)}>
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

        <View style={[styles.gridRow3, { marginTop: 10 }]}>
          <TouchableOpacity style={styles.gridCardThird} activeOpacity={0.8} onPress={() => setShowForumModal(true)}>
            <View style={styles.gridIconThird}>
              <SvgIcon name="chatBubble" size={24} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleThird}>Sugerencias</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridCardThird} activeOpacity={0.8} onPress={() => navigation.navigate('Notificaciones')}>
            <View style={styles.gridIconThird}>
              <SvgIcon name="campana" size={24} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleThird}>Notificaciones</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridCardThird} activeOpacity={0.8} onPress={() => navigation.navigate('Estadisticas')}>
            <View style={styles.gridIconThird}>
              <SvgIcon name="chart" size={24} color={COLORS.navy} />
            </View>
            <Text style={styles.gridTitleThird}>Estadísticas</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* --- MODAL PARA NUEVOS PRODUCTOS --- */}
      <Modal visible={showNewProductsModal} animationType="slide" transparent onRequestClose={() => setShowNewProductsModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '75%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <SvgIcon name="campana" size={18} color={COLORS.green} />
                </View>
                <Text style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: '700', color: COLORS.navy }}>Productos Nuevos</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNewProductsModal(false)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 26, color: COLORS.gray4, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={newProductsSkus}
              keyExtractor={(item, index) => `${item}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              ListHeaderComponent={
                <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, marginBottom: 16 }}>
                  Selecciona un modelo para ver su ficha técnica detallada:
                </Text>
              }
              renderItem={({ item: sku }) => (
                <TouchableOpacity
                  style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  onPress={() => {
                    setShowNewProductsModal(false);
                    navigation.navigate('ProductViewer', { sku });
                  }}
                >
                  <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '600', color: COLORS.navy }}>SKU: {sku}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.green, marginRight: 6 }}>Ver ficha</Text>
                    <Text style={{ color: COLORS.green, fontSize: 18 }}>›</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ fontFamily: FONTS.body, color: COLORS.gray4, textAlign: 'center', marginTop: 20 }}>No hay información de SKUs disponible.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      <CalculadoraModal 
        visible={showCalcModal} 
        onClose={() => setShowCalcModal(false)} 
        navigation={navigation} 
      />

      <ProfileCompleteModal 
        visible={showProfileModal} 
        onSuccess={async (name: string) => { 
          setProfName(name); 
          setShowProfileModal(false); 
          const tutorialSeen = await AsyncStorage.getItem('@tutorial_seen');
          if (!tutorialSeen) setShowTutorial(true);
        }} 
        initialName={profName}
        initialPhone={profPhoneInit}
      />

      <OnboardingTutorial 
        visible={showTutorial} 
        onClose={async () => {
          setShowTutorial(false);
          await AsyncStorage.setItem('@tutorial_seen', '1');
        }}
      />

      <ForumModal
        visible={showForumModal}
        onClose={() => setShowForumModal(false)}
      />

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
  content: { padding: 24, paddingTop: 32, paddingBottom: 100 },
  gridCardFull: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  gridIconFull: { marginBottom: 12 },
  gridTitleFull: { fontFamily: FONTS.heading, fontSize: 20, fontWeight: '700', color: COLORS.navy, textAlign: 'center' },
  gridRow2: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  gridCardHalf: { flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 24, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  gridIconHalf: { marginBottom: 12 },
  gridTitleHalf: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, textAlign: 'center' },
  gridSeparator: { height: 3, backgroundColor: COLORS.green, borderRadius: 2, marginBottom: 24, marginHorizontal: '5%' },
  gridRow3: { flexDirection: 'row', gap: 10 },
  gridCardThird: { flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  gridIconThird: { marginBottom: 8 },
  gridTitleThird: { fontFamily: FONTS.heading, fontSize: 11, fontWeight: '700', color: COLORS.navy, textAlign: 'center' },
});
