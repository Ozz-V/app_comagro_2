import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import { getProductBySku } from '../../utils/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

const CACHE_KEY = '@historial_star_product_v2';

const TrophyIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
const EyeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ShareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${COLORS.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

export default function StarProductPanel() {
  const { isFeatureEnabled } = useFeaturesStore();
  const navigation = useNavigation<any>();
  const [starData, setStarData] = useState<{ sku: string; name: string; marca: string; subcategory: string; img: string; views: number; shares: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setStarData(JSON.parse(cached));
      } catch (e) {}

      // RPC agregada: el ranking global (de TODOS los usuarios) ya no se puede
      // calcular leyendo la tabla cruda desde el cliente, porque RLS solo deja
      // ver las propias filas a quien no es admin. La función agrega en el
      // servidor y devuelve solo el top de SKUs.
      const { data, error } = await supabase.rpc('get_global_top_skus', { p_limit: 1 });

      if (!error && data && data.length > 0) {
        const top = data[0];
        const starSku = top?.sku;

        if (starSku) {
          const prod = await getProductBySku(starSku);
          const result = {
            sku: starSku,
            views: Number(top.views || 0),
            shares: Number(top.shares || 0),
            name: prod ? prod.modelo : starSku,
            marca: prod?.marca || '',
            subcategory: prod?.subcategoria || 'Sin subcategoría',
            img: prod?.imagen || prod?.imagenOriginal || '',
          };
          setStarData(result);
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result));
        }
      }
    };
    load();
  }, []);

  if (!isFeatureEnabled('producto_estrella')) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={starData ? 0.9 : 1}
      disabled={!starData}
      onPress={() => starData && navigation.navigate('ProductViewer', { sku: starData.sku })}
    >
      <View style={styles.header}>
        <SvgXml xml={TrophyIcon} />
        <Text style={styles.title}>Producto Estrella</Text>
      </View>

      {!starData ? (
        <Text style={styles.empty}>Calculando tendencias...</Text>
      ) : (
        <>
          {/* Grid de 2 columnas: foto/logo a la izquierda, datos a la derecha en 3 líneas.
              Nota: en este modelo de datos "modelo" (starData.name) es el mismo
              valor que el SKU (ver database.ts: modelo: r.sku), así que mostrarlo
              acá repetía el SKU dos veces. Se muestra solo la marca, el SKU va
              únicamente en skuText de abajo. */}
          <View style={styles.gridRow}>
            <View style={styles.imgWrapper}>
              <Image
                source={{ uri: starData.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(starData.sku.substring(0, 2))}&background=E8ECF0&color=1A2530` }}
                style={styles.img}
                contentFit="contain"
              />
            </View>

            <View style={styles.content}>
              <Text style={styles.typeText} numberOfLines={1} ellipsizeMode="tail">{starData.subcategory}</Text>
              <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">{starData.marca || starData.name}</Text>
              <Text style={styles.skuText} numberOfLines={1} ellipsizeMode="tail">SKU: {starData.sku}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <SvgXml xml={EyeIcon} />
              <Text style={styles.statValue}>{starData.views}</Text>
              <Text style={styles.statLabel}>Vistas</Text>
            </View>
            <View style={styles.statBox}>
              <SvgXml xml={ShareIcon} />
              <Text style={styles.statValue}>{starData.shares}</Text>
              <Text style={styles.statLabel}>Compartidos</Text>
            </View>
          </View>
        </>
      )}
    </TouchableOpacity>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  title: { fontFamily: FONTS.bodySemi, fontSize: 11, color: '#FFC107', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, textAlign: 'center' },
  // Grid de 2 columnas invisible: columna izquierda (foto) + columna derecha (texto, 3 líneas)
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  imgWrapper: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    flexShrink: 0,
  },
  img: { width: '100%', height: '100%' },
  content: { flex: 1, minWidth: 0 },
  typeText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontFamily: FONTS.heading, fontSize: 17, fontWeight: '700', color: COLORS.navy, marginVertical: 2 },
  skuText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  statValue: { fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy, marginTop: 2 },
  statLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginTop: 2 },
});
