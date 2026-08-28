import * as Sentry from '@sentry/react-native';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, useWindowDimensions,
  Platform, Share
} from 'react-native';
import Reanimated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, withSpring } from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import SvgIcon from './SvgIcon';
import Svg, { Path, Line, Text as SvgText, G } from 'react-native-svg';
import { COLORS, FONTS } from '../theme';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generarHtmlFicha, fetchImageBase64, generateAndSharePdf } from '../utils/pdfService';
import { searchProducts } from '../utils/database';
import { findSimilarProducts } from '../utils/productLogic';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { ParsedProduct } from '../types';
import { APP_CONSTANTS } from '../config/constants';
import ImageViewerModal from './ImageViewerModal';

const LOGO_BASE = APP_CONSTANTS.LOGO_BASE_BRANDS_2025;

interface ProductDetailModalProps {
  visible: boolean;
  onClose: () => void;
  modalProd: ParsedProduct | null;
  onNavigateToCatalogs: (catalogo?: string) => void;
  onCompare: (prods: ParsedProduct[]) => void;
  isLandscape: boolean;
  pdfCache: Record<string, string>;
  setPdfCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onDeletePdf: (modelo: string) => void;
  theme: any;
  activeSliderList: ParsedProduct[];
  onOpenProduct: (prod: ParsedProduct) => void;
  logoRefreshKey: string;
  trackAnalytics: (action: string) => void;
  aiData: string | null;
  loadingAi: boolean;
}

