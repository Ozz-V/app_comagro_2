import * as Sentry from '@sentry/react-native';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
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
  if (p === '7d') return new Date(Date.now() - 7 * 86400000).toISOString();
  if (p === '30d') return new Date(Date.now() - 30 * 86400000).toISOString();
  return null;
}
function getPrevPeriodDate(p: string): string | null {
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

      let qMy = supabase.from('producto_analytics').select('modelo,marca,sku,action,user_email,created_at').eq('user_email', user.email).order('created_at', { ascending: false }).limit(2000);
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
        let qAll = supabase.from('producto_analytics').select('modelo,marca,sku,action,user_email,created_at').order('created_at', { ascending: false }).limit(2000);
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
      const d = tab === 'mine' ? myData : globalData;
      const label = tab === 'mine' ? 'Mi actividad' : 'General';
      const pLabel = period === '7d' ? 'Últimos 7 días' : period === '30d' ? 'Últimos 30 días' : 'Todo el tiempo';

      const renderBars = (items: any[], max: number, color: string) => items.map(i => {
        const w = max > 0 ? Math.max(5, (i.count / max) * 100) : 0;
        return `
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #333; margin-bottom: 2px;">
              <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${i.modelo || i.marca || i.user_email}</span>
              <span style="font-weight: bold; color: ${color};">${i.count}</span>
            </div>
            <div style="width: 100%; background: #E8ECF0; height: 6px; border-radius: 3px;">
              <div style="width: ${w}%; background: ${color}; height: 6px; border-radius: 3px;"></div>
            </div>
          </div>
        `;
      }).join('');

      const maxV = d.topV[0]?.count || 1;
      const maxSh = d.topSh[0]?.count || 1;

      const html = `
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #1a2530; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0D8A39; padding-bottom: 15px; }
            .title { font-size: 24px; font-weight: bold; color: #1a2530; margin: 0; }
            .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
            .kpi-container { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 15px; break-inside: avoid; page-break-inside: avoid; }
            .kpi-card { flex: 1; background: #F0F4F8; border-radius: 10px; padding: 15px; text-align: center; }
            .kpi-num { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
            .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; }
            .grid { display: flex; flex-wrap: wrap; gap: 20px; }
            .card { flex: 1; min-width: 45%; background: #fff; border: 1px solid #E8ECF0; border-radius: 10px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); break-inside: avoid; page-break-inside: avoid; margin-bottom: 5px; }
            .card-title { font-size: 14px; font-weight: bold; color: #1a2530; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">Reporte Ejecutivo - Comagro</h1>
            <p class="subtitle">Sección: <b>${label}</b> | Periodo: <b>${pLabel}</b> | Fecha: ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div class="kpi-container">
            <div class="kpi-card">
              <div class="kpi-num" style="color: #1a2530;">${d.views}</div>
              <div class="kpi-label">Vistas</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-num" style="color: #0D8A39;">${d.shares}</div>
              <div class="kpi-label">Compartidos</div>
            </div>
          </div>
          
          <div class="grid">
            ${d.topV.length > 0 ? '<div class="card"><div class="card-title" style="color: #1a2530;">Top Productos Vistos</div>' + renderBars(d.topV, maxV, '#1a2530') + '</div>' : ''}
            ${d.topSh.length > 0 ? '<div class="card"><div class="card-title" style="color: #0D8A39;">Top Productos Compartidos</div>' + renderBars(d.topSh, maxSh, '#0D8A39') + '</div>' : ''}
            ${d.brands && d.brands.length > 0 ? '<div class="card"><div class="card-title" style="color: #1a2530;">Marcas Más Consultadas</div>' + renderBars(d.brands, d.brands[0]?.count || 1, '#1a2530') + '</div>' : ''}
            ${tab === 'general' && d.users && d.users.length > 0 ? '<div class="card"><div class="card-title" style="color: #1a2530;">Usuarios Más Activos</div>' + renderBars(d.users, d.users[0]?.count || 1, '#1a2530') + '</div>' : ''}
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const isAv = await Sharing.isAvailableAsync();
      if(isAv) {
         await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Reporte Comagro' });
      } else {
         showToast('Compartir no disponible en este dispositivo.');
      }
    } catch(e: unknown) {
      showToast('Error generando PDF.');
      Sentry.captureException(e);
    } finally {
      setLoading(false);
    }
  }

  const data = tab === 'mine' || !isAdmin ? myData : globalData;
  const trendV = getTrend(data.views, data.prevViews || 0);
  const trendS = getTrend(data.shares, data.prevShares || 0);

  return (
    <View>
      <View style={s.topHeader}>
        {isAdmin ? (
          <View style={s.tabs}>
            <TouchableOpacity style={[s.tabBtn, tab === 'mine' && s.tabActive]} onPress={() => setTab('mine')}>
              <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>Mi actividad</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, tab === 'general' && s.tabActive]} onPress={() => setTab('general')}>
              <Text style={[s.tabText, tab === 'general' && s.tabTextActive]}>General (Empresa)</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.personalHeader}>
            <Text style={s.personalTitle}>Mis Estadísticas Personales</Text>
          </View>
        )}
        <TouchableOpacity onPress={generatePdfReport} style={[s.pdfBtn, { opacity: loading ? 0.5 : 1 }]} disabled={loading}>
          <SvgIcon name="upload" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.navy} style={s.loader} />
      ) : (
        <>
          <View style={s.heroContainer}>
            <View style={[s.heroCard, { backgroundColor: COLORS.navy }]}>
              {tab === 'general' && trendV !== '→' && trendV !== '' && <View style={s.trendBadge}><Text style={s.trendText}>{trendV}</Text></View>}
              <SvgIcon name="ojo" size={26} color="#fff" />
              <Text style={s.heroVal}>{data.views}</Text>
              <Text style={s.heroLbl}>VISTAS</Text>
            </View>
            <View style={[s.heroCard, { backgroundColor: COLORS.green }]}>
              {tab === 'general' && trendS !== '→' && trendS !== '' && <View style={s.trendBadge}><Text style={s.trendText}>{trendS}</Text></View>}
              <SvgIcon name="upload" size={26} color="#fff" />
              <Text style={s.heroVal}>{data.shares}</Text>
              <Text style={s.heroLbl}>COMPARTIDOS</Text>
            </View>
          </View>

          <View style={s.gridContainer}>
            <AnalyticsCard 
              title="Más vistos" iconName="ojo" color={COLORS.navy} type="product" items={data.topV} emptyText="Sin vistas"
              imageMap={imageMap} navigation={navigation} 
              isExpanded={expandedCard === 'vistas'} onExpand={() => setExpandedCard(expandedCard === 'vistas' ? null : 'vistas')} 
            />
            
            <AnalyticsCard 
              title="Más compartidos" iconName="upload" color={COLORS.green} type="product" items={data.topSh} emptyText="Sin compartidos"
              imageMap={imageMap} navigation={navigation} 
              isExpanded={expandedCard === 'compartidos'} onExpand={() => setExpandedCard(expandedCard === 'compartidos' ? null : 'compartidos')} 
            />

            {data.brands && data.brands.length > 0 && (
              <AnalyticsCard 
                title="Marcas más consultadas" iconName="chart" color={COLORS.celeste || '#007db8'} type="brand" items={data.brands} emptyText="Sin marcas"
                isExpanded={expandedCard === 'brands'} onExpand={() => setExpandedCard(expandedCard === 'brands' ? null : 'brands')} 
              />
            )}

            {tab === 'general' && isAdmin && data.users && data.users.length > 0 && (
              <AnalyticsCard 
                title="Usuarios más activos" iconName="usuarios" color={COLORS.navy} type="user" items={data.users} emptyText="Sin usuarios"
                onUserClick={onUserClick} isWide={true}
                isExpanded={expandedCard === 'users'} onExpand={() => setExpandedCard(expandedCard === 'users' ? null : 'users')} 
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  tabs: { flexDirection: 'row', backgroundColor: '#F0F4F8', borderRadius: 10, padding: 3, flex: 1 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: COLORS.white, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4 },
  tabTextActive: { fontFamily: FONTS.bodySemi, color: COLORS.navy, fontWeight: '700' },
  personalHeader: { backgroundColor: '#F0F4F8', borderRadius: 10, padding: 12, flex: 1, alignItems: 'center' },
  personalTitle: { fontFamily: FONTS.heading, fontSize: 16, color: COLORS.navy, fontWeight: '700' },
  pdfBtn: { backgroundColor: COLORS.navy, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  loader: { marginTop: 30, marginBottom: 30 },
  
  heroContainer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  heroCard: { flex: 1, borderRadius: 14, padding: 18, alignItems: 'center', position: 'relative', overflow: 'hidden' },
  trendBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  trendText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: '#fff' },
  heroVal: { fontFamily: FONTS.heading, fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 8, marginBottom: 2 },
  heroLbl: { fontFamily: FONTS.bodySemi, fontSize: 11, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5 },

  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: { width: '48%', backgroundColor: COLORS.white, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  gridCardWide: { width: '100%' },
  gridCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardIconBg: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardChevron: { fontFamily: FONTS.heading, fontSize: 16, color: COLORS.gray4, fontWeight: 'bold' },
  gridCardTitle: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  gridCardContent: { minHeight: 40 },
  cardEmpty: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  
  miniBarsContainer: { gap: 8 },
  miniBarWrap: { width: '100%' },
  miniBarTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  miniBarLabel: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, flex: 1, paddingRight: 8 },
  miniBarCount: { fontFamily: FONTS.heading, fontSize: 12, fontWeight: '700', color: COLORS.navy },
  miniBarTrack: { height: 4, backgroundColor: '#E8ECF0', borderRadius: 2, width: '100%' },
  miniBarFill: { height: 4, borderRadius: 2 },
  expandedList: { paddingTop: 4 },

  rankItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F8FA', borderRadius: 8, padding: 8, marginBottom: 6 },
  rankImg: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff', marginRight: 8 },
  rankItemTextContainer: { flex: 1 },
  rankModelo: { fontFamily: FONTS.heading, fontSize: 13, fontWeight: '600', color: COLORS.navy },
  rankMarca: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.gray4 },
  rankCount: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingVertical: 4 },
  brandName: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.navy, width: 80 },
  brandCount: { fontFamily: FONTS.heading, fontSize: 13, fontWeight: '700', color: COLORS.navy, minWidth: 28, textAlign: 'right' },
  progressBarTrack: { flex: 1, height: 6, backgroundColor: '#E8ECF0', borderRadius: 3, marginHorizontal: 8 },
  progressBarFill: { height: 6, borderRadius: 3 },
  brandProgressBarTrack: { flex: 1, height: 8, backgroundColor: '#E8ECF0', borderRadius: 4, marginHorizontal: 8 },
  brandProgressBarFill: { height: 8, backgroundColor: COLORS.navy, borderRadius: 4 },
  userProgressBarFill: { height: 8, backgroundColor: COLORS.celeste || '#007db8', borderRadius: 4 }
});
