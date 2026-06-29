import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, PanResponder, useWindowDimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import SvgIcon from './SvgIcon';
import { COLORS, FONTS } from '../theme';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generarHtmlFicha, fetchImageBase64, generateAndSharePdf } from '../utils/pdfService';

const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';

export default function ProductDetailModal({
  visible,
  modalProd,
  onClose,
  onCompare,
  allProducts,
  logoRefreshKey,
  pdfCache,
  trackAnalytics,
  aiData,
  loadingAi,
  activeSliderList,
  onOpenProduct
}) {
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useCustomAlert();
  const [activeTab, setActiveTab] = useState('FICHA'); // FICHA | ASISTENTE | SIMILARES
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [htmlForImage, setHtmlForImage] = useState(null);
  const hiddenWebViewRef = useRef(null);

  // Reset tab when modalProd changes
  useEffect(() => {
    if (visible && modalProd) {
      setActiveTab('FICHA');
    }
  }, [modalProd?.modelo, visible]);

  const currentIndex = modalProd && activeSliderList ? activeSliderList.findIndex(p => p.modelo === modalProd.modelo) : -1;
  const prevProd = currentIndex > 0 ? activeSliderList[currentIndex - 1] : null;
  const nextProd = currentIndex !== -1 && currentIndex < (activeSliderList?.length || 0) - 1 ? activeSliderList[currentIndex + 1] : null;

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dx > 50 && prevProd) {
        onOpenProduct(prevProd);
      } else if (gestureState.dx < -50 && nextProd) {
        onOpenProduct(nextProd);
      }
    }
  }), [prevProd, nextProd, onOpenProduct]);

  const extractPower = (specs) => {
    if (!specs) return null;
    for (const [k, v] of specs) {
      const kl = String(k).toLowerCase();
      const vl = String(v).toLowerCase();
      
      let match = vl.match(/([\d.,]+)\s*(hp|kva|kw|w)\b/i);
      let unit = match ? match[2].toLowerCase() : null;
      let numStr = match ? match[1] : null;

      if (!match) {
        const numMatch = vl.match(/^([\d.,]+)$/);
        if (numMatch) {
          if (kl.includes('hp')) { unit = 'hp'; numStr = numMatch[1]; }
          else if (kl.includes('kva')) { unit = 'kva'; numStr = numMatch[1]; }
          else if (kl.includes('kw')) { unit = 'kw'; numStr = numMatch[1]; }
          else if (kl.includes('potencia')) { unit = 'hp'; numStr = numMatch[1]; }
        }
      }

      if (unit && numStr) {
        let val = parseFloat(numStr.replace(',', '.'));
        if (unit === 'kw') val = val * 1.34102;
        else if (unit === 'w') val = (val / 1000) * 1.34102;
        return val;
      }
    }
    return null;
  };

  // Similares logic
  const productosSimilares = useMemo(() => {
    if (!modalProd || !allProducts) return [];
    const baseList = allProducts.filter(p => p.subcategoria === modalProd.subcategoria && p.modelo !== modalProd.modelo);
    
    const targetPower = extractPower(modalProd.specs);
    if (targetPower !== null) {
      return baseList.map(p => {
        const pPower = extractPower(p.specs);
        return { ...p, pPower };
      }).filter(p => {
        if (p.pPower === null) return false; // Excluir si no se puede determinar la potencia
        // Rango estricto: entre el 50% y el 150% de la potencia original
        return p.pPower >= targetPower * 0.5 && p.pPower <= targetPower * 1.5;
      }).map(p => {
        const diff = Math.abs(p.pPower - targetPower);
        return { ...p, diff };
      }).sort((a, b) => a.diff - b.diff).slice(0, 8);
    }
    return baseList.slice(0, 8);
  }, [modalProd, allProducts]);

  const productosMismaMarca = useMemo(() => {
    if (!modalProd || !allProducts) return [];
    return allProducts
      .filter(p => p.marca === modalProd.marca && p.modelo !== modalProd.modelo)
      .slice(0, 20);
  }, [modalProd, allProducts]);

  const compartirPdf = async () => {
    try {
      setGenerandoPdf(true);
      await generateAndSharePdf(modalProd, pdfCache, logoRefreshKey);
      if (trackAnalytics) trackAnalytics(modalProd, 'share_pdf');
    } catch (e) {
      console.log('Error generando PDF:', e);
      showAlert('Error', 'No se pudo generar el PDF corporativo.');
    } finally {
      setGenerandoPdf(false);
    }
  };

  const compartirImagen = async () => {
    try {
      setCompartiendo(true);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showAlert('Error', 'Compartir no está disponible en este dispositivo');
        setCompartiendo(false);
        return;
      }
      
      const specs = modalProd?.specs || [];
      let finalProdB64 = pdfCache?.prodBase64;
      let finalLogoB64 = pdfCache?.logoBase64;
      
      if (!finalProdB64) {
        const marcaSlug = modalProd?.marca?.toUpperCase().replace(/\s+/g, '_') || '';
        const logoUrl = `${LOGO_BASE}${marcaSlug}.jpg?v=${logoRefreshKey}`;
        
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        finalProdB64 = await Promise.race([fetchImageBase64(modalProd?.imagen), timeoutPromise]).catch(() => '');
        finalLogoB64 = await Promise.race([fetchImageBase64(logoUrl), timeoutPromise]).catch(() => '');
      }
      
      const htmlContent = generarHtmlFicha(specs, finalProdB64, finalLogoB64, modalProd);
      setHtmlForImage(htmlContent); // Esto desencadena el renderizado del WebView
    } catch (e) {
      console.log('Error preparando HTML para imagen:', e);
      showAlert('Error', 'No se pudo preparar la ficha. Intentá de nuevo.');
      setCompartiendo(false);
    }
  };

  const capturarHtmlOculto = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // tiempo para renderizar WebView
      const imgUri = await captureRef(hiddenWebViewRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile'
      });
      await Sharing.shareAsync(imgUri, {
        dialogTitle: `Ficha ${modalProd?.modelo}`,
        mimeType: 'image/png',
      });
      if (trackAnalytics) trackAnalytics(modalProd, 'share_image');
    } catch (e) {
      console.log('Error capturando WebView:', e);
      showAlert('Error', 'Fallo al capturar la imagen en alta calidad.');
    } finally {
      setCompartiendo(false);
      setHtmlForImage(null);
    }
  };

  const parseBoldText = (text) => {
    if (!text) return null;
    return text.replace(/\*\*/g, '').replace(/\*/g, '');
  };

  if (!modalProd) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        
        {prevProd && (
          <TouchableOpacity onPress={() => onOpenProduct(prevProd)} style={styles.navBtnLeft}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
        )}
        
        {nextProd && (
          <TouchableOpacity onPress={() => onOpenProduct(nextProd)} style={styles.navBtnRight}>
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.modalDialog, { paddingBottom: insets.bottom || 15 }]} {...panResponder.panHandlers}>
          <View style={styles.modalHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={[styles.modalTitle, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{modalProd?.modelo}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 15, padding: 5 }}>
              <Text style={styles.modalClose}>✕ Cerrar</Text>
            </TouchableOpacity>
          </View>

          {/* TABS */}
          <View style={styles.tabsWrap}>
            <TouchableOpacity onPress={() => setActiveTab('FICHA')} style={[styles.tabBtn, activeTab === 'FICHA' && styles.tabBtnActive]}>
              <View style={styles.tabContentRow}>
                <SvgIcon name="doc4" size={16} color={activeTab === 'FICHA' ? COLORS.navy : COLORS.gray4} />
                <Text style={[styles.tabText, activeTab === 'FICHA' && styles.tabTextActive]}>Ficha</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab('ASISTENTE')} style={[styles.tabBtn, activeTab === 'ASISTENTE' && styles.tabBtnActive]}>
              <View style={styles.tabContentRow}>
                <SvgIcon name="agenteIA" size={16} color={activeTab === 'ASISTENTE' ? COLORS.navy : COLORS.gray4} />
                <Text style={[styles.tabText, activeTab === 'ASISTENTE' && styles.tabTextActive]}>Asistente</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab('SIMILARES')} style={[styles.tabBtn, activeTab === 'SIMILARES' && styles.tabBtnActive]}>
              <View style={styles.tabContentRow}>
                <SvgIcon name="actualizar" size={16} color={activeTab === 'SIMILARES' ? COLORS.navy : COLORS.gray4} />
                <Text style={[styles.tabText, activeTab === 'SIMILARES' && styles.tabTextActive]}>Similares</Text>
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            
            {/* TAB: FICHA */}
            {activeTab === 'FICHA' && (
              <View>
                <View style={styles.fichaCard}>
                  {/* HEADER MÓVIL */}
                  <View style={styles.fichaHeaderMobile}>
                    <View style={styles.logoContainer}>
                      <Image source={{ uri: `${LOGO_BASE}${(modalProd?.marca||'').toUpperCase().replace(/\s+/g,'_')}.jpg?v=${logoRefreshKey}` }} style={{ width: 120, height: 40 }} resizeMode="contain" />
                    </View>
                    <View style={styles.headerSeparator} />
                    <Text style={styles.headerTitleText}>FICHA TÉCNICA</Text>
                  </View>
                  <View style={styles.greenLineFull} />

                  {/* MIDDLE ROW MÓVIL */}
                  <View style={styles.productBox}>
                    <View style={styles.productImgContainer}>
                      <Image source={{ uri: modalProd?.imagen }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </View>
                    <View style={styles.productInfoContainer}>
                      <View style={styles.productInfoGreenBar} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.infoMarca}>{modalProd?.marca}</Text>
                        <Text style={styles.infoModelo}>{modalProd?.modelo}</Text>
                        <Text style={styles.infoSubcat}>{modalProd?.subcategoria}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Botón Comparar */}
                  {(() => {
                    const similares = productosSimilares.slice(0, 3);
                    if (similares.length > 0) {
                      return (
                        <TouchableOpacity
                          style={styles.compareBtn}
                          onPress={() => onCompare([modalProd, ...similares])}
                        >
                          <SvgIcon name="actualizar" size={16} color={COLORS.white} />
                          <Text style={styles.compareBtnText}>Comparar con similares</Text>
                        </TouchableOpacity>
                      );
                    }
                    return null;
                  })()}

                  {/* Specs Table */}
                  {modalProd?.specs?.length > 0 && (
                    <View style={styles.specsWrap}>
                      <View style={styles.specsHead}>
                        <Text style={styles.specsHeadText}>Especificaciones técnicas</Text>
                      </View>
                      {modalProd.specs.map(([n, v], i) => (
                        <View key={i} style={[styles.specRow, i % 2 === 1 && styles.specRowAlt]}>
                          <Text style={styles.specName}>{n}</Text>
                          <Text style={styles.specVal}>{v}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Botones de acción */}
                <View style={styles.modalActionsWrap}>
                  <TouchableOpacity
                    style={[styles.actionBtn, generandoPdf && styles.actionBtnDisabled]}
                    onPress={compartirPdf}
                    disabled={generandoPdf || compartiendo}
                    activeOpacity={0.8}
                  >
                    {generandoPdf ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <View style={styles.actionBtnContent}>
                        <SvgIcon name="descarga" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Compartir PDF</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.green }, compartiendo && styles.actionBtnDisabled]}
                    onPress={compartirImagen}
                    disabled={compartiendo || generandoPdf}
                    activeOpacity={0.8}
                  >
                    {compartiendo ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <View style={styles.actionBtnContent}>
                        <SvgIcon name="share" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Compartir Imagen</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* TAB: ASISTENTE IA */}
            {activeTab === 'ASISTENTE' && (
              <View style={styles.tabContent}>
                <View style={styles.aiHeader}>
                  <Text style={styles.aiTitle}>Asistente IA</Text>
                </View>
                {loadingAi ? (
                  <ActivityIndicator size="large" color={COLORS.navy} style={{ marginTop: 20 }} />
                ) : (
                  <Text style={styles.aiBodyText}>
                    {aiData ? parseBoldText(aiData) : 'Texto inteligente en preparación para este producto.'}
                  </Text>
                )}
                {aiData && aiData !== 'Texto inteligente en preparación para este producto.' && (
                  <TouchableOpacity 
                    style={styles.copyBtn}
                    onPress={async () => {
                      await Clipboard.setStringAsync(aiData);
                      showToast('El texto ha sido copiado al portapapeles.');
                    }}
                  >
                    <View style={styles.actionBtnContent}>
                      <SvgIcon name="share" size={16} color={COLORS.navy} />
                      <Text style={styles.copyBtnText}>Copiar Texto</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* TAB: SIMILARES */}
            {activeTab === 'SIMILARES' && (
              <View style={styles.tabContent}>
                {productosMismaMarca.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.simSectionTitle}>Más de {modalProd?.marca}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                      {productosMismaMarca.map((sim) => (
                        <TouchableOpacity
                          key={sim.modelo}
                          style={styles.simSlideCard}
                          onPress={() => onOpenProduct(sim)}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: sim.imagen }} style={styles.simSlideImg} resizeMode="contain" />
                          <Text style={styles.simSlideMarca}>{sim.subcategoria}</Text>
                          <Text style={styles.simSlideModelo} numberOfLines={2}>{sim.modelo}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                
                {productosSimilares.length > 0 && (
                  <View>
                    <Text style={styles.simSectionTitle}>Misma categoría</Text>
                    {productosSimilares.map((sim) => (
                      <TouchableOpacity key={sim.modelo} style={styles.simCard} onPress={() => onOpenProduct(sim)}>
                        <Image source={{ uri: sim.imagen }} style={styles.simImg} resizeMode="contain" />
                        <View style={styles.simInfo}>
                          <Text style={styles.simMarca}>{sim.marca}</Text>
                          <Text style={styles.simModelo} numberOfLines={2}>{sim.modelo}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                
                {productosSimilares.length === 0 && productosMismaMarca.length === 0 && (
                  <Text style={styles.aiBodyText}>No hay productos relacionados.</Text>
                )}
              </View>
            )}
            
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {/* WEBVIEW OCULTO PARA EXPORTAR PNG A4 */}
        {htmlForImage && (
          <View style={styles.hiddenWebviewWrap} pointerEvents="none" collapsable={false} ref={hiddenWebViewRef}>
            <WebView 
              source={{ html: htmlForImage }} 
              style={{ width: 794, height: 1123 }}
              onLoadEnd={capturarHtmlOculto}
              scalesPageToFit={false}
              javaScriptEnabled={true}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7,28,80,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  modalDialog: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700',
    color: COLORS.navy, flex: 1, letterSpacing: 0.5,
  },
  modalClose: { fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.navy },
  navBtnLeft: { position: 'absolute', left: 5, top: '50%', zIndex: 999, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30 },
  navBtnRight: { position: 'absolute', right: 5, top: '50%', zIndex: 999, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30 },
  navBtnText: { fontSize: 40, color: COLORS.white, fontWeight: 'bold' },
  
  // Tabs
  tabsWrap: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#edf1f5', marginBottom: 0 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: COLORS.navy },
  tabContentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4 },
  tabTextActive: { color: COLORS.navy, fontWeight: '700' },
  
  modalBody: { padding: 18 },
  
  // Ficha
  fichaCard: { backgroundColor: COLORS.white, padding: 15, borderRadius: 8 },
  fichaHeaderMobile: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 10 },
  logoContainer: { width: 140, justifyContent: 'center', alignItems: 'center' },
  headerSeparator: { width: 1, height: 30, backgroundColor: '#a0a0a0', marginHorizontal: 10 },
  headerTitleText: { fontFamily: FONTS.heading, fontSize: 16, color: '#0a2566', letterSpacing: 1 },
  greenLineFull: { height: 2, backgroundColor: '#0d8a39', width: '100%', marginBottom: 16 },
  productBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#a0a0a0', borderRadius: 12, padding: 15, marginBottom: 16 },
  productImgContainer: { flex: 1.5, height: 180, paddingRight: 10 },
  productInfoContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  productInfoGreenBar: { width: 4, height: 60, backgroundColor: '#0d8a39', marginRight: 10 },
  infoMarca: { fontFamily: FONTS.body, fontSize: 11, fontWeight: 'bold', color: '#0d8a39', textTransform: 'uppercase' },
  infoModelo: { fontFamily: FONTS.heading, fontSize: 18, color: '#0a2566', marginVertical: 4 },
  infoSubcat: { fontFamily: FONTS.body, fontSize: 11, fontWeight: 'bold', color: '#8a939c', textTransform: 'uppercase' },
  
  compareBtn: { backgroundColor: COLORS.navy, padding: 12, borderRadius: 8, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  compareBtnText: { color: COLORS.white, fontWeight: 'bold' },
  
  // Specs
  specsWrap: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  specsHead: { backgroundColor: COLORS.navy, padding: 10 },
  specsHeadText: { fontFamily: FONTS.bodySemi, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.white },
  specRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#edf1f5' },
  specRowAlt: { backgroundColor: '#fafbfc' },
  specName: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, fontWeight: '700', width: '45%', textTransform: 'uppercase', letterSpacing: 0.3, paddingRight: 10 },
  specVal: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray1, flex: 1, flexWrap: 'wrap' },
  
  // Actions
  modalActionsWrap: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 30 },
  actionBtn: { backgroundColor: COLORS.navy, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44, borderRadius: 6 },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.white, fontWeight: '700' },
  
  // Asistente IA
  tabContent: { padding: 16 },
  aiHeader: { marginBottom: 12 },
  aiTitle: { fontFamily: FONTS.bodySemi, fontSize: 16, fontWeight: '700', color: COLORS.navy },
  aiBodyText: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, lineHeight: 22 },
  copyBtn: { backgroundColor: '#E8F5E9', paddingVertical: 12, alignItems: 'center', borderRadius: 8, marginTop: 16, borderWidth: 1, borderColor: COLORS.green },
  copyBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy, fontWeight: '700' },
  
  // Similares
  simSectionTitle: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  simSlideCard: { width: 140, marginRight: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, backgroundColor: COLORS.white },
  simSlideImg: { width: '100%', height: 90, marginBottom: 8 },
  simSlideMarca: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.gray4, fontWeight: '700', textTransform: 'uppercase' },
  simSlideModelo: { fontFamily: FONTS.heading, fontSize: 13, color: COLORS.navy, marginTop: 2, lineHeight: 16 },
  simCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#edf1f5' },
  simImg: { width: 60, height: 60, borderRadius: 6, marginRight: 12, backgroundColor: '#f7f8fa' },
  simInfo: { flex: 1 },
  simMarca: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, fontWeight: '700', textTransform: 'uppercase' },
  simModelo: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, marginTop: 2 },
  
  // Hidden WebView
  hiddenWebviewWrap: { position: 'absolute', top: -10000, left: -10000, width: 794, height: 1123, zIndex: -10, opacity: 0 }
});