export default function ProductDetailModal({
  visible,
  modalProd,
  onClose,
  onCompare,
  logoRefreshKey,
  pdfCache,
  trackAnalytics,
  aiData,
  loadingAi,
  activeSliderList,
  onOpenProduct
}: ProductDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { showAlert, showToast } = useCustomAlert();
  const [activeTab, setActiveTab] = useState('FICHA');
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  
  // Carrusel State
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [imgWidth, setImgWidth] = useState<number>(0);

  const rawProductImages = [
    ...(modalProd?.imagen ? [modalProd.imagen] : []),
    ...(modalProd?.imagenes || [])
  ];

  const cleanUrls: string[] = [];
  for (const url of rawProductImages) {
    if (!url || typeof url !== 'string') continue;
    let clean = url.trim();
    if (clean.startsWith('[') && clean.endsWith(']')) {
      try {
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          cleanUrls.push(...parsed);
          continue;
        }
      } catch (e) {}
    }
    clean = clean.replace(/^["']|["']$/g, '');

    if (clean.includes(',') && !clean.includes('?')) {
      const segments = clean.split(',');
      const merged: string[] = [];
      for (const seg of segments) {
        const tSeg = seg.trim().replace(/^["']|["']$/g, '');
        const lowerSeg = tSeg.toLowerCase();
        if (lowerSeg.startsWith('http') || lowerSeg.startsWith('file') || lowerSeg.startsWith('content') || lowerSeg.startsWith('data:')) {
          merged.push(tSeg);
        } else {
          if (merged.length > 0) {
            merged[merged.length - 1] += ',' + tSeg; 
          } else {
            merged.push(tSeg);
          }
        }
      }
      cleanUrls.push(...merged);
    } else {
      cleanUrls.push(clean);
    }
  }

  const productImages = Array.from(new Set(cleanUrls)).filter(url => {
    const lower = url.toLowerCase();
    return (lower.startsWith('http') || lower.startsWith('file://') || lower.startsWith('content://') || lower.startsWith('data:')) && url.length > 5;
  });

  const [productosSimilares, setProductosSimilares] = useState<ParsedProduct[]>([]);
  const [productosMismaMarca, setProductosMismaMarca] = useState<ParsedProduct[]>([]);
  const [loadingSimilares, setLoadingSimilares] = useState(true);
  const [compartiendo, setCompartiendo] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [showCurveModal, setShowCurveModal] = useState(false);

  const curveData = useMemo(() => {
    if (!modalProd) return null;
    const subcat = (modalProd.subcategoria || '').toUpperCase();
    const isPumpType = subcat.includes('BOMBA') || subcat.includes('MOTOBOMBA') || subcat.includes('CUERPO') || subcat.includes('ACHIQUE') || subcat.includes('DRENAJE');
    const isExcluded = (subcat.includes('PARA ') && !subcat.includes('PISCINA')) || subcat.includes('VACIO') || subcat.includes('REPUESTO') || subcat.includes('ACCESORIO') || subcat.includes('TABLERO') || subcat.includes('PRESURIZADOR') || subcat.includes('CONTROL');

    if (!isPumpType || isExcluded) return null;

    let maxQ = 0, maxH = 0, maxBar = 0;
    (modalProd.specs || []).forEach((s: [string, string]) => {
      const k = String(s[0]).toUpperCase();
      const v = String(s[1]).toUpperCase();
      if (k.includes('CAUDAL') || k.includes('FLUJO')) {
         const nums = v.match(/([\d]+[\.,]?[\d]*)/g);
         if (nums) {
            const maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',','.'))));
            const unitHint = v + ' ' + k;
            let valLpm = maxNum;
            if (unitHint.includes('M3/H') || unitHint.includes('M³/H') || unitHint.includes('M^3/H') || unitHint.includes('M3H')) {
               valLpm = (maxNum * 1000) / 60;
            } else if (unitHint.includes('L/H') || unitHint.includes('LT/H') || unitHint.includes('LTS/H')) {
               valLpm = maxNum / 60;
            } else if (unitHint.includes('L/S')) {
               valLpm = maxNum * 60;
            }
            if (valLpm > maxQ) maxQ = valLpm;
         }
      }
      if (k.includes('ALTURA') || k.includes('ELEVACIÓN') || k.includes('MCA')) {
         const nums = v.match(/([\d]+[\.,]?[\d]*)/g);
         if (nums) {
            const maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',','.'))));
            if (maxNum > maxH) maxH = maxNum;
         }
      } else if (k.includes('BAR') || k.includes('PRESIÓN') || k.includes('PRESION')) {
         const nums = v.match(/([\d]+[\.,]?[\d]*)/g);
         if (nums) {
            const maxNum = Math.max(...nums.map(n => parseFloat(n.replace(',','.'))));
            if (maxNum > maxBar) maxBar = maxNum;
         }
      }
    });
    if (maxH === 0 && maxBar > 0) {
      maxH = maxBar * 10.197;
    }

    if (maxQ > 0 && maxH > 0) {
      const finalQ = maxQ * 60 / 1000;

      const getTicks = (max: number) => {
         if (max <= 0) return [0, 1];
         let step = Math.pow(10, Math.floor(Math.log10(max)));
         const m = max / step;
         if (m <= 2) step *= 0.2;
         else if (m <= 5) step *= 0.5;
         const ticks = [];
         const count = Math.ceil(max / step);
         for (let idx = 0; idx <= count; idx++) {
            ticks.push(Math.round(idx * step * 100) / 100);
         }
         if (ticks[ticks.length - 1] < max) {
            ticks.push(Math.round((ticks[ticks.length - 1] + step) * 100) / 100);
         }
         return ticks;
      };

      return { 
         maxQ: finalQ, 
         maxH,
         qTicks: getTicks(finalQ),
         hTicks: getTicks(maxH)
      };
    }
    return null;
  }, [modalProd]);

  const [prevModelo, setPrevModelo] = useState(modalProd?.modelo);
  if (modalProd && modalProd.modelo !== prevModelo) {
    setPrevModelo(modalProd.modelo);
    setActiveTab('FICHA');
    setActiveImgIndex(0); // Resetea el carrusel al cambiar de producto
    setProductosSimilares([]);
    setProductosMismaMarca([]);
    setLoadingSimilares(true);
  }

  const hiddenWebViewRef = useRef<View>(null);
  const [htmlForImage, setHtmlForImage] = useState<string | null>(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);
  useEffect(() => {
    if (!visible) setContentReady(false);
  }, [visible]);
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setContentReady(true), 600);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const handleProbeLayout = (e: any) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - screenWidth) < 2) {
      setContentReady(true);
    }
  };

  async function logProductAction(action: string) {
    if (!modalProd) return;
    try {
      let email = (await supabase.auth.getUser()).data?.user?.email;
      if (!email) {
        const cached = await AsyncStorage.getItem('@user_profile_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          email = parsed.email;
        }
      }

      if (!email || email === 'anon@comagro.com.py') {
         return; 
      }

      const q = await AsyncStorage.getItem('@analytics_queue');
      const queue = q ? JSON.parse(q) : [];
      queue.push({
        modelo: modalProd.modelo,
        marca: modalProd.marca,
        sku: modalProd.modelo,
        action,
        user_email: email
      });
      await AsyncStorage.setItem('@analytics_queue', JSON.stringify(queue));
    } catch (err) {
      console.log('Error logging analytics', err);
    }
  }

  useEffect(() => {
    if (visible && modalProd) {
      logProductAction('view');
    }
  }, [modalProd?.modelo, visible]);

  const currentIndex = modalProd && activeSliderList ? activeSliderList.findIndex((p: ParsedProduct) => p.modelo === modalProd.modelo) : -1;
  const prevProd = currentIndex > 0 ? activeSliderList[currentIndex - 1] : null;
  const nextProd = currentIndex !== -1 && currentIndex < (activeSliderList?.length || 0) - 1 ? activeSliderList[currentIndex + 1] : null;

  useEffect(() => {
    async function fetchRelated() {
      if (isMounted.current) setLoadingSimilares(true);
      const { similares, mismaMarca } = await findSimilarProducts(modalProd);
      if (isMounted.current) {
        setProductosSimilares(similares);
        setProductosMismaMarca(mismaMarca);
        setLoadingSimilares(false);
      }
    }
    fetchRelated();
  }, [modalProd]);

  const triggerCompartirPdf = async (selectedImages?: string[]) => {
    if (!modalProd) return;
    try {
      setGenerandoPdf(true);
      await generateAndSharePdf(modalProd, pdfCache, logoRefreshKey, selectedImages);
      logProductAction('share_pdf');
    } catch (e: unknown) {
      Sentry.captureException(e);
      showAlert('Error', 'No se pudo generar el PDF corporativo.');
    } finally {
      if (isMounted.current) {
        setGenerandoPdf(false);
      }
    }
  };

  const triggerCompartirImagen = async (selectedImages?: string[]) => {
    if (!modalProd) return;
    try {
      setCompartiendo(true);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showAlert('Error', 'Compartir no está disponible en este dispositivo');
        if (isMounted.current) {
          setCompartiendo(false);
        }
        return;
      }

      const specs = modalProd?.specs || [];
      let finalProdB64s: string[] = [];
      let finalLogoB64 = pdfCache?.logoBase64;

      const urlsToFetch = selectedImages && selectedImages.length > 0 ? selectedImages : (modalProd?.imagen ? [modalProd.imagen] : []);

      const marcaSlug = (modalProd?.marca || 'marca').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const logoUrl = `${LOGO_BASE}${marcaSlug}.jpg`;

      const timeoutPromise = () => new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));

      if (!finalLogoB64) {
        finalLogoB64 = await Promise.race([fetchImageBase64(logoUrl), timeoutPromise()]).catch(() => '') as string;
      }

      finalProdB64s = await Promise.all(
        urlsToFetch.map(url => Promise.race([fetchImageBase64(url), timeoutPromise()]).catch(() => '') as Promise<string>)
      );

      const htmlContent = generarHtmlFicha(specs, finalProdB64s, finalLogoB64, modalProd);
      if (isMounted.current) setHtmlForImage(htmlContent);
    } catch (e: unknown) {
      Sentry.captureException(e);
      showAlert('Error', 'No se pudo preparar la ficha. Intentá de nuevo.');
      if (isMounted.current) setCompartiendo(false);
    }
  };

  const compartirPdf = () => {
    triggerCompartirPdf();
  };

  const compartirImagen = () => {
    triggerCompartirImagen();
  };

  const capturarHtmlOculto = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const imgUri = await captureRef(hiddenWebViewRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile'
      });

      let finalUriToShare = imgUri;
      try {
        const safeMarca = (modalProd?.marca || 'marca').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        const safeModelo = (modalProd?.modelo || 'sku').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        const newFileName = `${safeMarca}_${safeModelo}.png`;
        const newUri = `${FileSystem.cacheDirectory}${newFileName}`;

        const fileInfo = await FileSystem.getInfoAsync(newUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(newUri);
        }
        await FileSystem.copyAsync({ from: imgUri, to: newUri });
        finalUriToShare = newUri;
      } catch (renameError) {
        console.log('No se pudo renombrar, usando original:', renameError);
      }

      await Sharing.shareAsync(finalUriToShare, {
        dialogTitle: `Ficha ${modalProd?.modelo}`,
        mimeType: 'image/png',
      });
      logProductAction('share_image');
    } catch (e: any) {
      Sentry.captureException(e);
      showAlert('Error', 'Fallo al capturar la imagen en alta calidad.');
    } finally {
      if (isMounted.current) {
        setCompartiendo(false);
        setHtmlForImage(null);
      }
    }
  };

  const parseBoldText = (text: string) => {
    if (!text) return null;
    return text.replace(/\*\*/g, '').replace(/\*/g, '');
  };

  if (!modalProd) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Reanimated.View style={styles.modalOverlay} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>

        {!contentReady && (
          <View style={StyleSheet.absoluteFill} onLayout={handleProbeLayout} pointerEvents="none" />
        )}

        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', zIndex: 999 }]} pointerEvents="box-none">
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
        </View>

        {contentReady && (
        <Reanimated.View 
          style={[styles.modalDialog, { paddingBottom: insets.bottom || 15, maxHeight: screenHeight * 0.92 }]}
          entering={SlideInDown.duration(400).springify().damping(18)}
          exiting={SlideOutDown.duration(200)}
        >
          <View style={styles.modalHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={[styles.modalTitle, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{modalProd?.modelo}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 15, padding: 5 }}>
              <Text style={styles.modalClose}>✕ Cerrar</Text>
            </TouchableOpacity>
          </View>

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

          <ScrollView 
            style={[styles.modalBody, { flexShrink: 1, padding: 0, paddingHorizontal: 18 }]} 
            contentContainerStyle={{ paddingTop: 18, paddingBottom: 40 }} 
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >

            {activeTab === 'FICHA' && (
              <View>
                <View style={styles.fichaCard}>
                  <View style={styles.fichaHeaderMobile}>
                    <View style={styles.logoContainer}>
                      <Image source={{ uri: `${LOGO_BASE}${(modalProd?.marca||'').toUpperCase().replace(/\s+/g,'_')}.jpg` }} style={{ width: 130, height: 60 }} contentFit="contain" />
                    </View>
                    <View style={styles.headerSeparator} />
                    <Text style={styles.headerTitleText}>FICHA TÉCNICA</Text>
                  </View>
                  <View style={styles.greenLineFull} />

                  <View style={styles.productBox}>
                    <View 
                      style={styles.productImgContainer} 
                      onLayout={(e) => setImgWidth(e.nativeEvent.layout.width)}
                    >
                      {imgWidth > 0 && (
                        <ScrollView
                          horizontal
                          pagingEnabled
                          showsHorizontalScrollIndicator={false}
                          onMomentumScrollEnd={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.x / imgWidth);
                            setActiveImgIndex(idx);
                          }}
                        >
                          {productImages.map((uri, i) => (
                            <TouchableOpacity
                              key={i}
                              activeOpacity={0.9}
                              onPress={() => setViewerVisible(true)}
                              style={{ width: imgWidth, height: '100%' }}
                            >
                              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}

                      {productImages.length > 1 && (
                        <View style={styles.dotsContainer}>
                          {Array.from({ length: Math.min(productImages.length, 5) }).map((_, i) => {
                            const isActive = (activeImgIndex < 4 && i === activeImgIndex) || (activeImgIndex >= 4 && i === 4);
                            return (
                              <View key={i} style={[styles.dot, isActive ? styles.dotActive : styles.dotInactive]} />
                            );
                          })}
                        </View>
                      )}
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

                  {loadingSimilares ? (
                    <View style={[styles.compareBtn, { backgroundColor: '#E0E0E0', marginBottom: 16 }]}>
                      <ActivityIndicator size="small" color={COLORS.gray4} />
                      <Text style={[styles.compareBtnText, { color: COLORS.gray4 }]}>Buscando similares...</Text>
                    </View>
                  ) : productosSimilares.length > 0 ? (
                    <View style={{ marginBottom: 16 }}>
                      <TouchableOpacity
                        style={styles.compareBtn}
                        onPress={() => onCompare([modalProd, ...productosSimilares.slice(0, 3)])}
                      >
                        <SvgIcon name="actualizar" size={16} color={COLORS.white} />
                        <Text style={styles.compareBtnText}>Comparar con similares</Text>
                      </TouchableOpacity>
                      {curveData && (
                        <TouchableOpacity
                          style={[styles.compareBtn, { backgroundColor: COLORS.navy, marginTop: 10 }]}
                          onPress={() => setShowCurveModal(true)}
                        >
                          <SvgIcon name="curva" size={16} color={COLORS.white} />
                          <Text style={styles.compareBtnText}>Ver Curva de Rendimiento</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : curveData ? (
                     <TouchableOpacity
                       style={[styles.compareBtn, { backgroundColor: COLORS.navy, marginBottom: 16 }]}
                       onPress={() => setShowCurveModal(true)}
                     >
                       <SvgIcon name="curva" size={16} color={COLORS.white} />
                       <Text style={styles.compareBtnText}>Ver Curva de Rendimiento</Text>
                     </TouchableOpacity>
                  ) : null}

                  {modalProd?.specs?.length > 0 && (
                    <View style={styles.specsWrap}>
                      <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0' }}>
                        {modalProd.specs.map(([n, v]: [string, string], i: number) => (
                          <View key={i} style={[styles.specRow, i % 2 === 1 && styles.specRowAlt]}>
                            <Text style={styles.specName}>{n}</Text>
                            <Text style={styles.specVal}>{v}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

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

            {activeTab === 'SIMILARES' && (
              <View style={styles.tabContent}>
                {productosMismaMarca.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.simSectionTitle}>Más de {modalProd?.marca}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                      {productosMismaMarca.map((sim: ParsedProduct) => (
                        <TouchableOpacity
                          key={sim.modelo}
                          style={styles.simSlideCard}
                          onPress={() => onOpenProduct(sim)}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: sim.imagen }} style={styles.simSlideImg} contentFit="contain" />
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
                    {productosSimilares.map((sim: any) => (
                      <TouchableOpacity key={sim.modelo} style={styles.simCard} onPress={() => onOpenProduct(sim)}>
                        <Image source={{ uri: sim.imagen }} style={styles.simImg} contentFit="contain" />
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
        </Reanimated.View>
        )}

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

        {curveData && (
          <Modal visible={showCurveModal} transparent animationType="fade" onRequestClose={() => setShowCurveModal(false)}>
            <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center'}}>
              <View style={{width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center'}}>
                 <Text style={{fontSize: 18, fontWeight: 'bold', color: COLORS.navy, marginBottom: 20}}>Curva de Rendimiento</Text>
                 <View style={{width: 320, height: 320}}>
                    <Svg width="320" height="320">
                      {curveData.qTicks.map((t: number) => {
                         const px = 50 + (t / curveData.qTicks[curveData.qTicks.length - 1]) * 240;
                         return (
                           <G key={`x-${t}`}>
                             <Line x1={px} y1="40" x2={px} y2="280" stroke="#e4eaf4" strokeWidth="1" />
                             <SvgText x={px} y="295" fontSize="10" fill="#555" textAnchor="middle">{t}</SvgText>
                           </G>
                         );
                      })}
                      {curveData.hTicks.map((t: number) => {
                         const py = 280 - (t / curveData.hTicks[curveData.hTicks.length - 1]) * 240;
                         return (
                           <G key={`y-${t}`}>
                             <Line x1="50" y1={py} x2="290" y2={py} stroke="#e4eaf4" strokeWidth="1" />
                             <SvgText x="42" y={py + 3} fontSize="10" fill="#555" textAnchor="end">{t}</SvgText>
                           </G>
                         );
                      })}

                      <Line x1="50" y1="40" x2="50" y2="280" stroke="#555" strokeWidth="2" />
                      <Line x1="50" y1="280" x2="290" y2="280" stroke="#555" strokeWidth="2" />
                      <SvgText x="170" y="315" fontSize="12" fill="#555" textAnchor="middle" fontWeight="bold">Caudal (m³/h)</SvgText>
                      <SvgText x="15" y="160" fontSize="12" fill="#555" textAnchor="middle" transform="rotate(-90, 15, 160)" fontWeight="bold">Altura MCA (m)</SvgText>

                      <Path 
                        d={
                          [...Array(51).keys()].map(i => {
                             const q = curveData.maxQ * (i / 50);
                             const hp = curveData.maxH * (1 - Math.pow(q / curveData.maxQ, 2));
                             const maxTickQ = curveData.qTicks[curveData.qTicks.length - 1];
                             const maxTickH = curveData.hTicks[curveData.hTicks.length - 1];
                             const pad = 6;
                             const px = 50 + pad + (q / maxTickQ) * (240 - pad * 2);
                             const py = 280 - pad - (hp / maxTickH) * (240 - pad * 2);
                             return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
                          }).join(' ')
                        }
                        stroke={COLORS.green} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
                      />
                    </Svg>
                 </View>
                 <Text style={{fontSize: 10, color: '#8492a6', textAlign: 'center', marginTop: 15, paddingHorizontal: 10}}>
                   Nota: Curva de rendimiento teórica aproximada de referencia. Consulte con un asesor para datos exactos.
                 </Text>
                 <TouchableOpacity style={[styles.actionBtn, {marginTop: 20, width: '100%', backgroundColor: COLORS.navy}]} onPress={() => setShowCurveModal(false)}>
                    <Text style={{color: '#fff', fontWeight: 'bold'}}>Cerrar</Text>
                 </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </Reanimated.View>

      <ImageViewerModal 
        visible={viewerVisible} 
        images={productImages} 
        onClose={() => setViewerVisible(false)} 
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(7,28,80,0.55)', alignItems: 'center', justifyContent: 'flex-end' },
  modalDialog: { width: '100%', maxHeight: '92%', backgroundColor: COLORS.white, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy, flex: 1, letterSpacing: 0.5 },
  modalClose: { fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.navy },
  navBtnLeft: { position: 'absolute', left: 5, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30 },
  navBtnRight: { position: 'absolute', right: 5, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30 },
  navBtnText: { fontSize: 40, color: COLORS.white, fontWeight: 'bold' },

  tabsWrap: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#edf1f5', marginBottom: 0 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: COLORS.navy },
  tabContentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4 },
  tabTextActive: { color: COLORS.navy, fontWeight: '700' },

  modalBody: { padding: 18 },

  fichaCard: { backgroundColor: COLORS.white, padding: 15, borderRadius: 8 },
  fichaHeaderMobile: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 10 },
  logoContainer: { width: 140, justifyContent: 'center', alignItems: 'center' },
  headerSeparator: { width: 1, height: 30, backgroundColor: '#a0a0a0', marginHorizontal: 10 },
  headerTitleText: { fontFamily: FONTS.heading, fontSize: 16, color: '#0a2566', letterSpacing: 1 },
  greenLineFull: { height: 2, backgroundColor: '#0d8a39', width: '100%', marginBottom: 16 },
  productBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#a0a0a0', borderRadius: 12, padding: 15, marginBottom: 16 },
  productImgContainer: { flex: 1.5, height: 180, position: 'relative', paddingRight: 10 },
  productInfoContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  productInfoGreenBar: { width: 4, height: 60, backgroundColor: '#0d8a39', marginRight: 10 },
  infoMarca: { fontFamily: FONTS.body, fontSize: 11, fontWeight: 'bold', color: '#0d8a39', textTransform: 'uppercase' },
  infoModelo: { fontFamily: FONTS.heading, fontSize: 18, color: '#0a2566', marginVertical: 4 },
  infoSubcat: { fontFamily: FONTS.body, fontSize: 11, fontWeight: 'bold', color: '#8a939c', textTransform: 'uppercase' },

  compareBtn: { backgroundColor: COLORS.navy, padding: 12, borderRadius: 8, height: 44, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  compareBtnText: { color: COLORS.white, fontWeight: 'bold' },

  specsWrap: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  specsHead: { backgroundColor: COLORS.navy, padding: 10 },
  specsHeadText: { fontFamily: FONTS.bodySemi, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.white },
  specRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#edf1f5' },
  specRowAlt: { backgroundColor: '#fafbfc' },
  specName: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, fontWeight: '700', width: '45%', textTransform: 'uppercase', letterSpacing: 0.3, paddingRight: 10 },
  specVal: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray1, flex: 1, flexWrap: 'wrap' },

  modalActionsWrap: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 30 },
  actionBtn: { backgroundColor: COLORS.navy, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44, borderRadius: 6 },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.white, fontWeight: '700' },

  tabContent: { padding: 16 },
  aiHeader: { marginBottom: 12 },
  aiTitle: { fontFamily: FONTS.bodySemi, fontSize: 16, fontWeight: '700', color: COLORS.navy },
  aiBodyText: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, lineHeight: 22 },
  copyBtn: { backgroundColor: '#E8F5E9', paddingVertical: 12, alignItems: 'center', borderRadius: 8, marginTop: 16, borderWidth: 1, borderColor: COLORS.green },
  copyBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy, fontWeight: '700' },

  dotsContainer: { position: 'absolute', bottom: 0, left: 0, right: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 14, height: 4, borderRadius: 2 },
  dotActive: { backgroundColor: 'rgba(13, 138, 57, 0.9)' },
  dotInactive: { backgroundColor: 'rgba(13, 138, 57, 0.3)' },

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

  hiddenWebviewWrap: { position: 'absolute', top: -10000, left: -10000, width: 794, height: 1123, zIndex: -10, opacity: 0 }
});
