import React, { useState, useEffect, useCallback } from 'react';
import { View, SafeAreaView, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import ProductDetailModal from '../components/ProductDetailModal';
import CompareModal from '../components/CompareModal';
import { getProductBySku, fetchMissingProductFromCloud } from '../utils/database';
import { useAiData } from '../hooks/useAiData';
import { fetchImageBase64 } from '../utils/pdfService';
import { APP_CONSTANTS } from '../config/constants';
import { ParsedProduct, CompareItem } from '../types/models';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { supabase } from '../supabase';

interface RouteParams {
  sku?: string;
  contextSkus?: string[];
  notificationId?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ProductViewerScreen({ route, navigation }: { route: any; navigation: any }) {
  const { sku, contextSkus, notificationId } = route.params || {};
  const [modalProd, setModalProd] = useState<ParsedProduct | null>(null);
  const [activeSliderList, setActiveSliderList] = useState<ParsedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { aiData, setAiData, loadingAi, fetchAiData } = useAiData();
  const { showAlert } = useCustomAlert();

  const [compareItems, setCompareItems] = useState<CompareItem[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const [logoRefreshKey] = useState(() => Date.now().toString());
  const [pdfCache, setPdfCache] = useState<{ prodBase64: string; logoBase64: string }>({ prodBase64: '', logoBase64: '' });

  useEffect(() => {
    let cancelled = false;
    setPdfCache({ prodBase64: '', logoBase64: '' });
    if (modalProd) {
      const marcaSlug = (modalProd.marca || 'marca').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const logoUrl = `${APP_CONSTANTS.LOGO_BASE_BRANDS_2025}${marcaSlug}.jpg?v=${logoRefreshKey}`;
      const imgUrl = modalProd.imagenOriginal || modalProd.imagen || '';
      Promise.all([fetchImageBase64(imgUrl), fetchImageBase64(logoUrl)]).then(([prodBase64, logoBase64]) => {
        if (!cancelled) setPdfCache({ prodBase64, logoBase64 });
      });
    }
    return () => { cancelled = true; };
  }, [modalProd, logoRefreshKey]);

  const handleOpenProduct = useCallback((prod: ParsedProduct) => {
    setAiData(null);
    setModalProd(prod);
    fetchAiData(prod.modelo || '', prod.sales_pitch || '');
  }, [fetchAiData, setAiData]);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        if (sku) {
          let prod = await getProductBySku(sku);
          if (!prod) {
            prod = await fetchMissingProductFromCloud(sku);
          }
          if (prod) {
            setModalProd(prod);
            fetchAiData(prod.modelo || '', prod.sales_pitch || '');
          }
        }
        if (contextSkus && contextSkus.length > 0) {
          const items = await Promise.all(contextSkus.map((s: string) => getProductBySku(s)));
          setActiveSliderList(items.filter((item): item is ParsedProduct => Boolean(item)));
        } else {
          setActiveSliderList([]);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [sku, contextSkus, fetchAiData]);

  useEffect(() => {
    if (!loading && !modalProd) {
      if (sku) {
        if (notificationId != null) {
          showAlert(
            'Producto no disponible',
            'Este producto ya no está disponible en el catálogo porque fue eliminado o descontinuado.\n\n¿Deseas eliminar también esta notificación del historial?',
            [
              {
                text: 'Conservar',
                style: 'cancel',
              },
              {
                text: 'Eliminar',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await supabase
                    .from('notifications_log')
                    .delete()
                    .eq('id', notificationId);

                  if (error) {
                    showAlert(
                      'No se pudo eliminar',
                      'La notificación no pudo eliminarse del historial.'
                    );
                  } else {
                    // Aquí emite la orden de borrar localmente y de la caché!
                    DeviceEventEmitter.emit('DELETE_NOTIFICATION', notificationId);
                  }
                },
              },
            ]
          );
        } else {
          showAlert(
            'Producto no disponible',
            'Este producto ya no está disponible en el catálogo.'
          );
        }
      }

      navigation.goBack();
    }
  }, [loading, modalProd, navigation]);

  if (loading || !modalProd) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0D8A39" />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* @ts-expect-error - ProductDetailModal typing requires complete rewrite */}
      <ProductDetailModal
        visible={!!modalProd}
        modalProd={modalProd}
        onClose={() => navigation.goBack()}
        activeSliderList={activeSliderList.length > 0 ? activeSliderList : [modalProd]}
        onOpenProduct={handleOpenProduct}
        aiData={aiData}
        loadingAi={loadingAi}
        pdfCache={pdfCache}
        logoRefreshKey={logoRefreshKey}
        onCompare={(items: CompareItem[]) => {
          setCompareItems(items);
          setShowCompare(true);
        }}
      />

      <CompareModal
        visible={showCompare}
        compareItems={compareItems}
        setCompareItems={setCompareItems}
        onClose={() => setShowCompare(false)}
        onOpenProduct={(prod: ParsedProduct) => {
          setShowCompare(false);
          handleOpenProduct(prod);
        }}
      />
    </View>
  );
}
