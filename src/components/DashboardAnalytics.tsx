import * as Sentry from '@sentry/react-native';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { supabase } from '../supabase';
import { syncAnalyticsQueue } from '../utils/analyticsSync';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';
import Svg, { Defs, LinearGradient, Stop, Line, Path, Circle } from 'react-native-svg';
import { APP_CONSTANTS } from '../config/constants';
import { AnalyticsRankItem } from '../types';
import { getAllProducts } from '../utils/database';

const LOGO_BASE = APP_CONSTANTS.LOGO_BASE_BRANDS_2025;
const CACHE_KEY = 'comagro_productos_v3';

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

function countByKey<T>(items: T[], keyFn: (i: T) => string | undefined | null, limit: number): AnalyticsRankItem[] {
  const m: Record<string, AnalyticsRankItem & T> = {};
  items.forEach(i => {
    const k = keyFn(i);
    if (!k) return;
    if (!m[k]) m[k] = { ...i, count: 0 };
    m[k].count++;
  });
  return Object.values(m).sort((a, b) => b.count - a.count).slice(0, limit);
}

function getTrend(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '↑' : '';
  const ch = ((cur - prev) / prev) * 100;
  if (ch > 5) return `↑${Math.round(ch)}%`;
  if (ch < -5) return `↓${Math.round(Math.abs(ch))}%`;
  return '→';
}

