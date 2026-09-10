import * as Sentry from '@sentry/react-native';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { supabase } from '../supabase';
import { syncAnalyticsQueue } from '../utils/analyticsSync';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';
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

function ProgressBar({ value, max, color }: { value: number, max: number, color: string }) {
  const w = max > 0 ? Math.max(8, (value / max) * 100) : 0;
  return (
    <View style={s.progressBarTrack}>
      <View style={[s.progressBarFill, { width: `${w}%`, backgroundColor: color }]} />
    </View>
  );
}

function MiniBar({ label, count, max, color }: { label: string, count: number, max: number, color: string }) {
  const w = max > 0 ? Math.max(5, (count / max) * 100) : 0;
  return (
    <View style={s.miniBarWrap}>
      <View style={s.miniBarTop}>
        <Text style={s.miniBarLabel} numberOfLines={1}>{label}</Text>
        <Text style={s.miniBarCount}>{count}</Text>
      </View>
      <View style={s.miniBarTrack}>
        <View style={[s.miniBarFill, { width: `${w}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function RankItem({ item, maxCount, color, imageMap, navigation }: { item: AnalyticsRankItem, maxCount: number, color: string, imageMap: Record<string, string>, navigation: any }) {
  const modelOrSku = item.modelo || item.marca || '';
  const imgUrl = imageMap[modelOrSku] || null;
  const [sessionKey] = useState(() => Date.now().toString());
  const logoUrl = `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\s+/g, '_')}.jpg?v=${sessionKey}`;
  const handleProductPress = (it: AnalyticsRankItem) => {
    navigation.navigate('ProductViewer', { sku: it.modelo || it.marca });
  };
  return (
    <TouchableOpacity style={s.rankItem} activeOpacity={0.7} onPress={() => handleProductPress(item)}>
      <Image source={{ uri: imgUrl || logoUrl }} style={s.rankImg} contentFit="contain" />
      <View style={s.rankItemTextContainer}>
        <Text style={s.rankModelo} numberOfLines={1}>{item.modelo}</Text>
        <Text style={s.rankMarca}>{item.marca}</Text>
        <ProgressBar value={item.count} max={maxCount} color={color} />
      </View>
      <Text style={[s.rankCount, { color }]}>{item.count}</Text>
    </TouchableOpacity>
  );
}

function BrandBar({ marca, count, maxCount }: { marca: string, count: number, maxCount: number }) {
  const w = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 0;
  return (
    <View style={s.brandRow}>
      <Text style={s.brandName} numberOfLines={1}>{marca}</Text>
      <View style={s.brandProgressBarTrack}>
        <View style={[s.brandProgressBarFill, { width: `${w}%` }]} />
      </View>
      <Text style={s.brandCount}>{count}</Text>
    </View>
  );
}

function UserBar({ email, count, maxCount, onUserClick }: { email: string, count: number, maxCount: number, onUserClick?: (e: string) => void }) {
  const w = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 0;
  const short = email.split('@')[0];
  return (
    <TouchableOpacity style={s.brandRow} activeOpacity={0.7} onPress={() => onUserClick && onUserClick(email)}>
      <Text style={s.brandName} numberOfLines={1}>{short}</Text>
      <View style={s.brandProgressBarTrack}>
        <View style={[s.userProgressBarFill, { width: `${w}%` }]} />
      </View>
      <Text style={s.brandCount}>{count}</Text>
    </TouchableOpacity>
  );
}

function AnalyticsCard({ title, items, color, iconName, emptyText, isExpanded, onExpand, isWide, type, imageMap, navigation, onUserClick }: any) {
  if (!items) return null;
  const max = items[0]?.count || 1;
  return (
    <TouchableOpacity style={[s.gridCard, (isWide || isExpanded) && s.gridCardWide]} onPress={onExpand} activeOpacity={0.8}>
      <View style={s.gridCardHeader}>
        <View style={[s.cardIconBg, { backgroundColor: color + '1A' }]}>
          <SvgIcon name={iconName} size={16} color={color} />
        </View>
        <Text style={s.cardChevron}>{isExpanded ? '∨' : '›'}</Text>
      </View>
      <Text style={s.gridCardTitle}>{title}</Text>
      
      <View style={s.gridCardContent}>
        {!isExpanded ? (
          items.length === 0 ? <Text style={s.cardEmpty}>{emptyText}</Text> : (
            <View style={s.miniBarsContainer}>
              {items.slice(0, 3).map((it: any, i: number) => (
                <MiniBar key={i} label={it.modelo || it.user_email || it.marca || 'Desc.'} count={it.count} max={max} color={color} />
              ))}
            </View>
          )
        ) : (
          items.length === 0 ? <Text style={s.cardEmpty}>{emptyText}</Text> : (
            <View style={s.expandedList}>
              {items.map((it: any, i: number) => {
                if (type === 'product') return <RankItem key={i} item={it} maxCount={max} color={color} imageMap={imageMap} navigation={navigation} />;
                if (type === 'brand') return <BrandBar key={i} marca={it.marca || ''} count={it.count} maxCount={max} />;
                if (type === 'user') return <UserBar key={i} email={it.user_email} count={it.count} maxCount={max} onUserClick={onUserClick} />;
                return null;
              })}
            </View>
          )
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardAnalytics({ navigation, onUserClick, onTabChange }: { navigation: any, onUserClick?: (email: string) => void, onTabChange?: (tab: 'mine' | 'general') => void }) {
  const [tab, setTab] = useState<'mine' | 'general'>('mine');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
  const { showToast } = useCustomAlert();
  const { isOnline } = useOfflineSync();
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [myData, setMyData] = useState<DashboardData>({ views: 0, shares: 0, topV: [], topSh: [] });
  const [globalData, setGlobalData] = useState<DashboardData>({ views: 0, shares: 0, topV: [], topSh: [], brands: [], users: [] });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    onTabChange?.(tab);
    setExpandedCard(null); // Cerrar tarjetas al cambiar pestaña
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
      rows.forEach((r: any) => {
        const sku = r.modelo;
        const img = r.imagen || r.imagenOriginal;
        if (sku && img) m[sku] = img;
      });
      if (isMounted.current) setImageMap(m);
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
          brands: countByKey(currItems, i => i.marca, brandLimit) // Opción A: cálculo sobre mis marcas
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
           let name = type === 'marcas' ? i.marca : type === 'usuarios' ? i.user_email : (i.modelo || i.marca || 'Desc.');
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
                <div class="item-count" style="color: ${color};">${i.count}</div>
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
        @page { size: A4 portrait; margin: 10mm; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { display: flex; justify-content: center; padding: 0; background: white; }
        .a4-page { width: 21cm; height: 29.7cm; padding: 1cm 1.5cm; display: flex; flex-direction: column; overflow: hidden; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0D8A39; padding-bottom: 10px; margin-bottom: 15px; }
        .header-title { font-size: 20px; font-weight: 800; color: #1A2530; margin-bottom: 2px; }
        .header-subtitle { font-size: 12px; font-weight: 600; color: #6B778C; }
        .logo { font-size: 20px; font-weight: 800; color: #0D8A39; letter-spacing: -1px; }
        .kpi-row { display: flex; gap: 15px; margin-bottom: 15px; }
        .kpi-card { flex: 1; background: #F4F6F8; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #DFE1E6; }
        .kpi-title { font-size: 10px; font-weight: 600; color: #6B778C; text-transform: uppercase; margin-bottom: 6px; }
        .kpi-val { font-size: 28px; font-weight: 800; }
        .chart-box { background: #F4F6F8; border-radius: 8px; padding: 10px 15px; margin-bottom: 15px; height: 90px; border: 1px solid #DFE1E6; display: flex; flex-direction: column; }
        .grid-2x2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; flex: 1; min-height: 0; }
        .list-card { background: #FFFFFF; border: 1px solid #DFE1E6; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; }
        .list-title { font-size: 12px; font-weight: 700; color: #1A2530; border-bottom: 1px solid #DFE1E6; padding-bottom: 8px; margin-bottom: 10px; text-transform: uppercase; }
        .list-items { display: flex; flex-direction: column; gap: 6px; flex: 1; justify-content: space-between; }
        .item { display: flex; align-items: center; gap: 8px; }
        .item-rank { font-size: 10px; font-weight: 700; color: #6B778C; width: 12px; text-align: center; }
        .item-img { width: 22px; height: 22px; border-radius: 4px; background: #E8ECF0; object-fit: contain; }
        .item-info { flex: 1; min-width: 0; }
        .item-name { font-size: 10px; font-weight: 600; color: #1A2530; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .progress-track { height: 3px; background: #E8ECF0; border-radius: 1.5px; }
        .progress-fill { height: 100%; border-radius: 1.5px; }
        .item-count { font-size: 11px; font-weight: 800; width: 35px; text-align: right; }
        .footer { margin-top: auto; padding-top: 10px; border-top: 1px solid #DFE1E6; text-align: center; font-size: 9px; color: #6B778C; }
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
            <div class="kpi-card"><div class="kpi-title">Vistas Totales</div><div class="kpi-val" style="color: #007db8;">${d.views}</div></div>
            <div class="kpi-card"><div class="kpi-title">Compartidos</div><div class="kpi-val" style="color: #0D8A39;">${d.shares}</div></div>
            ${tab === 'general' ? `<div class="kpi-card"><div class="kpi-title">Usuarios Activos</div><div class="kpi-val" style="color: #6A1B9A;">${d.users?.length || 0}</div></div>` : ''}
        </div>
        <div class="chart-box">
            <div class="kpi-title" style="margin-bottom: 2px;">Historial de Uso (${pLabel})</div>
            <svg viewBox="0 0 500 70" preserveAspectRatio="none" style="width: 100%; height: 100%;">
                <defs>
                    <linearGradient id="gpdf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#007db8" stop-opacity="0.2"/><stop offset="100%" stop-color="#007db8" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <line x1="0" y1="15" x2="500" y2="15" stroke="#E8ECF0" stroke-width="1" stroke-dasharray="3,3" />
                <line x1="0" y1="35" x2="500" y2="35" stroke="#E8ECF0" stroke-width="1" stroke-dasharray="3,3" />
                <path d="M0,50 L0,40 Q50,20 100,30 T200,15 T300,25 T400,10 T500,20 L500,50 Z" fill="url(#gpdf)"/>
                <path d="M0,40 Q50,20 100,30 T200,15 T300,25 T400,10 T500,20" fill="none" stroke="#007db8" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="0" cy="40" r="3" fill="#fff" stroke="#007db8" stroke-width="2"/>
                <circle cx="500" cy="20" r="3" fill="#fff" stroke="#007db8" stroke-width="2"/>
                <text x="0" y="65" font-size="10" fill="#6B778C" text-anchor="start">Inicio</text>
                <text x="500" y="65" font-size="10" fill="#6B778C" text-anchor="end">Fin</text>
            </svg>
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
     let name = type === 'marcas' ? item.marca : type === 'usuarios' ? item.user_email : (item.modelo || item.marca || 'Desc.');
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
           key={name + item.count} 
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
            <Text style={[s.itemCount, { color }]}>{item.count}</Text>
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
           {!isAdmin && <Text style={[s.tabText, s.tabTextActive, {padding: 6}]}>Mis Estadísticas Personales</Text>}
        </View>
        <TouchableOpacity onPress={generatePdfReport} style={[s.pdfIcon, { opacity: loading ? 0.5 : 1 }]} disabled={loading}>
          <SvgIcon name="upload" size={16} color={COLORS.navy} />
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
        <ScrollView style={s.contentArea} contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          <View style={s.rowTotals}>
             <View style={s.cardTotal}>
                <Text style={s.cardTitle}>Vistas Totales</Text>
                <Text style={s.totalValue}>{data.views}</Text>
             </View>
             <View style={s.cardTotal}>
                <Text style={s.cardTitle}>Compartidos</Text>
                <Text style={s.totalValue}>{data.shares}</Text>
             </View>
          </View>

          <View style={s.cardChart}>
            <Text style={[s.cardTitle, { marginBottom: 2 }]}>Historial de Uso</Text>
            <Svg viewBox="0 0 300 70" preserveAspectRatio="none" style={s.svgChart}>
                <Defs>
                    <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={COLORS.celeste || '#007db8'} stopOpacity="0.3"/>
                        <Stop offset="100%" stopColor={COLORS.celeste || '#007db8'} stopOpacity="0"/>
                    </LinearGradient>
                </Defs>
                <Line x1="0" y1="15" x2="300" y2="15" stroke="#E8ECF0" strokeWidth="1" strokeDasharray="2,2" />
                <Line x1="0" y1="35" x2="300" y2="35" stroke="#E8ECF0" strokeWidth="1" strokeDasharray="2,2" />
                <Path d="M0,50 L0,40 Q30,20 60,30 T120,15 T180,25 T240,10 T300,20 L300,50 Z" fill="url(#grad)"/>
                <Path d="M0,40 Q30,20 60,30 T120,15 T180,25 T240,10 T300,20" fill="none" stroke={COLORS.celeste || '#007db8'} strokeWidth="2" strokeLinecap="round" />
                <Circle cx="0" cy="40" r="2.5" fill="#fff" stroke={COLORS.celeste || '#007db8'} strokeWidth="1.5"/>
                <Circle cx="300" cy="20" r="2.5" fill="#fff" stroke={COLORS.celeste || '#007db8'} strokeWidth="1.5"/>
                <SvgText x="0" y="65" fontSize="9" fill="#6B778C" textAnchor="start">{period === 'today' ? '00:00' : period === '7d' ? '-7 Días' : period === '30d' ? '-30 Días' : 'Inicio'}</SvgText>
                <SvgText x="300" y="65" fontSize="9" fill="#6B778C" textAnchor="end">{period === 'today' ? 'Ahora' : 'Hoy'}</SvgText>
            </Svg>
          </View>

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
             {tab === 'general' && data.users && data.users.length > 0 ? (
                <View style={s.cardList}>
                   <Text style={s.cardTitle}>Usuarios Activos</Text>
                   <View style={s.listContainer}>
                      {data.users.slice(0,5).map((it: any) => renderListItem(it, data.users?.[0]?.count || 1, 'usuarios'))}
                   </View>
                </View>
             ) : (
                <View style={[s.cardList, {backgroundColor: 'transparent', elevation: 0, borderWidth: 0, shadowOpacity: 0}]} />
             )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingBottom: 5 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 10 },
  tabs: { flexDirection: 'row', backgroundColor: '#E8ECF0', borderRadius: 6, padding: 2 },
  tabBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 4 },
  tabActive: { backgroundColor: COLORS.white, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4 },
  tabTextActive: { color: COLORS.navy, fontWeight: '700' },
  pdfIcon: { width: 30, height: 30, backgroundColor: '#E8ECF0', borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  filtersRow: { flexDirection: 'row', gap: 6, marginBottom: 10, paddingHorizontal: 10 },
  filterPill: { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: '#E8ECF0', borderRadius: 12 },
  filterPillActive: { backgroundColor: COLORS.navy },
  filterPillText: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4 },
  filterPillTextActive: { color: COLORS.white },
  loader: { marginTop: 40 },
  contentArea: { flex: 1, flexDirection: 'column', gap: 10, paddingHorizontal: 10, overflow: 'hidden' },
  rowTotals: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', gap: 10, flex: 1.2 },
  cardTotal: { flex: 1, backgroundColor: COLORS.white, borderRadius: 10, padding: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  cardChart: { height: 90, backgroundColor: COLORS.white, borderRadius: 10, padding: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  cardList: { flex: 1, backgroundColor: COLORS.white, borderRadius: 10, padding: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  cardTitle: { fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.gray4, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  totalValue: { fontFamily: FONTS.heading, fontSize: 20, fontWeight: '800', color: COLORS.navy },
  svgChart: { width: '100%', height: '100%', marginTop: 2 },
  listContainer: { flex: 1, justifyContent: 'space-evenly', gap: 6 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemImg: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#F0F4F8' },
  itemAvatar: { borderRadius: 12 },
  itemBrand: { borderRadius: 6, borderWidth: 1, borderColor: '#eee' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: FONTS.bodySemi, fontSize: 9, color: COLORS.navy, marginBottom: 2 },
  itemCount: { fontFamily: FONTS.heading, fontSize: 10, fontWeight: '800', width: 25, textAlign: 'right' },
  progressBg: { height: 3, backgroundColor: '#E8ECF0', borderRadius: 1.5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 1.5 },
  // Legacy styles used by AnalyticsCard sub-components
  progressBarTrack: { flex: 1, height: 6, backgroundColor: '#E8ECF0', borderRadius: 3, marginHorizontal: 8 },
  progressBarFill: { height: 6, borderRadius: 3 },
  miniBarWrap: { width: '100%' },
  miniBarTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  miniBarLabel: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, flex: 1, paddingRight: 8 },
  miniBarCount: { fontFamily: FONTS.heading, fontSize: 12, fontWeight: '700', color: COLORS.navy },
  miniBarTrack: { height: 4, backgroundColor: '#E8ECF0', borderRadius: 2, width: '100%' },
  miniBarFill: { height: 4, borderRadius: 2 },
  miniBarsContainer: { gap: 8 },
  expandedList: { paddingTop: 4 },
  gridCard: { width: '48%', backgroundColor: COLORS.white, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  gridCardWide: { width: '100%' },
  gridCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardIconBg: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardChevron: { fontFamily: FONTS.heading, fontSize: 16, color: COLORS.gray4, fontWeight: 'bold' },
  gridCardTitle: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  gridCardContent: { minHeight: 40 },
  cardEmpty: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  rankItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F8FA', borderRadius: 8, padding: 8, marginBottom: 6 },
  rankImg: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff', marginRight: 8 },
  rankItemTextContainer: { flex: 1 },
  rankModelo: { fontFamily: FONTS.heading, fontSize: 13, fontWeight: '600', color: COLORS.navy },
  rankMarca: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.gray4 },
  rankCount: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingVertical: 4 },
  brandName: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.navy, width: 80 },
  brandCount: { fontFamily: FONTS.heading, fontSize: 13, fontWeight: '700', color: COLORS.navy, minWidth: 28, textAlign: 'right' },
  brandProgressBarTrack: { flex: 1, height: 8, backgroundColor: '#E8ECF0', borderRadius: 4, marginHorizontal: 8 },
  brandProgressBarFill: { height: 8, backgroundColor: COLORS.navy, borderRadius: 4 },
  userProgressBarFill: { height: 8, backgroundColor: COLORS.celeste || '#007db8', borderRadius: 4 },
});
