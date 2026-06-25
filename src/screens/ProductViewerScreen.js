import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProductDetailModal from '../components/ProductDetailModal';
import { COLORS } from '../theme';
import { supabase } from '../supabase';

export default function ProductViewerScreen({ route, navigation }) {
  const { sku, contextSkus } = route.params || {};
  const [allProducts, setAllProducts] = useState([]);
  const [modalProd, setModalProd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  async function fetchAiData(skuToFetch) {
    if (!skuToFetch) {
      setAiData('Texto inteligente en preparación.');
      return;
    }
    setLoadingAi(true);

    try {
      const rawCache = await AsyncStorage.getItem('@ai_cache_all');
      if (rawCache) {
        const aiDict = JSON.parse(rawCache);
        if (aiDict[skuToFetch]) {
          setAiData(aiDict[skuToFetch]);
          setLoadingAi(false);
          return;
        }
      }
    } catch (_) {}

    try {
      const { data } = await supabase.from('productos_ai_data').select('sales_pitch').eq('sku', skuToFetch).single();
      if (data?.sales_pitch) {
        setAiData(data.sales_pitch);
        try {
          const rawCache = await AsyncStorage.getItem('@ai_cache_all');
          const aiDict = rawCache ? JSON.parse(rawCache) : {};
          aiDict[skuToFetch] = data.sales_pitch;
          await AsyncStorage.setItem('@ai_cache_all', JSON.stringify(aiDict));
        } catch (_) {}
      } else {
        setAiData('Texto inteligente en preparación.');
      }
    } catch (e) {
      setAiData('Texto inteligente en preparación.');
    } finally {
      setLoadingAi(false);
    }
  }

  // Función para parsear los productos de la caché
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
      return { modelo: (row['SKU'] || '').toString().trim(), marca, subcategoria, imagen, specs, sales_pitch: row['sales_pitch'] || '' };
    });
  };

  useEffect(() => {
    const loadProduct = async () => {
      try {
        let res = await AsyncStorage.getItem('@productos_cache');
        let parsedList = [];
        let parsed = false;
        
        if (res) {
          try {
            parsedList = parseRawProducts(res);
            parsed = true;
          } catch (e) {
            console.log('Error parseando @productos_cache', e);
          }
        }
        if (!parsed) {
          let res2 = await AsyncStorage.getItem('comagro_productos_v3');
          if (res2) {
            parsedList = parseRawProducts(res2);
          }
        }

        setAllProducts(parsedList);

        if (sku && parsedList.length > 0) {
          const prod = parsedList.find(p => p.modelo === sku || p.sku === sku);
          if (prod) {
            setModalProd(prod);
            fetchAiData(prod.modelo);
          }
        }
      } catch (e) {
        console.log('Error en ProductViewerScreen', e);
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [sku]);

  const activeSliderList = React.useMemo(() => {
    if (contextSkus && allProducts.length > 0) {
      return contextSkus.map(s => allProducts.find(p => p.modelo === s || p.sku === s)).filter(Boolean);
    }
    return [];
  }, [contextSkus, allProducts]);

  useEffect(() => {
    if (!loading && !modalProd) {
      navigation.goBack();
    }
  }, [loading, modalProd, navigation]);

  if (loading || !modalProd) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ProductDetailModal
        visible={!!modalProd}
        modalProd={modalProd}
        onClose={() => navigation.goBack()}
        allProducts={allProducts}
        activeSliderList={activeSliderList.length > 0 ? activeSliderList : [modalProd]}
        onOpenProduct={(prod) => {
          setModalProd(prod);
          fetchAiData(prod.modelo);
        }}
        aiData={aiData}
        loadingAi={loadingAi}
        onCompare={(items) => {
          navigation.navigate('Productos', { compareSkus: items.map(i => i.modelo) });
        }}
      />
    </View>
  );
}
