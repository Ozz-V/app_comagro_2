import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar,
  ActivityIndicator, useWindowDimensions, Modal, ScrollView,
  RefreshControl, Platform, Alert,
} from 'react-native';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { captureRef } from 'react-native-view-shot';
import { supabase, EDGE_URL } from '../supabase';
import { COLORS, FONTS } from '../theme';

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

export default function ProductosScreen({ navigation }) {
  const [allProducts, setAllProducts] = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [bgActualiz, setBgActualiz]   = useState(false); // actualización silenciosa
  const [error, setError]             = useState(null);
  const [marcas, setMarcas]           = useState([]);
  const [filtroMarca, setFiltroMarca] = useState('');
  const [busqueda, setBusqueda]       = useState('');
  const [modalProd, setModalProd]     = useState(null);
  // Estado de generación
  const [generandoPdf, setGenerandoPdf]   = useState(false);
  const [compartiendo, setCompartiendo]   = useState(false);

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

  const { width } = useWindowDimensions();
  const numCols = width >= 600 ? 3 : 2;
  const cardW = (width - 32 - (numCols - 1) * 12) / numCols;

  useEffect(() => { cargarDatos(false); }, []);

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
      const subcategoria = (row['Tipo de Producto'] || row['Categoria Magento'] || 'General').toString().trim();
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
          body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; color: #1A1A1A; }
          .page { width: 100%; min-height: 100vh; padding: 30px 45px 40px; display: flex; flex-direction: column; }
          
          /* HEADER con logo grande */
          .header { display: flex; align-items: center; height: 80px; flex-shrink: 0; border-bottom: 5px solid #1c9f4b; margin-bottom: 15px; padding-bottom: 10px; }
          .brand-logo { max-width: 220px; max-height: 70px; object-fit: contain; }
          .brand-text { font-size: 26pt; font-weight: bold; color: #1f2f6b; }
          .separator { width: 2px; height: 50px; background-color: #cfcfcf; margin: 0 25px; }
          .title-ficha { font-size: 20pt; font-weight: bold; color: #1f2f6b; letter-spacing: 2px; }
          
          /* IMAGEN - altura fija, nunca desborda */
          .img-wrap { height: 250px; width: 100%; display: flex; align-items: center; justify-content: center; border: 1px solid #d7d7d7; border-radius: 8px; background: #fff; padding: 15px; overflow: hidden; margin-bottom: 12px; }
          .prod-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
          
          /* TÍTULO PRODUCTO */
          .title-sec { display: flex; margin-bottom: 15px; align-items: stretch; flex-shrink: 0; }
          .green-accent { width: 6px; background-color: #1c9f4b; margin-right: 18px; border-radius: 3px; }
          .prod-marca { font-size: 11pt; font-weight: bold; color: #1c9f4b; text-transform: uppercase; margin: 0; }
          .prod-modelo { font-size: 26pt; font-weight: bold; color: #1f2f6b; line-height: 1.1; margin: 3px 0 0 0; }
          .prod-subcat { font-size: 11pt; color: #6f7b87; margin-top: 4px; text-transform: uppercase; }
          
          /* TABLA SPECS - una sola columna */
          .specs { width: 100%; border-collapse: collapse; table-layout: fixed; flex-shrink: 0; }
          .specs-head { background-color: #1f2f6b; color: white; padding: 8px 14px; font-size: 10pt; font-weight: bold; letter-spacing: 0.5px; }
          .specs td { padding: 7px 14px; border-bottom: 1px solid #e7e7e7; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
          .specs tr.alt { background-color: #f7f8fa; }
          .spec-name { font-size: 9pt; font-weight: bold; color: #4f5963; width: 38%; text-transform: uppercase; letter-spacing: 0.3px; }
          .spec-val { font-size: 10pt; color: #1A1A1A; }
          
          .footer { position: fixed; bottom: 0; left: 0; right: 0; height: 20px; background-color: #1f2f6b; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <img src="${logoUrl}" class="brand-logo" onerror="this.outerHTML='<span class=brand-text>${modalProd?.marca || ''}</span>'" />
            <div class="separator"></div>
            <div class="title-ficha">FICHA TÉCNICA</div>
          </div>
          
          <div class="img-wrap">
            <img id="prodImg" class="prod-img" src="${base64Img}" />
          </div>
          
          <div class="title-sec">
            <div class="green-accent"></div>
            <div>
              <p class="prod-marca">${modalProd?.marca || ''}</p>
              <h1 class="prod-modelo">${modalProd?.modelo || ''}</h1>
              <div class="prod-subcat">${(modalProd?.subcategoria || 'GENERAL').toUpperCase()}</div>
            </div>
          </div>
          
          ${specsHtml}
          
          <div class="footer"></div>
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

  // ─── COMPARTIR COMO IMAGEN (genera HTML compacto tipo tarjeta) ──
  async function compartirImagen() {
    try {
      setCompartiendo(true);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Compartir no está disponible en este dispositivo');
        return;
      }
      
      const marcaSlug = modalProd?.marca?.toUpperCase().replace(/\s+/g, '_') || '';
      const logoUrl = `https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/${marcaSlug}.jpg`;
      const base64Img = await fetchImageBase64(modalProd?.imagen);
      const specs = modalProd?.specs || [];
      
      // HTML compacto tipo tarjeta (sin @page A4, renderiza al tamaño del contenido)
      const cardHtml = `
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8">
        <style>
          @page { margin: 0; size: 600px 900px; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { width: 600px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; -webkit-print-color-adjust: exact; }
          .card { width: 600px; padding: 25px 30px 20px; }
          .header { display: flex; align-items: center; border-bottom: 4px solid #1c9f4b; padding-bottom: 8px; margin-bottom: 14px; }
          .brand-logo { max-width: 160px; max-height: 50px; object-fit: contain; }
          .brand-text { font-size: 20pt; font-weight: bold; color: #1f2f6b; }
          .sep { width: 2px; height: 35px; background: #ccc; margin: 0 16px; }
          .title-f { font-size: 16pt; font-weight: bold; color: #1f2f6b; letter-spacing: 1px; }
          .img-area { width: 100%; height: 220px; display: flex; align-items: center; justify-content: center; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; margin-bottom: 10px; background: #fff; }
          .img-area img { max-width: 100%; max-height: 100%; object-fit: contain; }
          .prod-info { display: flex; margin-bottom: 12px; }
          .accent { width: 5px; background: #1c9f4b; margin-right: 14px; border-radius: 3px; }
          .marca { font-size: 10pt; font-weight: bold; color: #1c9f4b; text-transform: uppercase; }
          .modelo { font-size: 22pt; font-weight: bold; color: #1f2f6b; line-height: 1.1; margin-top: 2px; }
          .subcat { font-size: 10pt; color: #6f7b87; text-transform: uppercase; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; }
          .sh { background: #1f2f6b; color: #fff; padding: 6px 12px; font-size: 9pt; font-weight: bold; }
          td { padding: 5px 12px; border-bottom: 1px solid #eee; font-size: 9pt; }
          tr.a { background: #f7f8fa; }
          .sn { font-weight: bold; color: #4f5963; width: 38%; text-transform: uppercase; }
          .footer { height: 14px; background: #1f2f6b; margin-top: 10px; }
        </style></head>
        <body>
          <div class="card">
            <div class="header">
              <img src="${logoUrl}" class="brand-logo" onerror="this.outerHTML='<span class=brand-text>${modalProd?.marca || ''}</span>'" />
              <div class="sep"></div>
              <div class="title-f">FICHA TÉCNICA</div>
            </div>
            <div class="img-area">
              <img id="prodImg" src="${base64Img}" />
            </div>
            <div class="prod-info">
              <div class="accent"></div>
              <div>
                <div class="marca">${modalProd?.marca || ''}</div>
                <div class="modelo">${modalProd?.modelo || ''}</div>
                <div class="subcat">${(modalProd?.subcategoria || 'GENERAL').toUpperCase()}</div>
              </div>
            </div>
            ${specs.length > 0 ? `<table>
              <thead><tr><td colspan="2" class="sh">ESPECIFICACIONES TÉCNICAS</td></tr></thead>
              <tbody>${specs.map((s, i) => `<tr${i%2===1?' class="a"':''}><td class="sn">${s[0]}</td><td>${s[1]}</td></tr>`).join('')}</tbody>
            </table>` : ''}
            <div class="footer"></div>
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
                  var d = ctx.getImageData(0,0,tmp.width,tmp.height).data;
                  var w=tmp.width, h=tmp.height, t=h, l=w, r=-1, b=-1;
                  for(var y=0;y<h;y++) for(var x=0;x<w;x++){
                    var i=(y*w+x)*4;
                    if(d[i+3]>10&&!(d[i]>=245&&d[i+1]>=245&&d[i+2]>=245)){
                      if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;
                    }
                  }
                  if(r<l||b<t)return;
                  var p=8;l=Math.max(0,l-p);t=Math.max(0,t-p);r=Math.min(w-1,r+p);b=Math.min(h-1,b+p);
                  var cw=r-l+1,ch=b-t+1,out=document.createElement('canvas');
                  out.width=cw;out.height=ch;
                  out.getContext('2d').drawImage(tmp,l,t,cw,ch,0,0,cw,ch);
                  document.getElementById('prodImg').src=out.toDataURL('image/png');
                }catch(e){}
              };
              img.src='${base64Img}';
            })();
          </script>
        </body></html>
      `;
      
      const { uri } = await Print.printToFileAsync({ html: cardHtml, width: 600, height: 900 });
      
      // Renombrar a .jpg para que WhatsApp lo trate como imagen
      const jpgUri = uri.replace('.pdf', '.jpg');
      await require('expo-file-system').moveAsync({ from: uri, to: jpgUri });
      
      await Sharing.shareAsync(jpgUri, {
        dialogTitle: `Ficha ${modalProd?.modelo}`,
        mimeType: 'image/jpeg',
      });
      trackAnalytics(modalProd, 'share_image');
    } catch (e) {
      console.log('Error al compartir imagen:', e);
      Alert.alert('Error', 'No se pudo generar la ficha como imagen.');
    } finally {
      setCompartiendo(false);
    }
  }

  // ─── FILTRADO ─────────────────────────────────────────────────────
  const productosFiltrados = useMemo(() => {
    let lista = filtroMarca ? allProducts.filter(p => p.marca === filtroMarca) : allProducts;
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
  }, [allProducts, filtroMarca, busqueda]);

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

  const renderProducto = useCallback(({ item }) => (
    <TouchableOpacity
      style={[styles.card, { width: cardW }]}
      activeOpacity={0.85}
      onPress={() => handleOpenModal(item)}
    >
      <View style={[styles.cardImg, { height: cardW * 0.85 }]}>
        <Image source={{ uri: item.imagen }} style={styles.cardImgI} resizeMode="contain" />
      </View>
      <View style={styles.greenBar} />
      <View style={styles.cardBody}>
        <Text style={styles.cardMarca}>{item.marca}</Text>
        <Text style={styles.cardModelo} numberOfLines={2}>{item.modelo}</Text>
        <Text style={styles.cardSubcat} numberOfLines={1}>{item.subcategoria}</Text>
      </View>
    </TouchableOpacity>
  ), [cardW]);

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
              if (filtroMarca || busqueda) { setFiltroMarca(''); setBusqueda(''); }
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

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar producto…"
            placeholderTextColor={COLORS.gray4}
            value={busqueda}
            onChangeText={v => { setBusqueda(v); if (v) setFiltroMarca(''); }}
          />
          {busqueda ? (
            <TouchableOpacity onPress={() => setBusqueda('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
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

      {/* Modal producto */}
      <Modal
        visible={!!modalProd}
        animationType="slide"
        transparent
        onRequestClose={() => setModalProd(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle} numberOfLines={1}>{modalProd?.modelo}</Text>
              <TouchableOpacity onPress={() => setModalProd(null)}>
                <Text style={styles.modalClose}>✕ Cerrar</Text>
              </TouchableOpacity>
            </View>
              {/* TABS DE NAVEGACIÓN */}
              <View style={styles.tabsWrap}>
                <TouchableOpacity onPress={() => setActiveTab('FICHA')} style={[styles.tabBtn, activeTab === 'FICHA' && styles.tabBtnActive]}>
                  <Text style={[styles.tabText, activeTab === 'FICHA' && styles.tabTextActive]}>📝 Ficha</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveTab('ASISTENTE')} style={[styles.tabBtn, activeTab === 'ASISTENTE' && styles.tabBtnActive]}>
                  <Text style={[styles.tabText, activeTab === 'ASISTENTE' && styles.tabTextActive]}>🤖 Asistente</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveTab('SIMILARES')} style={[styles.tabBtn, activeTab === 'SIMILARES' && styles.tabBtnActive]}>
                  <Text style={[styles.tabText, activeTab === 'SIMILARES' && styles.tabTextActive]}>🔄 Similares</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                
                {/* PESTAÑA FICHA TÉCNICA */}
                {activeTab === 'FICHA' && (
                  <View>
                    <View ref={fichaRef} collapsable={false} style={{ backgroundColor: COLORS.white, paddingBottom: 10 }}>
                      <Image
                        source={{ uri: modalProd?.imagen }}
                        style={styles.modalImg}
                        resizeMode="contain"
                      />
                      
                      <View style={styles.titleSec}>
                        <View style={styles.greenAccent} />
                        <View style={{flex: 1}}>
                          <Text style={styles.modalMarca}>{modalProd?.marca}</Text>
                          <Text style={styles.modalModelo}>{modalProd?.modelo}</Text>
                          <Text style={styles.modalSubcat}>{modalProd?.subcategoria}</Text>
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
                          <Text style={styles.fichaBtnText}>📄 Compartir PDF</Text>
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
                          <Text style={styles.fichaBtnText}>🖼️ Compartir Ficha</Text>
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
                      <TouchableOpacity style={styles.copyBtn}>
                        <Text style={styles.copyBtnText}>📋 Copiar para WhatsApp</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* PESTAÑA PRODUCTOS SIMILARES */}
                {activeTab === 'SIMILARES' && (
                  <View style={styles.tabContent}>
                    {productosSimilares.length === 0 ? (
                      <Text style={styles.aiBodyText}>No hay productos similares.</Text>
                    ) : (
                      productosSimilares.map((sim) => (
                        <TouchableOpacity key={sim.modelo} style={styles.simCard} onPress={() => handleOpenModal(sim)}>
                          <Image source={{ uri: sim.imagen }} style={styles.simImg} resizeMode="contain" />
                          <View style={styles.simInfo}>
                            <Text style={styles.simMarca}>{sim.marca}</Text>
                            <Text style={styles.simModelo} numberOfLines={2}>{sim.modelo}</Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
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
});