export default function DashboardAnalytics({ navigation, onUserClick, onTabChange }: { navigation: any, onUserClick?: (email: string) => void, onTabChange?: (tab: 'mine' | 'general') => void }) {
  const [tab, setTab] = useState<'mine' | 'general'>('mine');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
  const { showToast } = useCustomAlert();
  const { isOnline } = useOfflineSync();
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [productBrandMap, setProductBrandMap] = useState<Record<string, string>>({});
  const [myData, setMyData] = useState<DashboardData>({ views: 0, shares: 0, topV: [], topSh: [] });
  const [globalData, setGlobalData] = useState<DashboardData>({ views: 0, shares: 0, topV: [], topSh: [], brands: [], users: [] });
  const [isAdmin, setIsAdmin] = useState(false);

  const cleanText = (val: any) => String(val ?? '').replace(/^\$+/, '');

  useEffect(() => {
    onTabChange?.(tab);
    setExpandedCard(null); 
  }, [tab, onTabChange]);

  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { loadImages(); }, []);
  useEffect(() => { loadData(); }, [period, isOnline]);

  async function loadImages() {
    try {
      const rows = await getAllProducts();
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
    setLoading(true);
    let currentIsAdmin = isAdmin;
    try {
      const cachedMyData = await AsyncStorage.getItem(`@analytics_my_${period}`);
      const cachedGlobalData = await AsyncStorage.getItem(`@analytics_global_${period}`);

      const parsedMyData = cachedMyData ? JSON.parse(cachedMyData) : null;
      const parsedGlobalData = cachedGlobalData ? JSON.parse(cachedGlobalData) : null;

      if (parsedMyData && isMounted.current) setMyData(parsedMyData);
      if (parsedGlobalData && isMounted.current) setGlobalData(parsedGlobalData);
      if (parsedMyData && parsedGlobalData && isMounted.current) {
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

      const pDate = getPeriodDate(period);
      const prevPDate = getPrevPeriodDate(period);

      let qMy = supabase.from('producto_analytics').select('modelo,marca,sku,action,user_email,created_at').eq('user_email', user.email).order('created_at', { ascending: false }).limit(50000);
      if (prevPDate) qMy = qMy.gte('created_at', prevPDate);
      else if (pDate) qMy = qMy.gte('created_at', pDate);
      
      const { data: myCur } = await qMy;
      const my = myCur || [];

      const process = (items: any[], limit: number, brandLimit: number = 5): DashboardData => {
        let currItems = items;
        let prevItems: any[] = [];
        
        if (pDate && prevPDate) {
          currItems = items.filter(d => d.created_at >= pDate);
          prevItems = items.filter(d => d.created_at >= prevPDate && d.created_at < pDate);
        } else if (pDate) {
          currItems = items.filter(d => d.created_at >= pDate);
        }

        const views = currItems.filter(d => d.action === 'view');
        const shares = currItems.filter(d => d.action === 'share_pdf' || d.action === 'share_image');
        const prevViews = prevItems.filter(d => d.action === 'view');
        const prevShares = prevItems.filter(d => d.action === 'share_pdf' || d.action === 'share_image');

        return {
          views: views.length, 
          shares: shares.length,
          prevViews: prevViews.length,
          prevShares: prevShares.length,
          topV: countByKey(views, i => i.sku || i.modelo, limit),
          topSh: countByKey(shares, i => i.sku || i.modelo, limit),
          brands: countByKey(currItems, i => productBrandMap[i.sku || i.modelo] || i.marca, brandLimit)
        };
      };

      const finalMyData = process(my, 5, 5);
      if (isMounted.current) setMyData(finalMyData);
      AsyncStorage.setItem(`@analytics_my_all`, JSON.stringify(finalMyData));

      if (currentIsAdmin) {
        let qAll = supabase.from('producto_analytics').select('modelo,marca,sku,action,user_email,created_at').order('created_at', { ascending: false }).limit(50000);
        if (prevPDate) qAll = qAll.gte('created_at', prevPDate);
        else if (pDate) qAll = qAll.gte('created_at', pDate);
        
        const { data: allData } = await qAll;
        const all = allData || [];

        const gd = process(all, 10, 8);
        let currGlobal = all;
        if (pDate) currGlobal = all.filter(d => d.created_at >= pDate);
        gd.users = countByKey(currGlobal.filter(i => i.user_email !== 'offline_user'), i => i.user_email, 8).map((u: any) => ({ ...u, user_email: u.user_email, modelo: u.user_email }));
        
        if (isMounted.current) setGlobalData(gd);
        AsyncStorage.setItem(`@analytics_global_${period}`, JSON.stringify(gd));
      }
    } catch (e: unknown) {
      Sentry.captureException(e);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  async function generatePdfReport() {
    setLoading(true);
    try {
      const d = tab === 'mine' || !isAdmin ? myData : globalData;
      const pLabel = period === 'today' ? 'Hoy' : period === '7d' ? 'Últimos 7 días' : period === '30d' ? 'Últimos 30 días' : 'Todo el tiempo';
      
      const renderList = (items: any[], max: number, type: string) => {
         return (items || []).slice(0, 10).map((i: any, idx: number) => {
           const w = max > 0 ? Math.max(5, (i.count / max) * 100) : 0;
           const rawName = type === 'marcas' ? (productBrandMap[i.sku || i.modelo] || i.marca) : type === 'usuarios' ? i.user_email : (i.modelo || i.marca || 'Desc.');
           let name = cleanText(rawName);
           const color = type === 'vistas' ? '#007db8' : type === 'compartidos' ? '#0D8A39' : type === 'marcas' ? '#F37021' : '#6A1B9A';
           
           let imgTag = '';
           if (type === 'usuarios') {
             imgTag = `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color.replace('#','')}&color=fff" class="item-img" style="border-radius:14px;">`;
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

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        @page { size: A4 portrait; margin: 6mm; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background: white; padding: 0; }
        .a4-page { width: 100%; height: 100%; padding: 10px 15px; display: flex; flex-direction: column; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0D8A39; padding-bottom: 6px; margin-bottom: 10px; }
        .header-title { font-size: 18px; font-weight: 800; color: #1A2530; margin-bottom: 2px; }
        .header-subtitle { font-size: 11px; font-weight: 600; color: #6B778C; }
        .logo { font-size: 18px; font-weight: 800; color: #0D8A39; letter-spacing: -1px; }
        .kpi-row { display: flex; gap: 10px; margin-bottom: 10px; }
        .kpi-card { flex: 1; background: #F4F6F8; border-radius: 6px; padding: 8px; text-align: center; border: 1px solid #DFE1E6; }
        .kpi-title { font-size: 9px; font-weight: 600; color: #6B778C; text-transform: uppercase; margin-bottom: 4px; }
        .kpi-val { font-size: 22px; font-weight: 800; }
        .chart-box { background: #F4F6F8; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; height: 75px; border: 1px solid #DFE1E6; display: flex; flex-direction: column; }
        .grid-2x2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex: 1; min-height: 0; }
        .list-card { background: #FFFFFF; border: 1px solid #DFE1E6; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; }
        .list-title { font-size: 11px; font-weight: 700; color: #1A2530; border-bottom: 1px solid #DFE1E6; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; }
        .list-items { display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .item { display: flex; align-items: center; gap: 6px; }
        .item-rank { font-size: 9px; font-weight: 700; color: #6B778C; width: 10px; text-align: center; }
        .item-img { width: 18px; height: 18px; border-radius: 3px; background: #E8ECF0; object-fit: contain; }
        .item-info { flex: 1; min-width: 0; }
        .item-name { font-size: 9px; font-weight: 600; color: #1A2530; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .progress-track { height: 3px; background: #E8ECF0; border-radius: 1.5px; }
        .progress-fill { height: 100%; border-radius: 1.5px; }
        .item-count { font-size: 10px; font-weight: 800; width: 30px; text-align: right; }
        .footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #DFE1E6; text-align: center; font-size: 8px; color: #6B778C; }
    </style>
</head>
<body>
    <div class="a4-page">
        <div class="header">
            <div>
                <div class="header-title">Reporte de Estadísticas - ${tab === 'mine' ? 'Mi Actividad' : 'General'}</div>
                <div class="header-subtitle">Vista General | ${pLabel}</div>
            </div>
            <div class="logo">COMAGRO</div>
        </div>
        <div class="kpi-row">
            <div class="kpi-card"><div class="kpi-title">Vistas Totales</div><div class="kpi-val" style="color: #007db8;">${cleanText(d.views)}</div></div>
            <div class="kpi-card"><div class="kpi-title">Compartidos</div><div class="kpi-val" style="color: #0D8A39;">${cleanText(d.shares)}</div></div>
            ${tab === 'general' ? `<div class="kpi-card"><div class="kpi-title">Usuarios Activos</div><div class="kpi-val" style="color: #6A1B9A;">${d.users?.length || 0}</div></div>` : ''}
        </div>
        <div class="grid-2x2">
            ${d.topV.length > 0 ? `<div class="list-card"><div class="list-title">Top Productos Más Vistos</div><div class="list-items">${renderList(d.topV, maxV, 'vistas')}</div></div>` : ''}
            ${d.topSh.length > 0 ? `<div class="list-card"><div class="list-title">Top Productos Compartidos</div><div class="list-items">${renderList(d.topSh, maxSh, 'compartidos')}</div></div>` : ''}
            ${d.brands && d.brands.length > 0 ? `<div class="list-card"><div class="list-title">Top Marcas</div><div class="list-items">${renderList(d.brands, maxB, 'marcas')}</div></div>` : ''}
            ${tab === 'general' && d.users && d.users.length > 0 ? `<div class="list-card"><div class="list-title">Top Usuarios</div><div class="list-items">${renderList(d.users, maxU, 'usuarios')}</div></div>` : ''}
        </div>
        <div class="footer">Generado automáticamente desde Comagro App</div>
    </div>
</body>
</html>`;

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
      setLoading(false);
    }
  }

  const data = tab === 'mine' || !isAdmin ? myData : globalData;

  const renderListItem = (item: any, max: number, type: 'vistas'|'compartidos'|'marcas'|'usuarios') => {
     const w = max > 0 ? Math.max(5, (item.count / max) * 100) : 0;
     const rawName = type === 'marcas' ? (productBrandMap[item.sku || item.modelo] || item.marca) : type === 'usuarios' ? item.user_email : (item.modelo || item.marca || 'Desc.');
     let name = cleanText(rawName);
     const color = type === 'vistas' ? COLORS.navy : type === 'compartidos' ? COLORS.green : type === 'marcas' ? '#F37021' : (COLORS.celeste || '#007db8');
     
     let imgSrc: any = null;
     if (type === 'usuarios') {
         imgSrc = { uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${(color||'').replace('#','')}&color=fff` };
         name = name.split('@')[0];
     } else if (type === 'marcas') {
         const marcaSlug = (name || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
         imgSrc = { uri: `${APP_CONSTANTS.LOGO_BASE_BRANDS_2025}${marcaSlug}.jpg` };
     } else {
         const modelSku = item.modelo || item.marca;
         imgSrc = imageMap[modelSku] ? { uri: imageMap[modelSku] } : { uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(name.substring(0,2))}&background=E8ECF0&color=1A2530` };
     }

     return (
        <TouchableOpacity 
           key={name + item.count + type} 
           style={s.listItem} 
           activeOpacity={0.7} 
           onPress={() => {
              if ((type === 'vistas' || type === 'compartidos') && navigation) navigation.navigate('ProductViewer', { sku: item.modelo || item.marca });
              if (type === 'usuarios' && onUserClick) onUserClick(item.user_email);
           }}
        >
            <Image source={imgSrc} style={[s.itemImg, type === 'usuarios' && s.itemAvatar, type === 'marcas' && s.itemBrand]} contentFit="contain" />
            <View style={s.itemInfo}>
                <Text style={s.itemName} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
                <View style={s.progressBg}>
                   <View style={[s.progressFill, { width: `${w}%`, backgroundColor: color }]} />
                </View>
            </View>
            <Text style={[s.itemCount, { color }]}>{cleanText(item.count)}</Text>
        </TouchableOpacity>
     );
  };

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <View style={s.tabs}>
           {isAdmin && (
               <>
                 <TouchableOpacity style={[s.tabBtn, tab === 'mine' && s.tabActive]} onPress={() => setTab('mine')}>
                   <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>Mi Actividad</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={[s.tabBtn, tab === 'general' && s.tabActive]} onPress={() => setTab('general')}>
                   <Text style={[s.tabText, tab === 'general' && s.tabTextActive]}>General</Text>
                 </TouchableOpacity>
               </>
           )}
           {!isAdmin && <Text style={[s.tabText, s.tabTextActive, { padding: 6, textAlign: 'center' }]}>Mis Estadísticas Personales</Text>}
        </View>
        <TouchableOpacity onPress={generatePdfReport} style={[s.pdfBtn, { opacity: loading ? 0.5 : 1 }]} disabled={loading}>
          <SvgIcon name="upload" size={14} color={COLORS.navy} />
          <Text style={s.pdfBtnText}>Reporte</Text>
        </TouchableOpacity>
      </View>

      <View style={s.filtersRow}>
         {['today', '7d', '30d', 'all'].map(p => (
            <TouchableOpacity key={p} style={[s.filterPill, period === p && s.filterPillActive]} onPress={() => setPeriod(p as any)}>
               <Text style={[s.filterPillText, period === p && s.filterPillTextActive]}>
                  {p === 'today' ? 'Hoy' : p === '7d' ? '7 Días' : p === '30d' ? '30 Días' : 'Todo'}
               </Text>
            </TouchableOpacity>
         ))}
      </View>

      {loading && !data.views ? (
        <ActivityIndicator size="large" color={COLORS.navy} style={s.loader} />
      ) : (
        <ScrollView style={s.contentArea} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={s.rowTotals}>
             <View style={[s.cardTotal, s.cardTotalViews]}>
                <Text style={s.cardTitleLight}>Vistas Totales</Text>
                <View style={s.kpiRow}>
                  <Text style={s.totalValueLight}>{cleanText(data.views)}</Text>
                  {period !== 'all' && (
                    <Text style={[s.trendTextLight, { color: (data.views >= (data.prevViews || 0)) ? '#81C784' : '#FF8A80' }]}>
                      {getTrend(data.views, data.prevViews || 0)}
                    </Text>
                  )}
                </View>
             </View>
             <View style={[s.cardTotal, s.cardTotalShares]}>
                <Text style={s.cardTitleLight}>Compartidos</Text>
                <View style={s.kpiRow}>
                  <Text style={s.totalValueLight}>{cleanText(data.shares)}</Text>
                  {period !== 'all' && (
                    <Text style={[s.trendTextLight, { color: (data.shares >= (data.prevShares || 0)) ? '#81C784' : '#FF8A80' }]}>
                      {getTrend(data.shares, data.prevShares || 0)}
                    </Text>
                  )}
                </View>
             </View>
          </View>

          {/* Tarjeta Historial de Uso / Gráfica SVG */}
          <View style={s.cardChart}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={s.cardTitle}>Historial de Uso</Text>
              <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, fontWeight: '700' }}>
                {cleanText(data.views)} vistas totales
              </Text>
            </View>
            
            <View style={{ height: 75, width: '100%', marginVertical: 4 }}>
              <Svg viewBox="-12 -16 324 82" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                <Defs>
                  <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={COLORS.celeste || '#007DB8'} stopOpacity="0.35"/>
                    <Stop offset="100%" stopColor={COLORS.celeste || '#007DB8'} stopOpacity="0"/>
                  </LinearGradient>
                </Defs>
                
                <Line x1="0" y1="12" x2="300" y2="12" stroke="#E8ECF0" strokeWidth="1" strokeDasharray="3,3" />
                <Line x1="0" y1="32" x2="300" y2="32" stroke="#E8ECF0" strokeWidth="1" strokeDasharray="3,3" />
                
                <Path d="M0,52 L0,35 Q40,15 80,25 T160,10 T240,22 T300,14 L300,52 Z" fill="url(#chartGrad)"/>
                <Path d="M0,35 Q40,15 80,25 T160,10 T240,22 T300,14" fill="none" stroke={COLORS.celeste || '#007DB8'} strokeWidth="2.5" strokeLinecap="round" />
                
                <Circle cx="0" cy="35" r="4" fill="#ffffff" stroke={COLORS.celeste || '#007DB8'} strokeWidth="2"/>
                <Circle cx="160" cy="10" r="4" fill="#ffffff" stroke={COLORS.celeste || '#007DB8'} strokeWidth="2"/>
                <Circle cx="300" cy="14" r="4" fill="#ffffff" stroke={COLORS.celeste || '#007DB8'} strokeWidth="2"/>
              </Svg>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.navy, fontWeight: '700' }}>
                  {Math.round(data.views * 0.25)} vistas
                </Text>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 9, color: COLORS.gray4 }}>
                  {period === 'today' ? '00:00h' : period === '7d' ? 'Hace 7d' : period === '30d' ? 'Hace 30d' : 'Inicio (60d)'}
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.navy, fontWeight: '700' }}>
                  Pico: {Math.max(data.views, Math.round(data.views * 0.65))} vistas
                </Text>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 9, color: COLORS.gray4 }}>
                  {period === 'today' ? '12:00h' : period === '7d' ? 'Hace 3d' : period === '30d' ? 'Hace 15d' : 'Hace 30d'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.navy, fontWeight: '700' }}>
                  {data.views} vistas
                </Text>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 9, color: COLORS.navy, fontWeight: '700' }}>Hoy</Text>
              </View>
            </View>
          </View>

          {/* Renderizado Condicional: Mi Actividad vs General */}
          {tab === 'mine' ? (
             <View style={{ gap: 12, marginTop: 12 }}>
                 <View style={s.row}>
                     <View style={s.cardList}>
                        <Text style={s.cardTitle}>Más Vistos</Text>
                        <View style={s.listContainer}>
                           {data.topV.slice(0,5).map(it => renderListItem(it, data.topV[0]?.count || 1, 'vistas'))}
                        </View>
                     </View>
                     <View style={s.cardList}>
                        <Text style={s.cardTitle}>Más Compartidos</Text>
                        <View style={s.listContainer}>
                           {data.topSh.slice(0,5).map(it => renderListItem(it, data.topSh[0]?.count || 1, 'compartidos'))}
                        </View>
                     </View>
                 </View>
                 <View style={s.cardListFull}>
                    <Text style={s.cardTitle}>Top Marcas</Text>
                    <View style={s.listContainer}>
                       {data.brands?.slice(0,5).map((it: any) => renderListItem(it, data.brands?.[0]?.count || 1, 'marcas'))}
                    </View>
                 </View>
             </View>
          ) : (
             <View style={{ gap: 12, marginTop: 12 }}>
                 <View style={s.row}>
                     <View style={s.cardList}>
                        <Text style={s.cardTitle}>Más Vistos</Text>
                        <View style={s.listContainer}>
                           {data.topV.slice(0,5).map(it => renderListItem(it, data.topV[0]?.count || 1, 'vistas'))}
                        </View>
                     </View>
                     <View style={s.cardList}>
                        <Text style={s.cardTitle}>Más Compartidos</Text>
                        <View style={s.listContainer}>
                           {data.topSh.slice(0,5).map(it => renderListItem(it, data.topSh[0]?.count || 1, 'compartidos'))}
                        </View>
                     </View>
                  </View>

                  <View style={s.row}>
                     <View style={s.cardList}>
                        <Text style={s.cardTitle}>Top Marcas</Text>
                        <View style={s.listContainer}>
                           {data.brands?.slice(0,5).map((it: any) => renderListItem(it, data.brands?.[0]?.count || 1, 'marcas'))}
                        </View>
                     </View>
                     <View style={s.cardList}>
                       <Text style={s.cardTitle}>Usuarios Activos</Text>
                       <View style={s.listContainer}>
                          {data.users && data.users.length > 0 ? 
                             data.users.slice(0,5).map((it: any) => renderListItem(it, data.users?.[0]?.count || 1, 'usuarios')) 
                             : <Text style={{fontSize: 10, color: COLORS.gray3, fontStyle: 'italic', textAlign: 'center', marginTop: 10}}>Sin datos aún</Text>
                          }
                       </View>
                     </View>
                  </View>
             </View>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 },
  tabs: { flex: 1, flexDirection: 'row', backgroundColor: '#E8ECF0', borderRadius: 8, padding: 3, marginRight: 10 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: COLORS.white, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.gray4 },
  tabTextActive: { color: COLORS.navy, fontWeight: '700' },
  
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8ECF0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  pdfBtnText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, fontWeight: '600' },

  filtersRow: { flexDirection: 'row', gap: 8, marginBottom: 14, paddingHorizontal: 16 },
  filterPill: { flex: 1, paddingVertical: 8, backgroundColor: '#E8ECF0', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  filterPillActive: { backgroundColor: COLORS.navy },
  filterPillText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textAlign: 'center' },
  filterPillTextActive: { color: COLORS.white, fontWeight: '700' },
  loader: { marginTop: 40 },
  
  contentArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 30 },
  rowTotals: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  row: { flexDirection: 'row', gap: 12 },
  
  cardTotal: { flex: 1, borderRadius: 12, padding: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3 },
  cardTotalViews: { backgroundColor: COLORS.navy },
  cardTotalShares: { backgroundColor: COLORS.celeste || '#007DB8' },

  cardChart: { backgroundColor: COLORS.white, borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  
  cardTitleLight: { fontFamily: FONTS.bodySemi, fontSize: 11, color: 'rgba(255, 255, 255, 0.85)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  totalValueLight: { fontFamily: FONTS.heading, fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  trendTextLight: { fontFamily: FONTS.bodySemi, fontSize: 12, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  
  cardList: { flex: 1, backgroundColor: COLORS.white, borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  cardListFull: { width: '100%', backgroundColor: COLORS.white, borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderWidth: 1, borderColor: '#E8ECF0' },
  cardTitle: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },
  
  listContainer: { gap: 8 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemImg: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#F0F4F8' },
  itemAvatar: { borderRadius: 12 },
  itemBrand: { borderRadius: 4, borderWidth: 1, borderColor: '#eee' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.navy, marginBottom: 3 },
  itemCount: { fontFamily: FONTS.heading, fontSize: 11, fontWeight: '800', width: 28, textAlign: 'right' },
  progressBg: { height: 4, backgroundColor: '#E8ECF0', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
