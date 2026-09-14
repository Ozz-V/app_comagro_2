import { useState, useRef, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { ParsedProduct } from '../types';
import { fetchImageBase64, generateAndSharePdf, generateFichaPdfUri, generateAndShareCurvaPdf } from '../utils/pdfService';
import { findSimilarProducts } from '../utils/productLogic';

const CAPTURE_SCALE = 2;
const CAPTURE_FORMAT = 'jpg';
const CAPTURE_QUALITY = 0.92;

export function useProductDetailLogic({
  modalProd,
  visible,
  activeSliderList,
  pdfCache,
  logoRefreshKey,
  showAlert,
  screenWidth,
  LOGO_BASE
}: any) {
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
  const [sharingCurvaPdf, setSharingCurvaPdf] = useState(false);
  const [sharingCurvaImagen, setSharingCurvaImagen] = useState(false);
  const curveCaptureRef = useRef<View>(null);
  // Ancho de la gráfica limitado al espacio real disponible dentro del modal
  // (90% de pantalla, menos el padding del card y del área capturada),
  // para que nunca se recorte horizontalmente en teléfonos angostos.
  const curveSize = Math.max(220, Math.min(300, Math.round(screenWidth * 0.9 - 64)));

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

  const hiddenPdfRef = useRef<View>(null);
  const [pdfUriForImage, setPdfUriForImage] = useState<string | null>(null);

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

      // Mismo PDF que "Compartir PDF" (misma función, mismos datos): la imagen
      // que se comparte es siempre pixel-idéntica al PDF, nunca un render aparte.
      const uri = await generateFichaPdfUri(modalProd, pdfCache, logoRefreshKey, selectedImages);
      if (isMounted.current) setPdfUriForImage(uri);
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

  const capturarPdfOculto = async () => {
    try {
      // El PDF nativo ya avisó (onLoadComplete) que la página está renderizada.
      // Solo esperamos a que React Native confirme que ese frame ya se compuso
      // en pantalla antes de capturarlo — nada de tiempos de espera adivinados.
      await new Promise(resolve => setTimeout(resolve, 1000));

      // JPEG en vez de PNG: comprime bastante más rápido (PNG es sin pérdida)
      // y a CAPTURE_QUALITY alto no se nota diferencia visual en una ficha
      // técnica. Esto es clave para que la captura no se sienta lenta en
      // equipos de gama baja.
      const imgUri = await captureRef(hiddenPdfRef, {
        format: CAPTURE_FORMAT,
        quality: CAPTURE_QUALITY,
        result: 'tmpfile'
      });

      let finalUriToShare = imgUri;
      try {
        const safeMarca = (modalProd?.marca || 'marca').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        const safeModelo = (modalProd?.modelo || 'sku').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        const newFileName = `${safeMarca}_${safeModelo}.${CAPTURE_FORMAT}`;
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
        mimeType: CAPTURE_FORMAT === 'jpg' ? 'image/jpeg' : 'image/png',
      });
      logProductAction('share_image');
    } catch (e: unknown) {
      Sentry.captureException(e);
      showAlert('Error', 'Fallo al capturar la imagen en alta calidad.');
    } finally {
      if (isMounted.current) {
        setCompartiendo(false);
        setPdfUriForImage(null);
      }
    }
  };

  // Compartir la Curva de Rendimiento es una acción explícita y opcional que
  // el usuario solo encuentra dentro del modal "Ver Curva de Rendimiento".
  // Nunca se adjunta automáticamente al compartir la ficha del producto.
  const compartirCurvaPdf = async () => {
    if (!modalProd || !curveData) return;
    try {
      setSharingCurvaPdf(true);
      let logoB64 = pdfCache?.logoBase64;
      if (!logoB64) {
        const marcaSlug = (modalProd?.marca || 'marca').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        const logoUrl = `${LOGO_BASE}${marcaSlug}.jpg`;
        logoB64 = await fetchImageBase64(logoUrl).catch(() => '');
      }
      await generateAndShareCurvaPdf(curveData, modalProd, logoB64 || '');
      logProductAction('share_curva_pdf');
    } catch (e: unknown) {
      Sentry.captureException(e);
      showAlert('Error', 'No se pudo generar el PDF de la curva.');
    } finally {
      if (isMounted.current) setSharingCurvaPdf(false);
    }
  };

  const compartirCurvaImagen = async () => {
    if (!modalProd) return;
    try {
      setSharingCurvaImagen(true);
      const imgUri = await captureRef(curveCaptureRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile'
      });

      let finalUriToShare = imgUri;
      try {
        const safeMarca = (modalProd?.marca || 'marca').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        const safeModelo = (modalProd?.modelo || 'sku').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        const newFileName = `CURVA_${safeMarca}_${safeModelo}.png`;
        const newUri = `${FileSystem.cacheDirectory}${newFileName}`;

        const fileInfo = await FileSystem.getInfoAsync(newUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(newUri);
        }
        await FileSystem.copyAsync({ from: imgUri, to: newUri });
        finalUriToShare = newUri;
      } catch {
        // Si falla el renombrado, se comparte con el nombre original
      }

      await Sharing.shareAsync(finalUriToShare, {
        dialogTitle: `Curva de Rendimiento ${modalProd?.modelo}`,
        mimeType: 'image/png',
      });
      logProductAction('share_curva_image');
    } catch (e: unknown) {
      Sentry.captureException(e);
      showAlert('Error', 'No se pudo compartir la imagen de la curva.');
    } finally {
      if (isMounted.current) setSharingCurvaImagen(false);
    }
  };


  return {
    activeTab, setActiveTab,
    generandoPdf, setGenerandoPdf,
    viewerVisible, setViewerVisible,
    activeImgIndex, setActiveImgIndex,
    imgWidth, setImgWidth,
    productImages: Array.from(new Set(cleanUrls)).filter((url: any) => {
      const lower = url.toLowerCase();
      return (lower.startsWith('http') || lower.startsWith('file://') || lower.startsWith('content://') || lower.startsWith('data:')) && url.length > 5;
    }),
    productosSimilares, productosMismaMarca, loadingSimilares,
    compartiendo, setCompartiendo, contentReady, setContentReady,
    showCurveModal, setShowCurveModal,
    sharingCurvaPdf, sharingCurvaImagen,
    curveCaptureRef, curveSize, curveData,
    prevProd, nextProd,
    hiddenPdfRef, pdfUriForImage, setPdfUriForImage,
    handleProbeLayout,
    compartirPdf, compartirImagen, capturarPdfOculto,
    compartirCurvaPdf, compartirCurvaImagen
  };
}
