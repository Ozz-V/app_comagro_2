import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar,
  ActivityIndicator, Platform,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import { useProducts } from '../hooks/useProducts';
import { ParsedProduct } from '../types/models';
import { APP_CONSTANTS } from '../config/constants';

const ANIMATION_ISO = require('../../assets/iso.json');
const LOGO_BASE = APP_CONSTANTS.LOGO_BASE_BRANDS_2025;

interface RowItem {
  sku: string;
  product: ParsedProduct | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function UpdatedProductsScreen({ route, navigation }: { route: any; navigation: any }) {
  const { skus = [], notificationId } = route.params || {};
  const { getProductBySkuSafe } = useProducts();
  const [items, setItems] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      const uniqueSkus: string[] = [...new Set((skus || []).filter(Boolean))] as string[];
      const results: RowItem[] = [];
      for (const sku of uniqueSkus) {
        const product = await getProductBySkuSafe(sku);
        results.push({ sku, product });
      }
      if (!cancelled) {
        setItems(results);
        setLoading(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(skus)]);

  const renderItem = ({ item }: { item: RowItem }) => {
    const marca = item.product?.marca || '';
    const logoUri = marca ? `${LOGO_BASE}${marca.toUpperCase().replace(/\s+/g, '_')}.jpg` : null;
    const imgUri = item.product?.imagenOriginal || item.product?.imagen || logoUri;
    const noDisponible = !item.product;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('ProductViewer', {
          sku: item.sku,
          // Se mandan TODOS los SKUs de la tanda, no solo este: así, una vez
          // adentro, las flechas de "anterior / siguiente" del visor pueden
          // seguir recorriendo el resto de los productos actualizados.
          contextSkus: items.map(i => i.sku),
          notificationId,
        })}
      >
        <View style={styles.imgWrap}>
          {imgUri ? (
            <Image source={{ uri: imgUri }} style={styles.img} resizeMode="contain" />
          ) : (
            <SvgIcon name="buscar" size={20} color={COLORS.gray4} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sku} numberOfLines={1}>{item.sku}</Text>
          {noDisponible ? (
            <Text style={styles.noDisponible}>Ya no disponible</Text>
          ) : marca ? (
            <Text style={styles.marca}>{marca}</Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView
          source={ANIMATION_ISO}
          autoPlay
          loop
          style={styles.logoAnimado}
          resizeMode="contain"
        />
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.btnVolver}>‹ Volver</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.topBorder} />

      <Text style={styles.titulo}>Productos actualizados</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.navy} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No hay productos para mostrar.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.sku}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  btnVolver: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.green },
  titulo: {
    fontFamily: FONTS.heading, fontSize: 22, fontWeight: '800',
    color: COLORS.navy, textAlign: 'center', marginVertical: 16,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F7F8FA', borderRadius: 10,
    padding: 10, marginBottom: 8,
  },
  imgWrap: {
    width: 44, height: 44, borderRadius: 8, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  img: { width: '100%', height: '100%' },
  sku: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', color: COLORS.navy },
  marca: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4 },
  noDisponible: { fontFamily: FONTS.body, fontSize: 11, color: '#e74c3c' },
  chevron: { fontSize: 22, color: COLORS.gray4, marginLeft: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4 },
});
