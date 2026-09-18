import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, FlatList, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { getProductBySku } from '../../utils/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

const StarIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const SearchIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.gray4}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const CloseIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Clave separada para guardar el ORDEN de los favoritos como array.
// Los SKUs son numericos y JavaScript reordena Object.keys() automaticamente
// en orden numerico ascendente, por eso se guardaba el orden en un array aparte.
const FAVORITES_ORDER_CACHE_KEY = '@user_favorites_order_cache';

interface FavItem {
  sku: string;
  name: string;
  marca: string;
  img: string;
}

export default function FavoritesPanel() {
  const { session } = useAuthStore();
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();

  const [favorites, setFavorites] = useState<FavItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const reabrirModalAlVolver = useRef(false);

  const enrich = async (skus: string[]): Promise<FavItem[]> =>
    Promise.all(
      skus.map(async (sku) => {
        const prod = await getProductBySku(sku);
        return {
          sku,
          name: prod ? prod.modelo : sku,
          marca: prod?.marca || '',
          img: prod?.imagen || prod?.imagenOriginal || '',
        };
      })
    );

  const fetchFaves = async () => {
    if (!session?.user?.id) return;

    let activeFavs: string[] = [];

    // 1. Render inmediato desde cache usando el array de orden separado
    try {
      const orderCache = await AsyncStorage.getItem(FAVORITES_ORDER_CACHE_KEY);
      const cache = await AsyncStorage.getItem('@user_favorites_cache');

      if (orderCache && cache) {
        const favsMap = JSON.parse(cache);
        const order: string[] = JSON.parse(orderCache);
        activeFavs = order.filter(sku => favsMap[sku]);
        if (activeFavs.length > 0) {
          const enriched = await enrich(activeFavs);
          setFavorites(enriched);
        } else {
          setFavorites([]);
        }
      } else if (cache) {
        // Compatibilidad con caches viejas sin array de orden
        const favsMap = JSON.parse(cache);
        activeFavs = Object.keys(favsMap).filter(sku => favsMap[sku]);
        if (activeFavs.length > 0) {
          const enriched = await enrich(activeFavs);
          setFavorites(enriched);
        } else {
          setFavorites([]);
        }
      }
    } catch (_e) {}

    // 2. Fetch silencioso a Supabase para sincronizar
    const { data } = await supabase
      .from('user_favorites')
      .select('sku')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (data) {
      const dbFavs = data.map(r => r.sku);

      if (dbFavs.join(',') !== activeFavs.join(',')) {
        const enriched = await enrich(dbFavs);
        setFavorites(enriched);
        const map: Record<string, boolean> = {};
        dbFavs.forEach(sku => { map[sku] = true; });
        AsyncStorage.setItem('@user_favorites_cache', JSON.stringify(map));
        AsyncStorage.setItem(FAVORITES_ORDER_CACHE_KEY, JSON.stringify(dbFavs));
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFaves();
      if (reabrirModalAlVolver.current) {
        reabrirModalAlVolver.current = false;
        setModalVisible(true);
      }
    }, [session?.user?.id])
  );

  const removeFavorite = async (sku: string) => {
    if (!session?.user?.id) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFavorites(prev => prev.filter(f => f.sku !== sku));

    try {
      const cache = await AsyncStorage.getItem('@user_favorites_cache');
      const map = cache ? JSON.parse(cache) : {};
      delete map[sku];
      await AsyncStorage.setItem('@user_favorites_cache', JSON.stringify(map));

      const orderCache = await AsyncStorage.getItem(FAVORITES_ORDER_CACHE_KEY);
      if (orderCache) {
        const order: string[] = JSON.parse(orderCache).filter((s: string) => s !== sku);
        await AsyncStorage.setItem(FAVORITES_ORDER_CACHE_KEY, JSON.stringify(order));
      }
    } catch (_e) {}

    await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', session.user.id)
      .eq('sku', sku);
  };

  if (!isFeatureEnabled('favoritos')) return null;

  const displayFavorites = favorites.slice(0, 8);
  const filteredFavorites = favorites.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.marca.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SvgXml xml={StarIcon} />
          <Text style={styles.cardTitle}>Mis Favoritos</Text>
        </View>
        {favorites.length > 0 && (
          <TouchableOpacity onPress={() => setModalVisible(true)}>
            <Text style={styles.verTodos}>Ver todos ({favorites.length})</Text>
          </TouchableOpacity>
        )}
      </View>

      {favorites.length === 0 ? (
        <Text style={styles.empty}>Aun no guardaste ningun favorito.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroller}>
          {displayFavorites.map((item) => {
            const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sku.substring(0, 2))}&background=E8ECF0&color=1A2530`;
            return (
              <TouchableOpacity
                key={item.sku}
                style={styles.favCard}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ProductViewer', { sku: item.sku })}
              >
                <Image source={{ uri: item.img || fallback }} style={styles.favImg} contentFit="contain" />
                <Text style={styles.favMarca} numberOfLines={1}>{item.marca}</Text>
                <Text style={styles.favName} numberOfLines={2}>{item.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Todos mis Favoritos</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
              <SvgXml xml={CloseIcon} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <SvgXml xml={SearchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por marca, modelo o SKU..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={COLORS.gray4}
            />
          </View>

          <FlatList
            data={filteredFavorites}
            keyExtractor={item => item.sku}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sku.substring(0, 2))}&background=E8ECF0&color=1A2530`;
              return (
                <View style={styles.listCard}>
                  <TouchableOpacity
                    style={styles.listCardMain}
                    activeOpacity={0.7}
                    onPress={() => {
                      reabrirModalAlVolver.current = true;
                      setModalVisible(false);
                      navigation.navigate('ProductViewer', { sku: item.sku });
                    }}
                  >
                    <Image source={{ uri: item.img || fallback }} style={styles.listImg} contentFit="contain" />
                    <View style={styles.listInfo}>
                      <Text style={styles.listMarca}>{item.marca}</Text>
                      <Text style={styles.listName}>{item.name}</Text>
                      <Text style={styles.listSku}>SKU: {item.sku}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.starBtn}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => removeFavorite(item.sku)}
                  >
                    <SvgXml xml={StarIcon} width={22} height={22} />
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No se encontraron favoritos.</Text>}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textTransform: 'uppercase', letterSpacing: 0.5 },
  verTodos: { fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.green },
  empty: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  scroller: { gap: 12, paddingRight: 4 },
  favCard: { width: 96, alignItems: 'center' },
  favImg: { width: 80, height: 80, borderRadius: 10, backgroundColor: COLORS.bg, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  favMarca: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4, textTransform: 'uppercase', textAlign: 'center' },
  favName: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, textAlign: 'center', marginTop: 2 },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontFamily: FONTS.heading, fontSize: 20, fontWeight: '700', color: COLORS.navy },
  closeBtn: { padding: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, margin: 16, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: 10 },
  searchInput: { flex: 1, height: 44, fontFamily: FONTS.body, fontSize: 15, color: COLORS.navy },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  listCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: COLORS.border },
  listCardMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  starBtn: { paddingHorizontal: 6, paddingVertical: 6, flexShrink: 0 },
  listImg: { width: 60, height: 60, borderRadius: 8, backgroundColor: COLORS.bg },
  listInfo: { flex: 1 },
  listMarca: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textTransform: 'uppercase' },
  listName: { fontFamily: FONTS.bodySemi, fontSize: 15, color: COLORS.navy, marginVertical: 2 },
  listSku: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 },
});