import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar,
  ActivityIndicator, useWindowDimensions, Modal, ScrollView,
  RefreshControl, Platform, Alert, PanResponder
} from 'react-native';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import { supabase, EDGE_URL } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';

const LOGO      = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };
const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';

// Subcarpetas del bucket Fichas donde buscar PDFs
const CATS_FICHAS = [
  'BOMBAS DE AGUA', 'SOLDADORES', 'GENERADORES',
  'MOTORES ELECTRICOS', 'COMPRESORES',
];

// Caché AsyncStorage — igual que el HTML (4 horas)
const CACHE_KEY      = 'comagro_productos_v3';
const CACHE_TIME_KEY = 'comagro_productos_fecha_v3';
const HORAS_VIGENCIA = 4;

const COLS_EXCLUIDAS = new Set([
  // Ya se muestran en el encabezado del producto
  'SKU','imagen 1','imagen 2','imagen 3','imagen 4','imagen 5',
  'Brand','Marca','id','ID','Tipo de Producto','Categoria Magento',
  // Campos internos del sistema que no aportan al vendedor
  'url_key','visibility','status','price','Precio',
]);

function esColumnaPermitida(col) {
  return !COLS_EXCLUIDAS.has(col) && !col.startsWith('_');
}
function esValorValido(val) {
  if (val === null || val === undefined || val === '') return false;
  const s = String(val).trim().toLowerCase();
  if (s.length === 0) return false;
  // Descartar ceros y variantes (0, 0.0, 0.000, 0,000)
  if (/^0([.,]0+)?$/.test(s)) return false;
  // Descartar valores que indican ausencia de dato
  const basura = ['n/a','na','n.a','n.a.','no aplica','sin dato','sin datos',
    'no','no tiene','no disponible','pim','-','--','---','st','sin información',
    'no corresponde','sin especificar','sin info'];
  if (basura.includes(s)) return false;
  return true;
}

