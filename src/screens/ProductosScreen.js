import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, useWindowDimensions, Modal, ScrollView,
  RefreshControl, Platform, Image, PanResponder
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { WebView } from 'react-native-webview';

import { useProducts } from '../hooks/useProducts';
import { generateAndSharePdf } from '../utils/pdfService';
import ProductCard from '../components/ProductCard';
import FilterHeader from '../components/FilterHeader';
import SvgIcon from '../components/SvgIcon';
import { COLORS, FONTS } from '../theme';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';

function isAccessorySubcat(subcat) {
  if (!subcat) return false;
  const s = subcat.toLowerCase();
  return s.includes('accesorios') || s.includes('repuestos') || s.includes('pieza') || s.includes('kit');
}

export default function ProductosScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useCustomAlert();
  
  // Custom Hook: The Brain
  const {
    allProducts,
    marcas,
    cargando,
    refreshing,
    bgActualiz,
    error,
    logoRefreshKey,
    cargarDatos,
    onRefresh
  } = useProducts();

  // Local UI State
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroSubcategoria, setFiltroSubcategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  
  const [modalProd, setModalProd] = useState(null);
  const [activeTab, setActiveTab] = useState('FICHA');
  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // Compare State
  const [isComparing, setIsComparing] = useState(false);
  const [compareItems, setCompareItems] = useState([]);
  const [showCompareGrid, setShowCompareGrid] = useState(false);
  const [showReplaceSelector, setShowReplaceSelector] = useState(false);
  const [itemToReplaceIndex, setItemToReplaceIndex] = useState(null);

  const { width } = useWindowDimensions();
  const numCols = width >= 600 ? 3 : 2;
  const cardW = (width - 32 - (numCols - 1) * 12) / numCols;

  // Filtrado
  const productosFiltrados = useMemo(() => {
    let lista = filtroMarca ? allProducts.filter(p => p.marca === filtroMarca) : allProducts;
    if (filtroSubcategoria) {
      lista = lista.filter(p => {
        if (filtroSubcategoria === '__productos__') return !isAccessorySubcat(p.subcategoria);
        if (filtroSubcategoria === '__acc__') return isAccessorySubcat(p.subcategoria);
        return p.subcategoria === filtroSubcategoria;
      });
    }
    const q = busqueda.toLowerCase().trim();
    if (q) {
      lista = lista.filter(p =>
        p.modelo.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        p.subcategoria.toLowerCase().includes(q) ||
        p.specs.some(([n, v]) => n.toLowerCase().includes(q) || v.toLowerCase().includes(q))
      );
    }
    return lista;
  }, [allProducts, filtroMarca, filtroSubcategoria, busqueda]);

  const activeSliderList = productosFiltrados;
  const currentIndex = modalProd ? activeSliderList.findIndex(p => p.modelo === modalProd.modelo) : -1;
  const prevProd = currentIndex > 0 ? activeSliderList[currentIndex - 1] : null;
  const nextProd = currentIndex !== -1 && currentIndex < activeSliderList.length - 1 ? activeSliderList[currentIndex + 1] : null;

  const productosSimilares = useMemo(() => {
    if (!modalProd) return [];
    return allProducts.filter(p => p.subcategoria === modalProd.subcategoria && p.modelo !== modalProd.modelo).slice(0, 8);
  }, [modalProd, allProducts]);

  const productosMismaMarca = useMemo(() => {
    if (!modalProd) return [];
    return allProducts.filter(p => p.marca === modalProd.marca && p.modelo !== modalProd.modelo).slice(0, 20);
  }, [modalProd, allProducts]);

  // Funciones de Modal y PDF
  function handleOpenModal(prod) {
    setActiveTab('FICHA');
    setAiData(null);
    setModalProd(prod);
    if (activeTab === 'ASISTENTE') fetchAiData(prod.modelo);
  }

  function cerrarModal() {
    setModalProd(null);
  }

  async function fetchAiData(sku) {
    if (!sku) return;
    setLoadingAi(true);
    try {
      const { data } = await supabase.from('productos_ai_data').select('sales_pitch').eq('sku', sku).single();
      if (data?.sales_pitch) setAiData(data.sales_pitch);
      else setAiData('Texto inteligente en preparación.');
    } catch (e) {
      setAiData('Texto inteligente en preparación.');
    } finally {
      setLoadingAi(false);
    }
  }

  async function handleCompartirPdf() {
    try {
      setGenerandoPdf(true);
      await generateAndSharePdf(modalProd, { prodBase64: '', logoBase64: '' }, logoRefreshKey);
    } catch(e) {
      showAlert('Error', 'No se pudo generar el PDF.');
    } finally {
      setGenerandoPdf(false);
    }
  }

  // Renders de listas
  const renderMarcaBtn = useCallback(({ item: marca }) => {
    const logoUri = \`\${LOGO_BASE}\${marca.replace(/\\s+/g, '_')}.jpg?v=\${logoRefreshKey}\`;
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
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryBtn} onPress={() => cargarDatos(true)}><Text style={styles.retryText}>Reintentar</Text></TouchableOpacity></View>
      ) : !mostrarLista ? (
        <FlatList
          data={marcas}
          renderItem={renderMarcaBtn}
          keyExtractor={m => m}
          numColumns={3}
          contentContainerStyle={styles.marcasGrid}
          columnWrapperStyle={styles.marcasRow}
          ListHeaderComponent={<Text style={styles.welcomeText}>Seleccioná una marca para ver los productos disponibles.</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.navy]} />}
        />
      ) : (
        <>
          {bgActualiz && <View style={styles.bgBanner}><ActivityIndicator size="small" color={COLORS.white} /><Text style={styles.bgBannerText}>Actualizando catálogo…</Text></View>}
          <FlatList
            data={productosFiltrados}
            renderItem={({ item }) => (
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
              />
            )}
            keyExtractor={item => item.modelo}
            numColumns={numCols}
            key={numCols}
            contentContainerStyle={styles.prodGrid}
            columnWrapperStyle={styles.prodRow}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.navy]} />}
          />
        </>
      )}

      {/* MODAL DEL PRODUCTO */}
      <Modal visible={!!modalProd} animationType="slide" transparent onRequestClose={cerrarModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalDialog, { paddingBottom: insets.bottom || 15 }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle} numberOfLines={1}>{modalProd?.modelo}</Text>
              <TouchableOpacity onPress={cerrarModal} style={{ padding: 5 }}><Text style={styles.modalClose}>✕ Cerrar</Text></TouchableOpacity>
            </View>
            
            <View style={styles.tabsWrap}>
              <TouchableOpacity onPress={() => setActiveTab('FICHA')} style={[styles.tabBtn, activeTab === 'FICHA' && styles.tabBtnActive]}><Text style={activeTab === 'FICHA' ? styles.tabTextActive : styles.tabText}>Ficha</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setActiveTab('ASISTENTE'); fetchAiData(modalProd?.modelo); }} style={[styles.tabBtn, activeTab === 'ASISTENTE' && styles.tabBtnActive]}><Text style={activeTab === 'ASISTENTE' ? styles.tabTextActive : styles.tabText}>Asistente IA</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveTab('SIMILARES')} style={[styles.tabBtn, activeTab === 'SIMILARES' && styles.tabBtnActive]}><Text style={activeTab === 'SIMILARES' ? styles.tabTextActive : styles.tabText}>Similares</Text></TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {activeTab === 'FICHA' && (
                <View style={{ padding: 15 }}>
                  <Image source={{ uri: modalProd?.imagen }} style={{ width: '100%', height: 200 }} resizeMode="contain" />
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: COLORS.navy, marginVertical: 10 }}>{modalProd?.modelo}</Text>
                  {modalProd?.specs?.map(([n, v], i) => (
                    <View key={i} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
                      <Text style={{ width: '40%', fontWeight: 'bold', fontSize: 12 }}>{n}</Text>
                      <Text style={{ flex: 1, fontSize: 12 }}>{v}</Text>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.fichaBtn} onPress={handleCompartirPdf} disabled={generandoPdf}>
                    {generandoPdf ? <ActivityIndicator color="#fff"/> : <Text style={styles.fichaBtnText}>Generar PDF</Text>}
                  </TouchableOpacity>
                </View>
              )}
              {activeTab === 'ASISTENTE' && (
                <View style={{ padding: 15 }}>
                  {loadingAi ? <ActivityIndicator size="large" color={COLORS.navy}/> : <Text>{aiData}</Text>}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { marginTop: 10, color: COLORS.gray4, fontFamily: FONTS.body },
  errorText: { color: COLORS.red, textAlign: 'center', marginBottom: 15 },
  retryBtn: { padding: 10, backgroundColor: COLORS.navy, borderRadius: 8 },
  retryText: { color: COLORS.white },
  marcasGrid: { padding: 12 },
  marcasRow: { gap: 10, marginBottom: 10 },
  welcomeText: { textAlign: 'center', marginVertical: 20, color: COLORS.gray4 },
  marcaBtn: { flex: 1, height: 80, backgroundColor: COLORS.white, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  marcaBtnActive: { borderColor: COLORS.navy, borderWidth: 2 },
  marcaLogo: { width: '100%', height: '100%' },
  marcaOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,37,102,0.1)' },
  prodGrid: { padding: 16 },
  prodRow: { gap: 12, marginBottom: 12 },
  bgBanner: { backgroundColor: COLORS.navy, flexDirection: 'row', padding: 8, justifyContent: 'center', alignItems: 'center', gap: 8 },
  bgBannerText: { color: COLORS.white, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalDialog: { backgroundColor: COLORS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '90%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: COLORS.navy },
  modalClose: { color: COLORS.gray4 },
  tabsWrap: { flexDirection: 'row', backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.border },
  tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: COLORS.navy },
  tabText: { color: COLORS.gray4 },
  tabTextActive: { color: COLORS.navy, fontWeight: 'bold' },
  modalBody: { flex: 1 },
  fichaBtn: { backgroundColor: COLORS.navy, padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  fichaBtnText: { color: COLORS.white, fontWeight: 'bold' }
});
