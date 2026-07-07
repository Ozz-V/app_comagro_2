import React, { useState, useEffect } from 'react';
import { View, SafeAreaView, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProductDetailModal from '../components/ProductDetailModal';
import CompareModal from '../components/CompareModal';
import { supabase } from '../supabase';
import { getProductBySku } from '../utils/database';
import { useAiData } from '../hooks/useAiData';

export default function ProductViewerScreen({ route, navigation }: { route: any; navigation: any }) {
  const { sku, contextSkus } = route.params || {};
  const [modalProd, setModalProd] = useState<any>(null);
  const [activeSliderList, setActiveSliderList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { aiData, setAiData, loadingAi, fetchAiData } = useAiData();

  // Compare state (self-contained: no need to navigate away to ProductosScreen)
  const [compareItems, setCompareItems] = useState<any[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const [logoRefreshKey] = useState(Date.now().toString());

  // fetchAiData is now imported from useAiData hook

  function handleOpenProduct(prod: any) {
    setAiData(null);
    setModalProd(prod);
    fetchAiData(prod.modelo, prod.sales_pitch);
  }

  useEffect(() => {
    const loadProduct = async () => {
      try {
        if (sku) {
          const { getProductBySku, fetchMissingProductFromCloud } = require('../utils/database');
          let prod = await getProductBySku(sku);
          if (!prod) {
            prod = await fetchMissingProductFromCloud(sku);
          }
          if (prod) {
            setModalProd(prod);
            fetchAiData(prod.modelo, prod.sales_pitch);
          }
        }
        if (contextSkus && contextSkus.length > 0) {
          const items = await Promise.all(contextSkus.map((s: any) => getProductBySku(s)));
          setActiveSliderList(items.filter(Boolean));
        } else {
          setActiveSliderList([]);
        }
      } catch (e: any) {
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
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFF" />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* @ts-ignore */}
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
        onCompare={(items: any[]) => {
          setCompareItems(items);
          setShowCompare(true);
        }}
      />

      <CompareModal
        visible={showCompare}
        compareItems={compareItems}
        setCompareItems={setCompareItems}
        onClose={() => setShowCompare(false)}
        onOpenProduct={(prod: any) => {
          setShowCompare(false);
          handleOpenProduct(prod);
        }}
      />
    </View>
  );
}
