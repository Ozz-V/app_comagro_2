import React, { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../supabase';
import { syncAnalyticsQueue } from '../utils/analyticsSync';
import { getAllProducts } from '../utils/database';
import { useTemplate } from '../hooks/useTemplate';
import { renderTemplate } from '../services/templateService';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { AnalyticsRankItem } from '../types';
import { APP_CONSTANTS } from '../config/constants';

const LOGO_BASE = APP_CONSTANTS.LOGO_BASE_BRANDS_2025;

interface DashboardData {
  views: number;
  shares: number;
  prevViews?: number;
  prevShares?: number;
  topV: AnalyticsRankItem[];
  topSh: AnalyticsRankItem[];
  topSe?: AnalyticsRankItem[];
  brands?: AnalyticsRankItem[];
  users?: (AnalyticsRankItem & { user_email: string })[];
}

export interface ChartMetrics {
  start: number;   // views in the oldest third of the period
  peak: number;    // max views in any single day
  peakLabel: string; // e.g. "Hace 3d" or a date
  today: number;   // views today only
}

const EMPTY_CHART: ChartMetrics = { start: 0, peak: 0, peakLabel: '-', today: 0 };

// Antes operaba sobre miles de eventos crudos del usuario (computeChartMetrics
// original). Ahora recibe directamente lo que devuelve
// get_user_daily_views_by_period: un renglón por día ({ day, views }), ya
// agregado en Postgres -- el cálculo de "inicio de período" / "pico" / "hoy"
// pasa a operar sobre unos pocos renglones (días), nunca sobre el volumen
// crudo de eventos, sin importar cuánta actividad tenga el usuario.
function computeChartMetricsFromDaily(dailyRows: { day: string; views: number | string }[]): ChartMetrics {
  if (!dailyRows || dailyRows.length === 0) return EMPTY_CHART;

  const days = [...dailyRows]
    .map(d => ({ day: String(d.day).substring(0, 10), views: Number(d.views) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const todayStr = new Date().toISOString().substring(0, 10);
  const today = days.find(d => d.day === todayStr)?.views || 0;

  // Inicio: suma del primer tercio de los días con actividad
  const startSlice = days.slice(0, Math.max(1, Math.floor(days.length / 3)));
  const start = startSlice.reduce((s, d) => s + d.views, 0);

  // Pico: el día con más vistas
  const peakEntry = days.reduce((best, cur) => (cur.views > best.views ? cur : best), days[0]);
  const peak = peakEntry.views;

  let peakLabel = '-';
  if (peak > 0) {
    const diffMs = Date.now() - new Date(peakEntry.day).getTime();
    const diffDays = Math.round(diffMs / 86400000);
    peakLabel = diffDays === 0 ? 'Hoy' : `Hace ${diffDays}d`;
  }

  return { start, peak, peakLabel, today };
}

function getPeriodDate(p: string): string | null {
  if (p === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (p === '7d') return new Date(Date.now() - 7 * 86400000).toISOString();
  if (p === '30d') return new Date(Date.now() - 30 * 86400000).toISOString();
  return null;
}

function getPrevPeriodDate(p: string): string | null {
  if (p === 'today') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (p === '7d') return new Date(Date.now() - 14 * 86400000).toISOString();
  if (p === '30d') return new Date(Date.now() - 60 * 86400000).toISOString();
  return null;
}

export function getTrend(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '↑' : '';
  const ch = ((cur - prev) / prev) * 100;
  if (ch > 5) return `↑${Math.round(ch)}%`;
  if (ch < -5) return `↓${Math.round(Math.abs(ch))}%`;
  return '→';
}



export function useDashboardAnalyticsLogic(onTabChange?: (tab: 'mine' | 'general') => void) {
  const [tab, setTab] = useState<'mine' | 'general'>('mine');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const { showToast } = useCustomAlert();
  const { isOnline } = useOfflineSync();
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [productBrandMap, setProductBrandMap] = useState<Record<string, string>>({});
  const [myData, setMyData] = useState<DashboardData>({ views: 0, shares: 0, topV: [], topSh: [] });
  const [globalData, setGlobalData] = useState<DashboardData>({ views: 0, shares: 0, topV: [], topSh: [], brands: [], users: [] });
  const [isAdmin, setIsAdmin] = useState(false);
  const [myChartMetrics, setMyChartMetrics] = useState<ChartMetrics>(EMPTY_CHART);
  const [globalChartMetrics, setGlobalChartMetrics] = useState<ChartMetrics>(EMPTY_CHART);
  const statsTemplate = useTemplate('stats_report');

  const cleanText = (val: any) => String(val ?? '').replace(/^\$+/, '');

  useEffect(() => {
    onTabChange?.(tab);
    setExpandedCard(null); 
  }, [tab, onTabChange]);

  const isMounted = React.useRef(true);
  const fetchCounter = React.useRef(0);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { loadImages(); }, []);
  useEffect(() => { loadData(); }, [period, isOnline]);

  async function loadImages() {
    try {
      // Pedir suficientes productos para que el mapa de imágenes cubra los más vistos
      const rows = await getAllProducts(5000);
      const m: Record<string, string> = {};
      const bm: Record<string, string> = {};
      rows.forEach((r: any) => {
        const sku = r.modelo;
        const img = r.imagen || r.imagenOriginal;
        if (sku && img) m[sku] = img;
        if (sku && r.marca) bm[sku] = r.marca;
      });
      if (isMounted.current) {
        setImageMap(m);
        setProductBrandMap(bm);
      }
    } catch (e: unknown) {
      Sentry.captureException(e);
    }
  }

  async function loadData() {
    if (!isMounted.current) return;
    fetchCounter.current += 1;
    const currentFetch = fetchCounter.current;
    setLoading(true);
    let currentIsAdmin = isAdmin;
    try {
      const cachedMyData = await AsyncStorage.getItem(`@analytics_my_${period}`);
      const cachedGlobalData = await AsyncStorage.getItem(`@analytics_global_${period}`);

      const parsedMyData = cachedMyData ? JSON.parse(cachedMyData) : null;
      const parsedGlobalData = cachedGlobalData ? JSON.parse(cachedGlobalData) : null;

      if (parsedMyData && isMounted.current && currentFetch === fetchCounter.current) setMyData(parsedMyData);
      if (parsedGlobalData && isMounted.current && currentFetch === fetchCounter.current) setGlobalData(parsedGlobalData);
      if (parsedMyData && parsedGlobalData && isMounted.current && currentFetch === fetchCounter.current) {
        setLoading(false);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (user && isMounted.current) {
         const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
         currentIsAdmin = profile?.role === 'admin';
         setIsAdmin(currentIsAdmin);
      }
      await syncAnalyticsQueue();
    } catch (_: unknown) {}

    if (!isOnline) {
      if (isMounted.current) setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // -----------------------------------------------------------------------
      // Arquitectura: el servidor agrupa y cuenta, el cliente solo muestra.
      // Esto garantiza que "Hoy", "7d", "30d" y "Todo" siempre muestren datos
      // reales independientemente del volumen historico de registros, TANTO
      // para "General" como para "Mi Actividad" (antes "Mi Actividad" traía
      // hasta 10000 filas crudas del usuario y las agregaba en JS -- ya no).
      // -----------------------------------------------------------------------
      const periodParam: 'today' | '7d' | '30d' | 'all' =
        period === 'today' ? 'today' : period === '7d' ? '7d' : period === '30d' ? '30d' : 'all';

      // ── Mi Actividad: todo agregado server-side para el usuario actual ──
      const [myKpisRes, myTopViewedRes, myTopSharedRes, myTopBrandsRes, myDailyRes] = await Promise.all([
        supabase.rpc('get_user_analytics_summary_by_period', { p_email: user.email, p_period: periodParam }),
        supabase.rpc('get_top_viewed_products_by_user_period', { p_email: user.email, p_period: periodParam, p_limit: 5 }),
        supabase.rpc('get_top_shared_products_by_user_period', { p_email: user.email, p_period: periodParam, p_limit: 5 }),
        supabase.rpc('get_top_brands_by_user_period', { p_email: user.email, p_period: periodParam, p_limit: 5 }),
        supabase.rpc('get_user_daily_views_by_period', { p_email: user.email, p_period: periodParam }),
      ]);

      // Dos mappers separados a propósito: "Top Vistos" debe mostrar la
      // cantidad de VISTAS de cada producto, y "Top Compartidos" la
      // cantidad de VECES COMPARTIDO -- no un número combinado de
      // vistas+compartidos en ambas tarjetas (bug real detectado por el
      // test "separa vistas y compartidos, y calcula el top de
      // productos": un producto con 2 vistas y 2 compartidos debe mostrar
      // count=2 en "Top Vistos", no 4).
      const mapViewedRow = (r: any): AnalyticsRankItem => ({
        modelo: r.modelo,
        marca: r.marca,
        sku: r.sku,
        count: Number(r.views),
      });
      const mapSharedRow = (r: any): AnalyticsRankItem => ({
        modelo: r.modelo,
        marca: r.marca,
        sku: r.sku,
        count: Number(r.shares),
      });
      // Las marcas sí muestran un total combinado (vistas+compartidos) a
      // propósito: hay una sola sección "Top Marcas", no una separada por
      // vistas y otra por compartidos, así que el número representa
      // "interacción total" con esa marca -- mismo criterio que ya usaba
      // esta pantalla antes de esta refactorización.
      const mapBrandRow = (r: any): AnalyticsRankItem => ({
        modelo: r.marca,
        marca: r.marca,
        sku: r.marca,
        count: Number(r.views) + Number(r.shares),
      });

      const myKpiRow = Array.isArray(myKpisRes.data) ? myKpisRes.data[0] : myKpisRes.data;
      const finalMyData: DashboardData = {
        views: Number(myKpiRow?.views || 0),
        shares: Number(myKpiRow?.shares || 0),
        topV: (myTopViewedRes.data || []).map(mapViewedRow),
        topSh: (myTopSharedRes.data || []).map(mapSharedRow),
        brands: (myTopBrandsRes.data || []).map(mapBrandRow),
      };
      const myMetrics = computeChartMetricsFromDaily(myDailyRes.data || []);
      if (isMounted.current && currentFetch === fetchCounter.current) {
        setMyData(finalMyData);
        setMyChartMetrics(myMetrics);
      }
      AsyncStorage.setItem(`@analytics_my_${period}`, JSON.stringify(finalMyData));

      // ── General: KPIs, top vistos y top compartidos POR SEPARADO ──
      // (antes usaba la misma lista, ordenada por vistas+compartidos
      // combinado, para ambas secciones -- "Top Vistos" y "Top
      // Compartidos" mostraban exactamente lo mismo).
      const [myKpisGlobalRes, topViewedRes, topSharedRes, topBrandsRes, topUsersRes] = await Promise.all([
        supabase.rpc('get_global_kpis', { p_period: periodParam }),
        supabase.rpc('get_top_viewed_products_by_period', { p_period: periodParam, p_limit: 10 }),
        supabase.rpc('get_top_shared_products_by_period', { p_period: periodParam, p_limit: 10 }),
        supabase.rpc('get_top_brands_by_period', { p_period: periodParam, p_limit: 8 }),
        supabase.rpc('get_top_users_by_period', { p_period: periodParam, p_limit: 8 }),
      ]);

      let topUsers = (topUsersRes.data || [])
        .filter((u: any) => u.user_email !== 'offline_user')
        .map((u: any) => ({
          modelo: u.user_email,
          marca: '',
          sku: u.user_email,
          user_email: u.user_email,
          count: Number(u.views) + Number(u.shares),
          action: 'view',
          created_at: '',
        }));

      if (!currentIsAdmin) {
        const { data: admins } = await supabase.from('profiles').select('email').eq('role', 'admin');
        const adminEmails = new Set((admins || []).map((a: any) => a.email));
        topUsers = topUsers.filter((u: any) => !adminEmails.has(u.user_email));
      }

      const kpisRow = Array.isArray(myKpisGlobalRes.data) ? myKpisGlobalRes.data[0] : myKpisGlobalRes.data;
      const globalViews = Number(kpisRow?.views || 0);
      const globalShares = Number(kpisRow?.shares || 0);

      const gd: DashboardData = {
        views: globalViews,
        shares: globalShares,
        topV: (topViewedRes.data || []).map(mapViewedRow),
        topSh: (topSharedRes.data || []).map(mapSharedRow),
        brands: (topBrandsRes.data || []).map(mapBrandRow),
        users: topUsers,
      };

      if (isMounted.current && currentFetch === fetchCounter.current) {
        setGlobalData(gd);
        setGlobalChartMetrics(EMPTY_CHART);
      }
      AsyncStorage.setItem(`@analytics_global_${period}`, JSON.stringify(gd));
    } catch (e: unknown) {
      Sentry.captureException(e);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  async function generatePdfReport() {
    setIsGeneratingPdf(true);
    try {
      const d = tab === 'mine' ? myData : globalData;
      const pLabel = period === 'today' ? 'Hoy' : period === '7d' ? 'Últimos 7 días' : period === '30d' ? 'Últimos 30 días' : 'Todo el tiempo';
      
      const renderList = (items: any[], max: number, type: string) => {
         return (items || []).slice(0, 10).map((i: any, idx: number) => {
           const w = max > 0 ? Math.max(5, (i.count / max) * 100) : 0;
           const rawName = type === 'marcas' ? (productBrandMap[i.sku || i.modelo] || i.marca) : type === 'usuarios' ? i.user_email : (i.modelo || i.marca || 'Desc.');
           let name = cleanText(rawName);
           const color = type === 'vistas' ? '#007db8' : type === 'compartidos' ? '#0D8A39' : type === 'marcas' ? '#F37021' : '#6A1B9A';
           
           let imgTag = '';
           if (type === 'usuarios') {
             imgTag = `<div class="item-img" style="border-radius:14px; background-color:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:10px; line-height:28px; text-align:center;">${name.substring(0,2).toUpperCase()}</div>`;
             name = name.split('@')[0];
           } else if (type === 'marcas') {
             const marcaSlug = (name || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
             imgTag = `<img src="${APP_CONSTANTS.LOGO_BASE_BRANDS_2025}${marcaSlug}.jpg" class="item-img" style="border-radius:4px; border:1px solid #DFE1E6;">`;
           } else {
             const mSku = i.modelo || i.marca;
             const imgSrc = imageMap[mSku] || `https://ui-avatars.com/api/?name=${encodeURIComponent(name.substring(0,2))}&background=E8ECF0&color=1A2530`;
             imgTag = `<img src="${imgSrc}" class="item-img">`;
           }

           return `
            <div class="item">
                <div class="item-rank">${idx+1}</div>
                ${imgTag}
                <div class="item-info">
                    <div class="item-name">${name}</div>
                    <div class="progress-track"><div class="progress-fill" style="width: ${w}%; background: ${color};"></div></div>
                </div>
                <div class="item-count" style="color: ${color};">${cleanText(i.count)}</div>
            </div>`;
         }).join('');
      };

      const maxV = d.topV?.[0]?.count || 1;
      const maxSh = d.topSh?.[0]?.count || 1;
      const maxB = d.brands?.[0]?.count || 1;
      const maxU = d.users?.[0]?.count || 1;

      const pdfMetrics = tab === 'mine' ? myChartMetrics : globalChartMetrics;
      const pPeriodLabel = period === 'today' ? 'Hoy' : period === '7d' ? 'Hace 7d' : period === '30d' ? 'Hace 30d' : 'Inicio (60d)';

      // Bloque de KPI de usuarios: solo aplica a la vista "general". Esta
      // decisión (mostrar o no la card) es lógica de datos, no de diseño —
      // se resuelve acá y se pasa ya armada al template.
      const usersKpiCardHtml = tab === 'general'
        ? `<div class="kpi-card"><div class="kpi-title">Usuarios Activos</div><div class="kpi-val" style="color: #6A1B9A;">${d.users?.length || 0}</div></div>`
        : '';

      const listsGridHtml = [
        d.topV.length > 0 ? `<div class="list-card"><div class="list-title">Top Productos Más Vistos</div><div class="list-items">${renderList(d.topV, maxV, 'vistas')}</div></div>` : '',
        d.topSh.length > 0 ? `<div class="list-card"><div class="list-title">Top Productos Compartidos</div><div class="list-items">${renderList(d.topSh, maxSh, 'compartidos')}</div></div>` : '',
        d.brands && d.brands.length > 0 ? `<div class="list-card"><div class="list-title">Top Marcas</div><div class="list-items">${renderList(d.brands, maxB, 'marcas')}</div></div>` : '',
        tab === 'general' && d.users && d.users.length > 0 ? `<div class="list-card"><div class="list-title">Top Usuarios</div><div class="list-items">${renderList(d.users, maxU, 'usuarios')}</div></div>` : '',
      ].join('');

      // Force remove chart-box from HTML string if it exists in the cached remote template
            const html = renderTemplate(statsTemplate.html, {
        reportTitle: `Reporte de Estadísticas - ${tab === 'mine' ? 'Mi Actividad' : 'General'}`,
        periodLabel: pLabel,
        periodLabelShort: pPeriodLabel,
        logoUrl: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png',
        viewsTotal: String(cleanText(d.views)),
        sharesTotal: String(cleanText(d.shares)),
        usersKpiCardHtml,
        chartStartValue: String(pdfMetrics.start),
        chartPeakValue: String(pdfMetrics.peak),
        chartPeakLabel: String(pdfMetrics.peakLabel),
        chartTodayValue: String(pdfMetrics.today),
        listsGridHtml,
        footerText: 'Generado automáticamente desde Comagro App',
      });

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const isAv = await Sharing.isAvailableAsync();
      if(isAv) {
         await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Reporte Comagro' });
      } else {
         showToast('Compartir no disponible en este dispositivo.');
      }
    } catch(e: any) {
      showToast('Error generando PDF.');
      Sentry.captureException(e);
    } finally {
      setIsGeneratingPdf(false);
    }
  }



  return {
    tab, setTab, period, setPeriod, loading, expandedCard, setExpandedCard,
    isAdmin, isOnline, myData, globalData, myChartMetrics, globalChartMetrics,
    imageMap, productBrandMap, cleanText, generatePdfReport, isGeneratingPdf
  };
}
