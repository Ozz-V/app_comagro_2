import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, useWindowDimensions, RefreshControl, Image
} from 'react-native';

import { useProducts } from '../hooks/useProducts';
import ProductCard from '../components/ProductCard';
import FilterHeader from '../components/FilterHeader';
import SvgIcon from '../components/SvgIcon';
import ProductDetailModal from '../components/ProductDetailModal';
import CompareModal from '../components/CompareModal';
import { COLORS } from '../theme';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAiData } from '../hooks/useAiData';
import { APP_CONSTANTS } from '../config/constants';

const LOGO_BASE = APP_CONSTANTS.LOGO_BASE_BRANDS_2025;

export default function ProductosScreen({ navigation, route }: { navigation: any; route: any }) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroSubcategoria, setFiltroSubcategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const {
    productosFiltrados,
    marcas,
    cargando,
    refreshing,
    bgActualiz,
    error,
    logoRefreshKey,
    onRefresh,
    getProductBySkuSafe,
    fetchCatalog,
    dbVersion
  } = useProducts();

  useEffect(() => {
    if (!cargando) {
      fetchCatalog(filtroMarca, filtroSubcategoria, busqueda);
    }
  }, [filtroMarca, filtroSubcategoria, busqueda, cargando, dbVersion, fetchCatalog]);

  const [modalProd, setModalProd] = useState<any>(null);
  const { aiData, setAiData, loadingAi, fetchAiData } = useAiData();

  // Compare State
  const [isComparing, setIsComparing] = useState(false);
  const [compareItems, setCompareItems] = useState<any[]>([]);
  const [showCompareGrid, setShowCompareGrid] = useState(false);
  const [fromProductViewer, setFromProductViewer] = useState(false);

  // PDF Cache State
  const [pdfCache, setPdfCache] = useState({ prodBase64: '', logoBase64: '' });

  const { width } = useWindowDimensions();
  const numCols = width >= 600 ? 3 : 2;
  const cardW = (width - 32 - (numCols - 1) * 12) / numCols;

  // El filtrado ahora ocurre en SQLite a través de useProducts
  const activeSliderList = productosFiltrados;

  // Funciones de Modal
  function handleOpenModal(prod: any) {
    setAiData(null);
    setModalProd(prod);
    fetchAiData(prod.modelo, prod.sales_pitch);
  }

  function cerrarModal() {
    setModalProd(null);
  }

  // fetchAiData is now imported from useAiData hook

  // Restaurar lógica para abrir productos desde otras pantallas (miniatura)
  useEffect(() => {
    if (route?.params?.openProductSku) {
      const sku = route.params.openProductSku;
      getProductBySkuSafe(sku).then(prod => {
        if (prod) {
          handleOpenModal(prod);
          navigation.setParams({ openProductSku: undefined });
        }
      });
    }
  }, [route?.params?.openProductSku]);

  // Recibir lista de comparación desde modal transparente (ProductViewerScreen)
  useEffect(() => {
    if (route?.params?.compareSkus) {
      const skus = route.params.compareSkus;
      Promise.all(skus.map((s: any) => getProductBySkuSafe(s))).then(items => {
        const itemsToCompare = items.filter(Boolean);
        if (itemsToCompare.length > 0) {
          setCompareItems(itemsToCompare);
          setIsComparing(true);
          setShowCompareGrid(true);
          if (route.params.fromProductViewer) setFromProductViewer(true);
          navigation.setParams({ compareSkus: undefined, fromProductViewer: undefined });
        }
      });
    }
  }, [route?.params?.compareSkus]);

  // Renders de listas
  const renderMarcaBtn = useCallback(({ item: marca }: { item: string }) => {
    const logoUri = `${LOGO_BASE}${marca.replace(/\s+/g, '_')}.jpg?v=${logoRefreshKey}`;
    const activo = filtroMarca === marca;
    return (
      <TouchableOpacity
        style={[styles.marcaBtn, activo && styles.marcaBtnActive]}
        onPress={() => setFiltroMarca(activo ? '' : marca)}
        activeOpacity={0.75}
      >
        <Image source={{ uri: logoUri }} style={styles.marcaLogo} resizeMode="contain" />
        {activo && <View style={styles.marcaOverlay} />}
      </TouchableOpacity>
    );
  }, [filtroMarca, logoRefreshKey]);

  const mostrarLista = filtroMarca || busqueda.trim();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* HEADER VISUAL AISLADO EN UN COMPONENTE */}
      <FilterHeader 
        filtroMarca={filtroMarca}
        busqueda={busqueda}
        filtroSubcategoria={filtroSubcategoria}
        setFiltroMarca={setFiltroMarca}
        setBusqueda={setBusqueda}
        setFiltroSubcategoria={setFiltroSubcategoria}
        onClearFilters={() => { setFiltroMarca(''); setFiltroSubcategoria(''); setBusqueda(''); setIsComparing(false); setCompareItems([]); }}
        onGoBack={() => navigation.goBack()}
      />
      <View style={styles.topBorder} />

      {/* ESTADO DE CARGA */}
      {cargando ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.navy} /><Text style={styles.centerText}>Cargando catálogo…</Text></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryBtn} onPress={onRefresh}><Text style={styles.retryText}>Reintentar</Text></TouchableOpacity></View>
      ) : !mostrarLista ? (
        <View style={{ flex: 1 }}>
          {bgActualiz && <View style={styles.bgBanner}><ActivityIndicator size="small" color={COLORS.white} /><Text style={styles.bgBannerText}>Actualizando catálogo…</Text></View>}
          <FlatList
            data={marcas}
            renderItem={renderMarcaBtn}
            keyExtractor={m => m}
            numColumns={3}
            contentContainerStyle={styles.marcasGrid}
            columnWrapperStyle={styles.marcasRow}
            ListHeaderComponent={
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10, paddingHorizontal: 20}}>
                <SvgIcon name="actualizar" size={16} color={COLORS.gray4} />
                <Text style={{fontSize: 13, color: COLORS.gray4, marginLeft: 8, textAlign: 'center'}}>Deslice hacia abajo para actualizar la lista de productos</Text>
              </View>
            }
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.navy]} />}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {bgActualiz && <View style={styles.bgBanner}><ActivityIndicator size="small" color={COLORS.white} /><Text style={styles.bgBannerText}>Actualizando catálogo…</Text></View>}
          <FlatList
            data={productosFiltrados}
            renderItem={({ item }: { item: any }) => (
              <ProductCard 
                item={item} 
                cardW={cardW} 
                isSelected={isComparing && compareItems.some(c => c.modelo === item.modelo)}
                onPress={() => {
                  if (isComparing) {
                    if (compareItems.some(c => c.modelo === item.modelo)) setCompareItems(prev => prev.filter(c => c.modelo !== item.modelo));
                    else if (compareItems.length >= 4) showAlert('Límite', 'Podés comparar hasta 4 productos a la vez.');
                    else setCompareItems(prev => [...prev, item]);
                  } else {
                    handleOpenModal(item);
                  }
                }} 
                onLongPress={() => {
                  if (!isComparing) {
                    setIsComparing(true);
                    setCompareItems([item]);
                  }
                }}
              />
            )}
            keyExtractor={item => item.modelo}
            numColumns={numCols}
            key={numCols}
            contentContainerStyle={styles.prodGrid}
            columnWrapperStyle={styles.prodRow}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.navy]} />}
          />

          {/* Floating Compare Toolbar */}
          {isComparing && (
            <View style={[styles.compareToolbar, { bottom: 20 + (insets.bottom || 0) }]}>
              <Text style={styles.compareToolbarText}>Seleccionados: {compareItems.length}/4</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { setIsComparing(false); setCompareItems([]); }} style={styles.compareClearBtn}>
                  <Text style={{ color: COLORS.gray4 }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => { if(compareItems.length > 1) setShowCompareGrid(true); else showAlert('Aviso', 'Seleccioná al menos 2 productos para comparar.'); }}
                  style={[styles.compareRunBtn, { backgroundColor: compareItems.length > 1 ? COLORS.navy : COLORS.gray4 }]}
                >
                  <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Comparar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* MODAL DEL PRODUCTO */}
      {/* @ts-ignore */}
      <ProductDetailModal
        visible={!!modalProd}
        modalProd={modalProd}
        onClose={cerrarModal}
        logoRefreshKey={logoRefreshKey}
        pdfCache={pdfCache}
        aiData={aiData}
        loadingAi={loadingAi}
        activeSliderList={activeSliderList}
        onOpenProduct={handleOpenModal}
        onCompare={(items: any[]) => {
          setCompareItems(items);
          setIsComparing(true);
          setShowCompareGrid(true);
          cerrarModal();
        }}
      />

      {/* MODAL DE COMPARACIÓN */}
      <CompareModal
        visible={showCompareGrid}
        compareItems={compareItems}
        onClose={() => {
          setShowCompareGrid(false);
          if (fromProductViewer) {
            setFromProductViewer(false);
            setIsComparing(false);
            setCompareItems([]);
            navigation.goBack();
          }
        }}
        onOpenProduct={(prod: any) => {
          setShowCompareGrid(false);
          handleOpenModal(prod);
        }}
        setCompareItems={setCompareItems}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { marginTop: 10, color: COLORS.gray4, fontFamily: FONTS.body },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 15 },
  retryBtn: { padding: 10, backgroundColor: COLORS.navy, borderRadius: 8 },
  retryText: { color: COLORS.white },
  marcasGrid: { padding: 12 },
  marcasRow: { gap: 10, marginBottom: 10 },
  welcomeText: { textAlign: 'center', marginVertical: 20, color: COLORS.gray4 },
  marcaBtn: { flex: 1, height: 80, backgroundColor: COLORS.white, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  marcaBtnActive: { borderColor: COLORS.navy, borderWidth: 2 },
  marcaLogo: { width: '100%', height: '100%' },
  marcaOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,37,102,0.1)' },
  prodGrid: { padding: 16, paddingBottom: 100 },
  prodRow: { gap: 12, marginBottom: 12 },
  bgBanner: { backgroundColor: COLORS.navy, flexDirection: 'row', padding: 8, justifyContent: 'center', alignItems: 'center', gap: 8 },
  bgBannerText: { color: COLORS.white, fontSize: 12 },
  
  // Compare Toolbar
  compareToolbar: { position: 'absolute', left: 20, right: 20, backgroundColor: COLORS.white, padding: 15, borderRadius: 12, elevation: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.border },
  compareToolbarText: { fontWeight: 'bold', color: COLORS.navy },
  compareClearBtn: { padding: 10, backgroundColor: COLORS.bg, borderRadius: 8 },
  compareRunBtn: { padding: 10, borderRadius: 8 }
});
