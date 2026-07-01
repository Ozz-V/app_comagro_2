import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProductDetailModal from '../components/ProductDetailModal';
import CompareModal from '../components/CompareModal';
import { supabase } from '../supabase';
import { getProductBySku } from '../utils/database';

export default function ProductViewerScreen({ route, navigation }) {
  const { sku, contextSkus } = route.params || {};
  const [modalProd, setModalProd] = useState(null);
  const [activeSliderList, setActiveSliderList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Compare state (self-contained: no need to navigate away to ProductosScreen)
  const [compareItems, setCompareItems] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  const [logoRefreshKey] = useState(Date.now().toString());

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

  function handleOpenProduct(prod) {
    setAiData(null);
    setModalProd(prod);
    fetchAiData(prod.modelo);
  }

  useEffect(() => {
    const loadProduct = async () => {
      try {
        if (sku) {
          const prod = await getProductBySku(sku);
          if (prod) {
            setModalProd(prod);
            fetchAiData(prod.modelo);
          }
        }
        if (contextSkus && contextSkus.length > 0) {
          const items = await Promise.all(contextSkus.map(s => getProductBySku(s)));
          setActiveSliderList(items.filter(Boolean));
        } else {
          setActiveSliderList([]);
        }
      } catch (e) {
        console.log('Error en ProductViewerScreen DB', e);
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [sku, contextSkus]);

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
        activeSliderList={activeSliderList.length > 0 ? activeSliderList : [modalProd]}
        onOpenProduct={handleOpenProduct}
        aiData={aiData}
        loadingAi={loadingAi}
        pdfCache={{}}
        logoRefreshKey={logoRefreshKey}
        onCompare={(items) => {
          setCompareItems(items);
          setShowCompare(true);
        }}
      />

      <CompareModal
        visible={showCompare}
        compareItems={compareItems}
        setCompareItems={setCompareItems}
        onClose={() => setShowCompare(false)}
        onOpenProduct={(prod) => {
          setShowCompare(false);
          handleOpenProduct(prod);
        }}
      />
    </View>
  );
}