export default function ProductosScreen({ navigation, route }) {
  const [allProducts, setAllProducts] = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [bgActualiz, setBgActualiz]   = useState(false); // actualización silenciosa
  const [error, setError]             = useState(null);
  const [marcas, setMarcas]           = useState([]);
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroSubcategoria, setFiltroSubcategoria] = useState('');
  const [busqueda, setBusqueda]       = useState('');
  const [modalProd, setModalProd]     = useState(null);
  const [isInitializingDirect, setIsInitializingDirect] = useState(!!route.params?.openProductSku);
  // Estado de generación
  const [generandoPdf, setGenerandoPdf]   = useState(false);
  const [compartiendo, setCompartiendo]   = useState(false);

  // Comparador Inteligente
  const [isComparing, setIsComparing] = useState(false);
  const [compareItems, setCompareItems] = useState([]);
  const [showCompareGrid, setShowCompareGrid] = useState(false);
  const [itemToReplaceIndex, setItemToReplaceIndex] = useState(null);
  const [showReplaceSelector, setShowReplaceSelector] = useState(false);

  // Tabs y Asistente IA
  const [activeTab, setActiveTab] = useState('FICHA'); // FICHA | ASISTENTE | SIMILARES
  const [aiData, setAiData]       = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Productos similares (misma subcategoría, diferente modelo)
  const productosSimilares = useMemo(() => {
    if (!modalProd) return [];
    return allProducts
      .filter(p => p.subcategoria === modalProd.subcategoria && p.modelo !== modalProd.modelo)
      .slice(0, 8);
  }, [modalProd, allProducts]);

  // Productos de la misma MARCA para el slider
  const productosMismaMarca = useMemo(() => {
    if (!modalProd) return [];
    return allProducts
      .filter(p => p.marca === modalProd.marca && p.modelo !== modalProd.modelo)
      .slice(0, 20);
  }, [modalProd, allProducts]);

  // ─── ANALYTICS: registrar acciones en Supabase ──────────────────
  async function trackAnalytics(prod, action) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('producto_analytics').insert({
        user_email: user.email,
        sku: prod?.modelo || '',
        modelo: prod?.modelo || '',
        marca: prod?.marca || '',
        action: action,
      });
    } catch (e) {
      // No bloquear UX por error de analytics
    }
  }

  // Abrir otro producto desde la pestaña Similares
  function handleOpenModal(prod) {
    setActiveTab('FICHA');
    setAiData(null);
    setModalProd(prod);
    trackAnalytics(prod, 'view');
  }

  // Cargar datos de IA cuando se abre la pestaña Asistente
  useEffect(() => {
    if (activeTab === 'ASISTENTE' && modalProd?.modelo) {
      fetchAiData(modalProd.modelo);
    }
  }, [activeTab, modalProd]);

  async function fetchAiData(sku) {
    setLoadingAi(true);
    try {
      const { data, error } = await supabase
        .from('productos_ai_data')
        .select('sales_pitch')
        .eq('sku', sku)
        .single();
      
      if (data && data.sales_pitch) {
        setAiData(data.sales_pitch);
      } else {
        setAiData('Texto inteligente en preparación para este producto.');
      }
    } catch (err) {
      console.log('Error fetch AI:', err);
      setAiData('Texto inteligente en preparación para este producto.');
    } finally {
      setLoadingAi(false);
    }
  }

  const fichaRef = useRef(null);
  const openedDirectlyRef = useRef(false);

  const { width } = useWindowDimensions();
  const numCols = width >= 600 ? 3 : 2;
  const cardW = (width - 32 - (numCols - 1) * 12) / numCols;

  useEffect(() => { cargarDatos(false); }, []);

  // Abrir producto directamente si viene con openProductSku (desde recientes/config)
  useEffect(() => {
    if (allProducts.length > 0) {
      if (route?.params?.openProductSku) {
        const sku = route.params.openProductSku;
        const prod = allProducts.find(p => p.modelo === sku);
        if (prod) {
          // No reseteamos isInitializingDirect aquí: se mantiene true
          // mientras el modal está abierto, así el fondo es blanco limpio
          setTimeout(() => {
            setModalProd(prod);
            setActiveTab('FICHA');
            trackAnalytics(prod, 'view');
            openedDirectlyRef.current = true;
            navigation.setParams({ openProductSku: undefined });
          }, 100);
        } else {
          setIsInitializingDirect(false);
        }
      } else if (isInitializingDirect) {
        setIsInitializingDirect(false);
      }
    }
  }, [allProducts, route?.params?.openProductSku]);

  // ─── CARGA INTELIGENTE (SMART MERGE) ────────────────────────────────
  // Fase 1: muestra caché instantáneamente
  // Fase 2: fetch en background → merge de nuevos/modificados por SKU
  async function cargarDatos(forzar = false) {
    setError(null);

    // FASE 1 — mostrar caché al instante
    let rawCacheado = null;
    let fechaCache = null;
    try {
      rawCacheado = await AsyncStorage.getItem(CACHE_KEY);
      fechaCache  = await AsyncStorage.getItem(CACHE_TIME_KEY);
    } catch (_) {}

    if (rawCacheado) {
      procesarDatos(JSON.parse(rawCacheado));
      setCargando(false);

      // Si el caché es reciente Y no se forzó refresh, no ir a la red
      const cacheVigente =
        fechaCache &&
        (Date.now() - parseInt(fechaCache)) < HORAS_VIGENCIA * 3600000;
      if (cacheVigente && !forzar) {
        setRefreshing(false);
        return;
      }

      // Caché existe pero venció (o se forzó): actualizar en background
      setBgActualiz(true);
    }
    // Si no hay caché en absoluto, mostrar spinner normal
    else {
      setCargando(true);
    }

    // FASE 2 — fetch (Edge Function es smart: devuelve nuevos/modificados)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Pasar timestamp del último fetch para que el Edge sepa qué devolver
      if (fechaCache && !forzar) {
        headers['X-Since'] = fechaCache;
      }

      const res = await fetch(EDGE_URL, { headers });
      if (!res.ok) throw new Error(await res.text() || 'Error en conexión');
      const nuevosRows = await res.json();

      // Hacer merge con el caché existente: actualizar/agregar por SKU
      let rowsBase = [];
      if (rawCacheado) {
        try { rowsBase = JSON.parse(rawCacheado); } catch (_) {}
      }

      // Construir mapa de existentes por SKU
      const mapa = {};
      rowsBase.forEach(r => { if (r.SKU) mapa[r.SKU] = r; });

      // Fusionar los nuevos/modificados sobre el mapa
      nuevosRows.forEach(r => { if (r.SKU) mapa[r.SKU] = r; });

      const merged = Object.values(mapa);

      // Guardar merged en caché
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      } catch (_) {}

      procesarDatos(merged);
    } catch (e) {
      // Ya mostramos el caché (si existía), solo loguear el error
      if (!rawCacheado) {
        setError(e.message || 'Error desconocido');
      }
    } finally {
      setCargando(false);
      setRefreshing(false);
      setBgActualiz(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    cargarDatos(true); // forzar fetch ignorando caché
  }

  function procesarDatos(rows) {
    const productos = rows.map(row => {
      const imagen = (row['imagen 1'] || '').toString().trim();
      if (!imagen || !/^https?:\/\//i.test(imagen)) return null;
      const marca = (row['Brand'] || row['Marca'] || '').toString().trim().toUpperCase();
      if (!marca) return null;
      const subcategoria = (row['Tipo de Producto'] || row['Categoria Magento'] || 'General').toString().trim().toUpperCase();
      const specs = [];
      for (const [col, val] of Object.entries(row)) {
        if (esColumnaPermitida(col) && esValorValido(val)) specs.push([col, String(val).trim()]);
      }
      return { modelo: (row['SKU'] || '').toString().trim(), marca, subcategoria, imagen, specs };
    }).filter(p => p && p.modelo);

    setAllProducts(productos);
    setMarcas([...new Set(productos.map(p => p.marca))].sort());
  }

  // ─── GENERAR HTML CORPORATIVO (siempre vertical, imagen arriba, specs abajo) ──
  function generarHtmlFicha(specs, base64Img, logoUrl) {
    // Calcular altura de imagen según cantidad de specs para que todo entre en 1 página
    const numSpecs = specs.length;
    // Con 0-8 specs: imagen grande (280px), con 9-15: mediana (200px), con 16+: pequeña (140px)
    const imgHeight = numSpecs <= 8 ? 280 : numSpecs <= 15 ? 200 : 140;
    const specsHtml = specs.length > 0 ? `
      <table class="specs">
        <thead><tr><td colspan="2" class="specs-head">ESPECIFICACIONES TÉCNICAS</td></tr></thead>
        <tbody>
          ${specs.map((s, i) => `
            <tr${i % 2 === 1 ? ' class="alt"' : ''}>
              <td class="spec-name">${s[0]}</td>
              <td class="spec-val">${s[1]}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '';

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <style>
          @page { margin: 0; size: A4 portrait; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; color: #1A1A1A; }
          .page { width: 100%; min-height: 100vh; padding: 0; display: flex; flex-direction: column; position: relative; }
          
          /* CONTENEDOR INTERNO PARA MARGENES */
          .inner-content { padding: 0 45px; display: flex; flex-direction: column; flex: 1; }

          /* HEADER */
          .header { display: flex; align-items: center; justify-content: flex-start; margin-bottom: 15px; padding-top: 30px; padding-left: 45px; padding-right: 45px; }
          .brand-logo-container { width: 350px; display: flex; align-items: center; justify-content: center; margin-right: 20px; }
          .brand-logo { max-height: 180px; max-width: 100%; object-fit: contain; }
          .header-separator { width: 2px; height: 90px; background-color: #a0a0a0; margin: 0 30px; }
          .title-ficha { font-size: 24pt; font-weight: bold; color: #0a2566; letter-spacing: 1px; }
          .header-line { width: 100%; height: 4px; background-color: #0d8a39; margin-bottom: 20px; }
          
          /* MIDDLE BOX */
          .middle-box { display: flex; align-items: stretch; border: 2px solid #a0a0a0; border-radius: 15px; padding: 20px; margin-bottom: 30px; }
          
          /* IMAGEN - a la izquierda */
          .img-wrap { flex: 1.5; height: ${imgHeight}px; display: flex; align-items: center; justify-content: center; padding-right: 20px; }
          .prod-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
          
          /* TÍTULO PRODUCTO - a la derecha */
          .title-sec-wrapper { flex: 1; display: flex; align-items: center; }
          .green-accent { width: 4px; height: 120px; background-color: #0d8a39; margin-right: 15px; }
          .title-sec { display: flex; flex-direction: column; justify-content: center; }
          .prod-marca { font-size: 16pt; font-weight: bold; color: #0d8a39; text-transform: uppercase; margin: 0 0 4px 0; }
          .prod-modelo { font-size: clamp(14pt, 4vw, 30pt); font-weight: bold; color: #0a2566; line-height: 1.1; margin: 0 0 6px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
          .prod-subcat { font-size: 14pt; font-weight: bold; color: #8a939c; margin: 0 0 4px 0; text-transform: uppercase; }
          .prod-name { font-size: 12pt; font-weight: bold; color: #0d8a39; margin: 0; }
          
          /* TABLA SPECS */
          .specs { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 60px; }
          .specs-head { background-color: #0a2566; color: white; padding: 12px 20px; font-size: 14pt; font-weight: bold; letter-spacing: 0.5px; }
          .specs td { padding: 8px 20px; vertical-align: middle; word-wrap: break-word; overflow-wrap: break-word; }
          .specs tr:nth-child(even) { background-color: #f2f2f2; }
          .specs tr:nth-child(odd) { background-color: #ffffff; }
          .spec-name { font-size: 11pt; font-weight: bold; color: #000; width: 40%; text-transform: uppercase; }
          .spec-val { font-size: 11pt; color: #000; }
          
          /* FOOTER AZUL */
          .footer-blue { position: absolute; bottom: 0; left: 0; right: 0; height: 40px; background-color: #0a2566; }
        </style>
      </head>
      <body>
        <div class="page" style="position: relative;">
          <div class="header">
            <div class="brand-logo-container">
              <img src="${logoUrl}" class="brand-logo" onerror="this.outerHTML='<span class=title-ficha style=color:#a0a0a0;>${modalProd?.marca || ''}</span>'" />
            </div>
            <div class="header-separator"></div>
            <div class="title-ficha">FICHA TÉCNICA</div>
          </div>
          
          <div class="header-line"></div>
          
          <div class="inner-content">
            <div class="middle-box">
              <div class="img-wrap">
                <img id="prodImg" class="prod-img" src="${base64Img}" />
              </div>
              
              <div class="title-sec-wrapper">
                <div class="green-accent"></div>
                <div class="title-sec">
                  <p class="prod-marca">${modalProd?.marca || ''}</p>
                  <h1 class="prod-modelo">${modalProd?.modelo || ''}</h1>
                  <div class="prod-subcat">${(modalProd?.subcategoria || 'GENERAL').toUpperCase()}</div>
                </div>
              </div>
            </div>
            
            ${specsHtml}
          </div>
          
          <div class="footer-blue"></div>
        </div>
        
        <script>
          (function() {
            var img = new Image();
            img.onload = function() {
              var tmp = document.createElement('canvas');
              tmp.width = img.width; tmp.height = img.height;
              var ctx = tmp.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              try {
                var d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
                var w = tmp.width, h = tmp.height;
                var top = h, left = w, right = -1, bottom = -1;
                
                for (var y = 0; y < h; y++) {
                  for (var x = 0; x < w; x++) {
                    var i = (y * w + x) * 4;
                    if (d[i+3] > 10 && !(d[i] >= 245 && d[i+1] >= 245 && d[i+2] >= 245)) {
                      if (x < left) left = x;
                      if (x > right) right = x;
                      if (y < top) top = y;
                      if (y > bottom) bottom = y;
                    }
                  }
                }
                
                if (right < left || bottom < top) return; // todo blanco, dejar original
                
                var p = 8;
                left = Math.max(0, left-p); top = Math.max(0, top-p);
                right = Math.min(w-1, right+p); bottom = Math.min(h-1, bottom+p);
                
                var cw = right-left+1, ch = bottom-top+1;
                var out = document.createElement('canvas');
                out.width = cw; out.height = ch;
                out.getContext('2d').drawImage(tmp, left, top, cw, ch, 0, 0, cw, ch);
                
                // Reemplazar la imagen con la versión recortada
                document.getElementById('prodImg').src = out.toDataURL('image/png');
              } catch(e) {
                // Si falla el canvas, la imagen original queda visible
              }
            };
            img.src = '${base64Img}';
          })();
        </script>
      </body>
      </html>
    `;
  }

  // ─── Helper: obtener imagen como base64 ──────────────────────────
  async function fetchImageBase64(url) {
    if (!url) return '';
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.log('Error obteniendo base64:', err);
      return '';
    }
  }

  async function compartirPdf() {
    try {
      setGenerandoPdf(true);
      
      const marcaSlug = modalProd?.marca?.toUpperCase().replace(/\s+/g, '_') || '';
      const logoUrl = `https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/${marcaSlug}.jpg`;
      const base64Img = await fetchImageBase64(modalProd?.imagen);
      const specs = modalProd?.specs || [];
      
      const htmlContent = generarHtmlFicha(specs, base64Img, logoUrl);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      await Sharing.shareAsync(uri, {
        dialogTitle: `Ficha ${modalProd?.modelo}`,
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf'
      });
      trackAnalytics(modalProd, 'share_pdf');

    } catch (e) {
      console.log('Error generando PDF:', e);
      Alert.alert('Error', 'No se pudo generar el PDF corporativo.');
    } finally {
      setGenerandoPdf(false);
    }
  }

  // ─── COMPARTIR COMO IMAGEN — captura directa de la vista ──────────
  async function compartirImagen() {
    try {
      setCompartiendo(true);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Compartir no está disponible en este dispositivo');
        return;
      }
      if (!fichaRef.current) {
        Alert.alert('Error', 'No se encontró la ficha para capturar.');
        return;
      }
      // Capturar la vista nativa como PNG
      const imgUri = await captureRef(fichaRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(imgUri, {
        dialogTitle: `Ficha ${modalProd?.modelo}`,
        mimeType: 'image/png',
      });
      trackAnalytics(modalProd, 'share_image');
    } catch (e) {
      console.log('Error al compartir imagen:', e);
      Alert.alert('Error', 'No se pudo capturar la ficha. Intentá de nuevo.');
    } finally {
      setCompartiendo(false);
    }
  }


  // ─── FILTRADO ─────────────────────────────────────────────────────
  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroMarca) return [];
    const prodMarca = allProducts.filter(p => p.marca === filtroMarca);
    const subs = Array.from(new Set(prodMarca.map(p => p.subcategoria).filter(Boolean)));
    return subs.sort();
  }, [allProducts, filtroMarca]);

  const productosFiltrados = useMemo(() => {
    let lista = filtroMarca ? allProducts.filter(p => p.marca === filtroMarca) : allProducts;
    
    if (filtroSubcategoria) {
      lista = lista.filter(p => p.subcategoria === filtroSubcategoria);
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

  const activeSliderList = useMemo(() => {
    if (openedDirectlyRef.current && route?.params?.contextSkus) {
       return route.params.contextSkus.map(sku => allProducts.find(p => p.modelo === sku || p.sku === sku)).filter(Boolean);
    }
    return productosFiltrados;
  }, [openedDirectlyRef.current, route?.params?.contextSkus, productosFiltrados, allProducts]);
  
  const currentIndex = modalProd ? activeSliderList.findIndex(p => p.modelo === modalProd.modelo) : -1;
  const prevProd = currentIndex > 0 ? activeSliderList[currentIndex - 1] : null;
  const nextProd = currentIndex !== -1 && currentIndex < activeSliderList.length - 1 ? activeSliderList[currentIndex + 1] : null;

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Only set pan responder if the swipe is clearly horizontal
      return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dx > 50 && prevProd) {
        handleOpenModal(prevProd);
      } else if (gestureState.dx < -50 && nextProd) {
        handleOpenModal(nextProd);
      }
    }
  }), [prevProd, nextProd]);

  // ─── RENDERS ──────────────────────────────────────────────────────
  const renderMarcaBtn = useCallback(({ item: marca }) => {
    const logoUri = `${LOGO_BASE}${marca.replace(/\s+/g, '_')}.jpg`;
    const activo = filtroMarca === marca;
    return (
      <TouchableOpacity
        style={[styles.marcaBtn, activo && styles.marcaBtnActive]}
        onPress={() => setFiltroMarca(activo ? '' : marca)}
        activeOpacity={0.75}
      >
        <Image source={{ uri: logoUri }} style={styles.marcaLogo} resizeMode="contain"
          onError={() => {}} />
        {activo && <View style={styles.marcaOverlay} />}
      </TouchableOpacity>
    );
  }, [filtroMarca]);

  const renderProducto = useCallback(({ item }) => {
    const isSelected = isComparing && compareItems.some(c => c.modelo === item.modelo);
    return (
      <TouchableOpacity
        style={[styles.card, { width: cardW }, isSelected && { borderColor: COLORS.navy, borderWidth: 2 }]}
        activeOpacity={0.85}
        onPress={() => {
          if (isComparing) {
            if (isSelected) {
              setCompareItems(prev => prev.filter(c => c.modelo !== item.modelo));
            } else if (compareItems.length < 4) {
              setCompareItems(prev => [...prev, item]);
            } else {
              Alert.alert('Límite', 'Podés comparar hasta 4 productos a la vez.');
            }
          } else {
            handleOpenModal(item);
          }
        }}
      >
        <View style={[styles.cardImg, { height: cardW * 0.85 }]}>
          <Image source={{ uri: item.imagen }} style={styles.cardImgI} resizeMode="contain" />
          {isSelected && (
            <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: COLORS.navy, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>✓</Text>
            </View>
          )}
        </View>
        <View style={styles.greenBar} />
        <View style={styles.cardBody}>
          <Text style={styles.cardMarca}>{item.marca}</Text>
          <Text style={styles.cardModelo} numberOfLines={2}>{item.modelo}</Text>
          <Text style={styles.cardSubcat} numberOfLines={1}>{item.subcategoria}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [cardW, isComparing, compareItems]);

  const mostrarLista = filtroMarca || busqueda.trim();

  // ─── RENDER PRINCIPAL ─────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <View style={styles.topbarHeader}>
          <LottieView
            source={require('../../assets/iso.json')}
            autoPlay
            loop={true}
            style={styles.logoAnimado}
            resizeMode="contain"
          />
          <View style={styles.topActions}>
            <TouchableOpacity onPress={() => {
              if (filtroMarca || busqueda) { setFiltroMarca(''); setFiltroSubcategoria(''); setBusqueda(''); setIsComparing(false); setCompareItems([]); }
              else navigation.goBack();
            }}>
              <Text style={styles.btnVolver}>
                {(filtroMarca || busqueda) ? '← Volver a marcas' : '← Volver'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => supabase.auth.signOut()}>
              <Text style={styles.btnSalir}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.searchWrap, { flex: 1, marginBottom: 0 }]}>
            <SvgIcon name="buscar" size={18} color={COLORS.gray4} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar producto…"
              placeholderTextColor={COLORS.gray4}
              value={busqueda}
              onChangeText={v => { setBusqueda(v); if (v) { setFiltroMarca(''); setFiltroSubcategoria(''); setIsComparing(false); } }}
            />
            {busqueda ? (
              <TouchableOpacity onPress={() => setBusqueda('')}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {filtroSubcategoria && !isAccessorySubcat(filtroSubcategoria) ? (
            <TouchableOpacity 
              onPress={() => { setIsComparing(!isComparing); setCompareItems([]); }}
              style={{ backgroundColor: isComparing ? COLORS.navy : COLORS.bg, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border }}
            >
              <Text style={{ color: isComparing ? COLORS.white : COLORS.navy, fontWeight: 'bold' }}>{isComparing ? 'Cancelar' : 'Comparar'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {filtroMarca && subcategoriasDisponibles.length > 1 ? (() => {
          const mainSubs = subcategoriasDisponibles.filter(s => !isAccessorySubcat(s));
          const hasAccessories = subcategoriasDisponibles.some(s => isAccessorySubcat(s));
          const allBtns = [
            { key: '__todos__', label: 'Todos', isAll: true },
            ...mainSubs.map(s => ({ key: s, label: s, isAll: false })),
            ...(hasAccessories ? [{ key: '__acc__', label: 'Accesorios', isAll: false, isAcc: true }] : []),
          ];
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginBottom: 4 }}>
              {allBtns.map(btn => {
                const isActive = btn.isAll ? !filtroSubcategoria : btn.isAcc ? isAccessorySubcat(filtroSubcategoria) : filtroSubcategoria === btn.key;
                return (
                  <TouchableOpacity
                    key={btn.key}
                    onPress={() => {
                      setIsComparing(false); setCompareItems([]);
                      if (btn.isAll) { setFiltroSubcategoria(''); }
                      else if (btn.isAcc) {
                        const firstAcc = subcategoriasDisponibles.find(s => isAccessorySubcat(s));
                        setFiltroSubcategoria(firstAcc || '');
                      } else { setFiltroSubcategoria(btn.key); }
                    }}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: isActive ? COLORS.navy : '#E0E0E0', minWidth: 80, maxWidth: 130, alignItems: 'center', marginRight: 6, marginBottom: 6 }}
                  >
                    <Text numberOfLines={1} style={{ color: isActive ? COLORS.white : COLORS.navy, fontWeight: 'bold', fontSize: 12 }}>{btn.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })() : null}
      </View>
      <View style={styles.topBorder} />

      {cargando ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.navy} />
          <Text style={styles.centerText}>Cargando catálogo…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => cargarDatos(true)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : isInitializingDirect ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.navy} />
          <Text style={styles.centerText}>Abriendo producto…</Text>
        </View>
      ) : !mostrarLista ? (
        // Vista: selector de marcas (con pull-to-refresh)
        <FlatList
          data={marcas}
          renderItem={renderMarcaBtn}
          keyExtractor={m => m}
          numColumns={3}
          contentContainerStyle={styles.marcasGrid}
          columnWrapperStyle={styles.marcasRow}
          ListHeaderComponent={
            <Text style={styles.welcomeText}>Seleccioná una marca para ver los productos disponibles.</Text>
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.navy]}
              tintColor={COLORS.navy}
            />
          }
        />
      ) : (
        // Vista: grid de productos (con pull-to-refresh)
        productosFiltrados.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.centerText}>Sin resultados para esta búsqueda</Text>
          </View>
        ) : (
          <>
            {/* Indicador sutil de actualización en background */}
            {bgActualiz && (
              <View style={styles.bgBanner}>
                <ActivityIndicator size="small" color={COLORS.white} />
                <Text style={styles.bgBannerText}>Actualizando catálogo…</Text>
              </View>
            )}
          <FlatList
            data={productosFiltrados}
            renderItem={renderProducto}
            keyExtractor={item => item.modelo}
            numColumns={numCols}
            key={numCols}
            contentContainerStyle={styles.prodGrid}
            columnWrapperStyle={styles.prodRow}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.navy]}
                tintColor={COLORS.navy}
              />
            }
          />
          </>
        )
      )}

      {/* Floating Compare Toolbar */}
      {isComparing && (
        <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: COLORS.white, padding: 15, borderRadius: 12, elevation: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ fontWeight: 'bold', color: COLORS.navy }}>Seleccionados: {compareItems.length}/4</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => { setIsComparing(false); setCompareItems([]); }} style={{ padding: 10, backgroundColor: COLORS.bg, borderRadius: 8 }}>
              <Text style={{ color: COLORS.gray4 }}>Limpiar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => { if(compareItems.length > 1) setShowCompareGrid(true); else Alert.alert('Aviso', 'Seleccioná al menos 2 productos para comparar.'); }}
              style={{ padding: 10, backgroundColor: compareItems.length > 1 ? COLORS.navy : COLORS.gray4, borderRadius: 8 }}
            >
              <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Comparar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal producto */}
      <Modal
        visible={!!modalProd}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (openedDirectlyRef.current) {
            openedDirectlyRef.current = false;
            setModalProd(null);
            navigation.goBack();
          } else {
            setModalProd(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          
          {prevProd && (
            <TouchableOpacity onPress={() => handleOpenModal(prevProd)} style={{ position: 'absolute', left: 5, top: '50%', zIndex: 999, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30 }}>
              <Text style={{ fontSize: 40, color: COLORS.white, fontWeight: 'bold' }}>‹</Text>
            </TouchableOpacity>
          )}
          
          {nextProd && (
            <TouchableOpacity onPress={() => handleOpenModal(nextProd)} style={{ position: 'absolute', right: 5, top: '50%', zIndex: 999, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30 }}>
              <Text style={{ fontSize: 40, color: COLORS.white, fontWeight: 'bold' }}>›</Text>
            </TouchableOpacity>
          )}

          <View style={styles.modalDialog} {...panResponder.panHandlers}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={[styles.modalTitle, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{modalProd?.modelo}</Text>
              </View>

              <TouchableOpacity onPress={() => {
                if (openedDirectlyRef.current) {
                  openedDirectlyRef.current = false;
                  setModalProd(null);
                  navigation.goBack();
                } else {
                  setModalProd(null);
                }
              }} style={{ marginLeft: 15, padding: 5 }}>
                <Text style={styles.modalClose}>✕ Cerrar</Text>
              </TouchableOpacity>
            </View>
              {/* TABS DE NAVEGACIÓN */}
              <View style={styles.tabsWrap}>
                <TouchableOpacity onPress={() => setActiveTab('FICHA')} style={[styles.tabBtn, activeTab === 'FICHA' && styles.tabBtnActive]}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:6}}><SvgIcon name="doc4" size={16} color={activeTab==='FICHA' ? COLORS.navy : COLORS.gray4} /><Text style={[styles.tabText, activeTab === 'FICHA' && styles.tabTextActive]}>Ficha</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveTab('ASISTENTE')} style={[styles.tabBtn, activeTab === 'ASISTENTE' && styles.tabBtnActive]}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:6}}><SvgIcon name="agenteIA" size={16} color={activeTab==='ASISTENTE' ? COLORS.navy : COLORS.gray4} /><Text style={[styles.tabText, activeTab === 'ASISTENTE' && styles.tabTextActive]}>Asistente</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveTab('SIMILARES')} style={[styles.tabBtn, activeTab === 'SIMILARES' && styles.tabBtnActive]}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:6}}><SvgIcon name="actualizar" size={16} color={activeTab==='SIMILARES' ? COLORS.navy : COLORS.gray4} /><Text style={[styles.tabText, activeTab === 'SIMILARES' && styles.tabTextActive]}>Similares</Text></View>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                
                {/* PESTAÑA FICHA TÉCNICA */}
                {activeTab === 'FICHA' && (
                  <View>
                    {/* VISTA MÓVIL (Lo que ve el usuario en pantalla) */}
                    <View style={{ backgroundColor: COLORS.white, padding: 15, borderRadius: 8 }}>
                      {/* HEADER MÓVIL */}
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 10 }}>
                        <View style={{ width: 140, justifyContent: 'center', alignItems: 'center' }}>
                          <Image source={{ uri: `${LOGO_BASE}${(modalProd?.marca||'').toUpperCase().replace(/\s+/g,'_')}.jpg` }} style={{ width: 120, height: 40 }} resizeMode="contain" />
                        </View>
                        <View style={{ width: 1, height: 30, backgroundColor: '#a0a0a0', marginHorizontal: 10 }} />
                        <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: '#0a2566', letterSpacing: 1 }}>FICHA TÉCNICA</Text>
                      </View>
                      <View style={{ height: 2, backgroundColor: '#0d8a39', width: '100%', marginBottom: 16 }} />

                      {/* MIDDLE ROW MÓVIL */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#a0a0a0', borderRadius: 12, padding: 15, marginBottom: 16 }}>
                        <View style={{ flex: 1.5, height: 180, paddingRight: 10 }}>
                          <Image source={{ uri: modalProd?.imagen }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                        </View>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ width: 4, height: 60, backgroundColor: '#0d8a39', marginRight: 10 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 'bold', color: '#0d8a39', textTransform: 'uppercase' }}>{modalProd?.marca}</Text>
                            <Text style={{ fontFamily: FONTS.heading, fontSize: 18, color: '#0a2566', marginVertical: 4 }}>{modalProd?.modelo}</Text>
                            <Text style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 'bold', color: '#8a939c', textTransform: 'uppercase' }}>{modalProd?.subcategoria}</Text>
                          </View>
                        </View>
                      </View>

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

                    {/* Botones de acción (PDF e Imagen) */}
                    <View style={styles.modalActionsWrap}>
                      <TouchableOpacity
                        style={[styles.fichaBtn, generandoPdf && styles.fichaBtnDis, {flex: 1, marginBottom: 0}]}
                        onPress={compartirPdf}
                        disabled={generandoPdf || compartiendo}
                        activeOpacity={0.8}
                      >
                        {generandoPdf ? (
                          <ActivityIndicator size="small" color={COLORS.white} />
                        ) : (
                          <View style={{flexDirection:'row',alignItems:'center',gap:8}}><SvgIcon name="descarga" size={16} color="#fff" /><Text style={styles.fichaBtnText}>Compartir PDF</Text></View>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.fichaBtn, {flex: 1, marginBottom: 0, backgroundColor: COLORS.green}]}
                        onPress={compartirImagen}
                        disabled={compartiendo || generandoPdf}
                        activeOpacity={0.8}
                      >
                        {compartiendo ? (
                          <ActivityIndicator size="small" color={COLORS.white} />
                        ) : (
                          <View style={{flexDirection:'row',alignItems:'center',gap:8}}><SvgIcon name="share" size={16} color="#fff" /><Text style={styles.fichaBtnText}>Compartir Imagen</Text></View>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* PESTAÑA ASISTENTE IA */}
                {activeTab === 'ASISTENTE' && (
                  <View style={styles.tabContent}>
                    <View style={styles.aiHeader}>
                      <Text style={styles.aiTitle}>Inteligencia de Ventas (Gemini)</Text>
                    </View>
                    {loadingAi ? (
                      <ActivityIndicator size="large" color={COLORS.navy} style={{marginTop: 20}} />
                    ) : (
                      <Text style={styles.aiBodyText}>{aiData}</Text>
                    )}
                    {aiData && aiData !== 'Texto inteligente en preparación para este producto.' && (
                      <TouchableOpacity 
                        style={styles.copyBtn}
                        onPress={async () => {
                          await Clipboard.setStringAsync(aiData);
                          Alert.alert('Copiado', 'El texto ha sido copiado al portapapeles.');
                        }}
                      >
                        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                          <SvgIcon name="share" size={16} color={COLORS.navy} />
                          <Text style={styles.copyBtnText}>Copiar Texto</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* PESTAÑA PRODUCTOS SIMILARES */}
                {activeTab === 'SIMILARES' && (
                  <View style={styles.tabContent}>
                    {/* Misma marca — scroll horizontal */}
                    {productosMismaMarca.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={styles.simSectionTitle}>Más de {modalProd?.marca}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                          {productosMismaMarca.map((sim) => (
                            <TouchableOpacity
                              key={sim.modelo}
                              style={styles.simSlideCard}
                              onPress={() => handleOpenModal(sim)}
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
                    {/* Misma categoría */}
                    {productosSimilares.length > 0 && (
                      <View>
                        <Text style={styles.simSectionTitle}>Misma categoría</Text>
                        {productosSimilares.map((sim) => (
                          <TouchableOpacity key={sim.modelo} style={styles.simCard} onPress={() => handleOpenModal(sim)}>
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

              </ScrollView>
            </View>

            {/* VISTA OCULTA PARA CAPTURA DE IMAGEN (Idéntica al PDF) */}
            <View style={{ position: 'absolute', left: -9000, top: 0 }}>
              <View ref={fichaRef} collapsable={false} style={{ width: 800, backgroundColor: '#fff', paddingBottom: 40, paddingTop: 30 }}>
                {/* HEADER */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 45, marginBottom: 15 }}>
                  <View style={{ width: 250, alignItems: 'center', justifyContent: 'center', marginRight: 20 }}>
                    <Image source={{ uri: `${LOGO_BASE}${(modalProd?.marca||'').toUpperCase().replace(/\s+/g,'_')}.jpg` }} style={{ width: 250, height: 180 }} resizeMode="contain" />
                  </View>
                  <View style={{ width: 2, height: 90, backgroundColor: '#a0a0a0', marginHorizontal: 30 }} />
                  <Text style={{ fontFamily: FONTS.heading, fontSize: 32, fontWeight: 'bold', color: '#0a2566', letterSpacing: 1 }}>FICHA TÉCNICA</Text>
                </View>
                
                <View style={{ height: 4, backgroundColor: '#0d8a39', width: '100%', marginBottom: 20 }} />

                <View style={{ paddingHorizontal: 45 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'stretch', borderWidth: 2, borderColor: '#a0a0a0', borderRadius: 15, padding: 20, marginBottom: 30 }}>
                    <View style={{ flex: 1.5, height: 350, paddingRight: 20, alignItems: 'center', justifyContent: 'center' }}>
                      <Image source={{ uri: modalProd?.imagen }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 4, height: 120, backgroundColor: '#0d8a39', marginRight: 15 }} />
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0d8a39', textTransform: 'uppercase', marginBottom: 4 }}>{modalProd?.marca}</Text>
                        <Text style={{ fontSize: 38, fontWeight: 'bold', color: '#0a2566', lineHeight: 40, marginBottom: 6 }}>{modalProd?.modelo}</Text>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#8a939c', textTransform: 'uppercase', marginBottom: 4 }}>{modalProd?.subcategoria}</Text>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0d8a39' }}>{modalProd?.nombre_producto}</Text>
                      </View>
                    </View>
                  </View>

                  {modalProd?.specs?.length > 0 && (
                    <View style={{ width: '100%', marginBottom: 60 }}>
                      <View style={{ backgroundColor: '#0a2566', paddingVertical: 12, paddingHorizontal: 20 }}>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 }}>Especificaciones técnicas</Text>
                      </View>
                      {modalProd.specs.map(([n, v], i) => (
                        <View key={i} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 20, backgroundColor: i % 2 === 0 ? '#f2f2f2' : '#ffffff' }}>
                          <Text style={{ width: '40%', fontSize: 14, fontWeight: 'bold', color: '#000', textTransform: 'uppercase' }}>{n}</Text>
                          <Text style={{ flex: 1, fontSize: 14, color: '#000' }}>{v}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* FOOTER AZUL */}
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: '#0a2566' }} />
              </View>
            </View>

          </View>
      </Modal>

      {/* Modal de Comparación Inteligente */}
      <Modal visible={showCompareGrid} animationType="slide" onRequestClose={() => setShowCompareGrid(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.navy }}>Comparando {compareItems.length} productos</Text>
            <TouchableOpacity onPress={() => setShowCompareGrid(false)}>
              <Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12 }}>
            {/* Cabecera con imágenes y nombres */}
            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <View style={{ width: 110 }} />
              {compareItems.map((prod, idx) => (
                <View key={prod.modelo} style={{ flex: 1, alignItems: 'center', marginHorizontal: 3 }}>
                  <Image source={{ uri: prod.imagen }} style={{ width: '100%', height: 80 }} resizeMode="contain" />
                  <Text style={{ fontSize: 10, color: COLORS.green, fontWeight: 'bold', textAlign: 'center' }}>{prod.marca}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.navy, fontWeight: 'bold', textAlign: 'center' }} numberOfLines={2}>{prod.modelo}</Text>
                  <TouchableOpacity
                    onPress={() => { setItemToReplaceIndex(idx); setShowReplaceSelector(true); }}
                    style={{ marginTop: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: COLORS.bg, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border }}
                  >
                    <Text style={{ fontSize: 10, color: COLORS.navy, fontWeight: 'bold' }}>🔄 Cambiar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Tabla de specs con indicadores ↑↓ */}
            {(() => {
              // Reunir todos los nombres de specs únicos en orden
              const allSpecNames = [];
              compareItems.forEach(prod => {
                (prod.specs || []).forEach(([n]) => {
                  if (!allSpecNames.includes(n)) allSpecNames.push(n);
                });
              });
              return allSpecNames.map((specName, si) => {
                // Obtener valores de cada producto para este spec
                const vals = compareItems.map(prod => {
                  const found = (prod.specs || []).find(([n]) => n === specName);
                  return found ? found[1] : null;
                });
                // Extraer números para comparación
                const nums = vals.map(v => extractNum(v));
                const validNums = nums.filter(n => n !== null);
                const maxNum = validNums.length > 1 ? Math.max(...validNums) : null;
                const minNum = validNums.length > 1 ? Math.min(...validNums) : null;
                const hasDiff = maxNum !== null && maxNum !== minNum;
                return (
                  <View key={specName} style={{ flexDirection: 'row', backgroundColor: si % 2 === 0 ? '#F7F8FA' : COLORS.white, borderRadius: 6, marginBottom: 2, paddingVertical: 6, alignItems: 'center' }}>
                    <View style={{ width: 110, paddingHorizontal: 8 }}>
                      <Text style={{ fontSize: 10, color: COLORS.gray4, fontWeight: 'bold', textTransform: 'uppercase' }} numberOfLines={2}>{specName}</Text>
                    </View>
                    {compareItems.map((prod, pi) => {
                      const val = vals[pi];
                      const num = nums[pi];
                      let indicator = null;
                      if (hasDiff && num !== null) {
                        if (num === maxNum) indicator = <Text style={{ color: '#16a34a', fontWeight: 'bold', fontSize: 12 }}> ↑</Text>;
                        else if (num === minNum) indicator = <Text style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 12 }}> ↓</Text>;
                      }
                      return (
                        <View key={prod.modelo} style={{ flex: 1, marginHorizontal: 3, backgroundColor: hasDiff && num === maxNum ? '#f0fdf4' : hasDiff && num === minNum ? '#fef2f2' : 'transparent', borderRadius: 4, padding: 4 }}>
                          <Text style={{ fontSize: 11, color: COLORS.navy, fontWeight: '500', textAlign: 'center' }} numberOfLines={2}>
                            {val !== null ? val : '—'}{indicator}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              });
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal Selector de Reemplazo (Similares) */}
      <Modal visible={showReplaceSelector} animationType="fade" transparent onRequestClose={() => setShowReplaceSelector(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 15, maxHeight: '80%', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.navy }}>Elegir reemplazo</Text>
              <TouchableOpacity onPress={() => setShowReplaceSelector(false)}>
                <Text style={{ fontSize: 20, color: COLORS.gray4 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 10 }}>
              {allProducts.filter(p => p.subcategoria === (compareItems[0]?.subcategoria)).slice(0, 30).map(sim => {
                const isAlreadyInGrid = compareItems.some(c => c.modelo === sim.modelo);
                return (
                  <TouchableOpacity 
                    key={sim.modelo} 
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: COLORS.border, opacity: isAlreadyInGrid ? 0.4 : 1 }}
                    disabled={isAlreadyInGrid}
                    onPress={() => {
                      setCompareItems(prev => {
                        const newArr = [...prev];
                        newArr[itemToReplaceIndex] = sim;
                        return newArr;
                      });
                      setShowReplaceSelector(false);
                    }}
                  >
                    <Image source={{ uri: sim.imagen }} style={{ width: 50, height: 50, marginRight: 10 }} resizeMode="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.navy }}>{sim.modelo}</Text>
                      <Text style={{ fontSize: 12, color: COLORS.green }}>{sim.marca}</Text>
                    </View>
                    {isAlreadyInGrid && <Text style={{ fontSize: 10, color: COLORS.gray4 }}>Ya en grilla</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    gap: 12,
  },
  topbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: COLORS.white,
  },
  searchIcon: { fontSize: 13, marginRight: 8 },
  searchInput: { flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy },
  clearBtn: { color: COLORS.gray4, fontSize: 16, padding: 4 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  btnVolver: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.navy, textDecorationLine: 'underline' },
  btnSalir:  { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, textDecorationLine: 'underline' },

  // Marcas
  marcasGrid: { padding: 12, paddingBottom: 40 },
  marcasRow: { gap: 10, marginBottom: 10 },
  welcomeText: {
    fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4,
    textAlign: 'center', padding: 16, paddingBottom: 20,
  },
  marcaBtn: {
    flex: 1,
    height: 90,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  marcaBtnActive: { borderColor: COLORS.navy, borderWidth: 2 },
  marcaLogo: { width: '80%', height: '70%' },
  marcaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(31,47,107,0.1)',
  },

  // Productos grid
  prodGrid: { padding: 10, paddingBottom: 40 },
  prodRow: { gap: 12, marginBottom: 12 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardImg: { backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  cardImgI: { width: '85%', height: '85%' },
  greenBar: { height: 3, backgroundColor: COLORS.green },
  cardBody: { padding: 10 },
  cardMarca: {
    fontFamily: FONTS.body, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: COLORS.green, marginBottom: 2,
  },
  cardModelo: {
    fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700',
    color: COLORS.navy, lineHeight: 18,
  },
  cardSubcat: {
    fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, marginTop: 2,
  },

  // Estados
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  centerText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, textAlign: 'center' },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: 'red', textAlign: 'center' },
  retryBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: COLORS.navy },
  retryText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.white },

  // Banner actualización en background
  bgBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 5, paddingHorizontal: 16,
    backgroundColor: COLORS.navy,
  },
  bgBannerText: {
    fontFamily: FONTS.bodySemi, fontSize: 11,
    color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5,
  },

  // Modal
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
  modalBody: { padding: 18 },
  modalImg: { width: '100%', height: 220, backgroundColor: COLORS.white, marginBottom: 8 },
  modalMarca: {
    fontFamily: FONTS.body, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.4, textTransform: 'uppercase', color: COLORS.green, marginBottom: 2,
  },
  modalModelo: {
    fontFamily: FONTS.heading, fontSize: 26, fontWeight: '700',
    color: COLORS.navy, marginBottom: 4,
  },
  modalSubcat: {
    fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  // Botón ficha
  fichaBtn: {
    backgroundColor: COLORS.navy,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    minHeight: 44,
  },
  fichaBtnDis: { opacity: 0.6 },
  fichaBtnText: {
    fontFamily: FONTS.bodySemi, fontSize: 14,
    color: COLORS.white, fontWeight: '700',
  },
  fichaMsgError: {
    fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4,
    textAlign: 'center', marginBottom: 14,
  },

  // Specs
  specsWrap: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  specsHead: { backgroundColor: COLORS.navy, padding: 10 },
  specsHeadText: {
    fontFamily: FONTS.bodySemi, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.white,
  },
  specRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#edf1f5' },
  specRowAlt: { backgroundColor: '#fafbfc' },
  specName: {
    fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4,
    fontWeight: '700', width: '45%', textTransform: 'uppercase', letterSpacing: 0.3,
    paddingRight: 10,
  },
  specVal: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray1, flex: 1, flexWrap: 'wrap' },
  
  modalActionsWrap: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginBottom: 30,
  },

  // Tabs
  tabsWrap: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#edf1f5', marginBottom: 0 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: COLORS.navy },
  tabText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4 },
  tabTextActive: { color: COLORS.navy, fontWeight: '700' },
  tabContent: { padding: 16 },

  // Asistente IA
  aiHeader: { marginBottom: 12 },
  aiTitle: { fontFamily: FONTS.bodySemi, fontSize: 16, fontWeight: '700', color: COLORS.navy },
  aiBodyText: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, lineHeight: 22 },
  copyBtn: { backgroundColor: COLORS.green, paddingVertical: 12, alignItems: 'center', borderRadius: 8, marginTop: 16 },
  copyBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.white, fontWeight: '700' },

  // Productos similares
  simCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#edf1f5' },
  simImg: { width: 60, height: 60, borderRadius: 6, marginRight: 12, backgroundColor: '#f7f8fa' },
  simInfo: { flex: 1 },
  simMarca: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, fontWeight: '700', textTransform: 'uppercase' },
  simModelo: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, marginTop: 2 },
  
  simSectionTitle: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  simSlideCard: { width: 140, marginRight: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, backgroundColor: COLORS.white },
  simSlideImg: { width: '100%', height: 90, marginBottom: 8 },
  simSlideMarca: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.gray4, fontWeight: '700', textTransform: 'uppercase' },
  simSlideModelo: { fontFamily: FONTS.heading, fontSize: 13, color: COLORS.navy, marginTop: 2, lineHeight: 16 },
});
