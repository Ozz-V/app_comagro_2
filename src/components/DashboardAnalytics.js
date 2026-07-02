import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';
import StatCard from './StatCard';
import DirectoryModal from './DirectoryModal';
import UserProfileModal from './UserProfileModal';

const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';
const CACHE_KEY = 'comagro_productos_v3';

function getPeriodDate(p) {
  if (p === '7d') return new Date(Date.now() - 7 * 86400000).toISOString();
  if (p === '30d') return new Date(Date.now() - 30 * 86400000).toISOString();
  return null;
}
function getPrevPeriodDate(p) {
  if (p === '7d') return new Date(Date.now() - 14 * 86400000).toISOString();
  if (p === '30d') return new Date(Date.now() - 60 * 86400000).toISOString();
  return null;
}

function countByKey(items, keyFn, limit) {
  const m = {};
  items.forEach(i => {
    const k = keyFn(i);
    if (!k) return;
    if (!m[k]) m[k] = { ...i, count: 0 };
    m[k].count++;
  });
  return Object.values(m).sort((a, b) => b.count - a.count).slice(0, limit);
}

function getTrend(cur, prev) {
  if (prev === 0) return cur > 0 ? '↑' : '';
  const ch = ((cur - prev) / prev) * 100;
  if (ch > 5) return `↑${Math.round(ch)}%`;
  if (ch < -5) return `↓${Math.round(Math.abs(ch))}%`;
  return '→';
}

function ProgressBar({ value, max, color }) {
  const w = max > 0 ? Math.max(8, (value / max) * 100) : 0;
  return (
    <View style={{ flex: 1, height: 6, backgroundColor: '#E8ECF0', borderRadius: 3, marginHorizontal: 8 }}>
      <View style={{ width: `${w}%`, height: 6, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function RankItem({ item, maxCount, color, imageMap, navigation }) {
  const imgUrl = imageMap[item.sku || item.modelo] || null;
  const [sessionKey] = useState(() => Date.now().toString());
  const logoUrl = `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\\s+/g, '_')}.jpg?v=${sessionKey}`;
  return (
    <TouchableOpacity 
      style={s.rankItem} 
      activeOpacity={0.7}
      onPress={() => {
        if (navigation) {
          navigation.navigate('ProductViewer', { sku: item.sku || item.modelo });
        }
      }}
    >
      <Image source={{ uri: imgUrl || logoUrl }} style={s.rankImg} contentFit="contain" transition={200} />
      <View style={{ flex: 1 }}>
        <Text style={s.rankModelo} numberOfLines={1}>{item.modelo}</Text>
        <Text style={s.rankMarca}>{item.marca}</Text>
        <ProgressBar value={item.count} max={maxCount} color={color} />
      </View>
      <Text style={[s.rankCount, { color }]}>{item.count}</Text>
    </TouchableOpacity>
  );
}

function CollapsibleSection({ title, color, iconName, defaultExpanded = false, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={s.section}>
      <TouchableOpacity style={[s.sectionTitleRow, {justifyContent: 'space-between', paddingVertical: 4}]} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
           <SvgIcon name={iconName} size={16} color={color} />
           <Text style={[s.sectionTitle, { marginLeft: 6 }]}>{title}</Text>
        </View>
        <Text style={{color: COLORS.gray4, fontSize: 16}}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && children}
    </View>
  );
}

function RankSection({ title, items, color, imageMap, iconName, navigation, defaultExpanded = false }) {
  if (!items || items.length === 0) return (
    <CollapsibleSection title={title} color={color} iconName={iconName} defaultExpanded={defaultExpanded}>
      <Text style={s.empty}>Sin datos aún</Text>
    </CollapsibleSection>
  );
  const maxC = items[0]?.count || 1;
  return (
    <CollapsibleSection title={title} color={color} iconName={iconName} defaultExpanded={defaultExpanded}>
      {items.map((it, i) => <RankItem key={i} item={it} maxCount={maxC} color={color} imageMap={imageMap} navigation={navigation} />)}
    </CollapsibleSection>
  );
}

function BrandBar({ marca, count, maxCount }) {
  const w = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 0;
  return (
    <View style={s.brandRow}>
      <Text style={s.brandName} numberOfLines={1}>{marca}</Text>
      <View style={{ flex: 1, height: 8, backgroundColor: '#E8ECF0', borderRadius: 4, marginHorizontal: 8 }}>
        <View style={{ width: `${w}%`, height: 8, backgroundColor: COLORS.navy, borderRadius: 4 }} />
      </View>
      <Text style={s.brandCount}>{count}</Text>
    </View>
  );
}

function UserBar({ email, count, maxCount, onUserClick }) {
  const w = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 0;
  const short = email.split('@')[0];
  return (
    <TouchableOpacity style={s.brandRow} activeOpacity={0.7} onPress={() => onUserClick && onUserClick(email)}>
      <Text style={s.brandName} numberOfLines={1}>{short}</Text>
      <View style={{ flex: 1, height: 8, backgroundColor: '#E8ECF0', borderRadius: 4, marginHorizontal: 8 }}>
        <View style={{ width: `${w}%`, height: 8, backgroundColor: COLORS.celeste, borderRadius: 4 }} />
      </View>
      <Text style={s.brandCount}>{count}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardAnalytics({ navigation }) {
  const [tab, setTab] = useState('mine');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const { showToast } = useCustomAlert();
  const { isOnline } = useOfflineSync();
  const [imageMap, setImageMap] = useState({});
  const [myData, setMyData] = useState({ views: 0, shares: 0, topV: [], topSh: [] });
  const [globalData, setGlobalData] = useState({ views: 0, shares: 0, topV: [], topSh: [], brands: [], users: [] });

  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const [showDirectoryModal, setShowDirectoryModal] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  useEffect(() => { loadImages(); fetchDirectoryBackground(); }, []);
  useEffect(() => { loadData(); }, [period, isOnline]);

  async function fetchDirectoryBackground() {
    try {
      const cachedDir = await AsyncStorage.getItem('@directory_cache');
      if (cachedDir) setDirectoryUsers(JSON.parse(cachedDir));
      if (!isOnline) return;
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url, email, telefono').order('full_name');
      if (data && !error) {
        const valid = data.filter(u => u.full_name && u.full_name !== 'EMPTY');
        setDirectoryUsers(valid);
        await AsyncStorage.setItem('@directory_cache', JSON.stringify(valid));
      }
    } catch(e) {
      console.log('Error directory background', e);
    }
  }

  async function handleUserClick(email) {
    setShowUserModal(true);
    setLoadingUser(true);
    const cachedProfile = directoryUsers.find(u => u.email === email);
    setSelectedUser({ 
      email, 
      full_name: cachedProfile?.full_name || '', 
      telefono: cachedProfile?.telefono || '', 
      avatar_url: cachedProfile?.avatar_url || null, 
      stats: { views: 0, shares: 0, searches: 0 } 
    });
    
    if (!isOnline) {
      setLoadingUser(false);
      return;
    }
    
    try {
      const { data: profile, error: errProfile } = await supabase.from('profiles').select('id, full_name, avatar_url, telefono, email').eq('email', email).single();
      const { data: analyticsData, error: errAnalytics } = await supabase.from('producto_analytics').select('action').eq('user_email', email);
      
      if (errProfile || errAnalytics) throw new Error('Network fail');
      
      let v = 0, sh = 0, se = 0;
      if (analyticsData) {
        analyticsData.forEach(r => {
          if (r.action === 'view') v++;
          if (r.action === 'search') se++;
          if (r.action === 'share_pdf' || r.action === 'share_image') sh++;
        });
      }

      setSelectedUser({
        email,
        full_name: profile?.full_name || '',
        telefono: profile?.telefono || '',
        avatar_url: profile?.avatar_url || null,
        stats: { views: v, shares: sh }
      });
    } catch(e) {
      console.log('Error cargando usuario', e);
    } finally {
      setLoadingUser(false);
    }
  }

  async function loadImages() {
    try {
      const { getAllProducts } = require('../utils/database');
      const rows = await getAllProducts();
      const m = {};
      rows.forEach(r => {
        const sku = r.modelo;
        // imagenOriginal tiene la URL directa del servidor (sin manifest local)
        const img = r.imagen || r.imagenOriginal;
        if (sku && img) m[sku] = img;
      });
      setImageMap(m);
    } catch (e) {
      console.log('Error loadImages DB:', e);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const cachedMyData = await AsyncStorage.getItem(`@analytics_my_${period}`);
      const cachedGlobalData = await AsyncStorage.getItem(`@analytics_global_${period}`);
      
      let parsedMyData = cachedMyData ? JSON.parse(cachedMyData) : null;
      let parsedGlobalData = cachedGlobalData ? JSON.parse(cachedGlobalData) : null;
      
      if (parsedMyData) setMyData(parsedMyData);
      if (parsedGlobalData) setGlobalData(parsedGlobalData);
      if (parsedMyData && parsedGlobalData) {
        setLoading(false);
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      const qStr = await AsyncStorage.getItem('@analytics_queue');
      
      if (qStr && user) {
         const queue = JSON.parse(qStr);
         const mergeQueue = (data, isGlobal) => {
            if (!data) return data;
            const res = { ...data };
            res.topV = [...(res.topV || [])];
            res.topSh = [...(res.topSh || [])];
            res.topSe = [...(res.topSe || [])];
            
            queue.forEach(item => {
               if (!isGlobal && item.user_email !== user.email) return;
               
               const addTop = (list, it) => {
                  const ex = list.find(x => (x.sku || x.modelo) === (it.sku || it.modelo));
                  if (ex) ex.count = (ex.count || 0) + 1;
                  else list.push({ ...it, count: 1 });
               };
               
               if (item.action === 'view') { res.views++; addTop(res.topV, item); }
               else if (item.action.startsWith('share')) { res.shares++; addTop(res.topSh, item); }
            });
            
            res.topV.sort((a,b) => b.count - a.count);
            res.topSh.sort((a,b) => b.count - a.count);
            return res;
         };
         
         if (parsedMyData) setMyData(mergeQueue(parsedMyData, false));
         if (parsedGlobalData) setGlobalData(mergeQueue(parsedGlobalData, true));
      }
    } catch (_) {}

    if (!isOnline) {
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const pDate = getPeriodDate(period);
      const ppDate = getPrevPeriodDate(period);

      let q = supabase.from('producto_analytics').select('modelo,marca,sku,action,user_email,created_at').order('created_at', { ascending: false }).limit(10000);
      if (pDate) q = q.gte('created_at', pDate);
      const { data: cur, error: curError } = await q;
      if (curError) throw new Error(curError.message);
      const all = cur || [];

      let prev = [];
      if (pDate && ppDate) {
        const { data: p, error: pError } = await supabase.from('producto_analytics').select('action,user_email').gte('created_at', ppDate).lt('created_at', pDate).limit(10000);
        if (pError) throw new Error(pError.message);
        prev = p || [];
      }

      const my = all.filter(d => d.user_email === user.email);
      const myPrev = prev.filter(d => d.user_email === user.email);

      const process = (items, limit) => {
        const views = items.filter(d => d.action === 'view');
        const shares = items.filter(d => d.action === 'share_pdf' || d.action === 'share_image');
        return {
          views: views.length, shares: shares.length,
          topV: countByKey(views, i => i.sku || i.modelo, limit),
          topSh: countByKey(shares, i => i.sku || i.modelo, limit),
        };
      };

      const finalMyData = process(my, 5);
      setMyData(finalMyData);
      AsyncStorage.setItem(`@analytics_my_all`, JSON.stringify(finalMyData));

      const gd = process(all, 10);
      gd.brands = countByKey(all, i => i.marca, 8);
      gd.users = countByKey(all.filter(i => i.user_email !== 'offline_user'), i => i.user_email, 8).map(u => ({ ...u, modelo: u.user_email }));
      setGlobalData(gd);
      AsyncStorage.setItem(`@analytics_global_${period}`, JSON.stringify(gd));
    } catch (e) {
      console.log('Dashboard error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function generatePdfReport() {
    setLoading(true);
    try {
      const d = tab === 'mine' ? myData : globalData;
      const label = tab === 'mine' ? 'Mi actividad' : 'General';
      const pLabel = period === '7d' ? 'Últimos 7 días' : period === '30d' ? 'Últimos 30 días' : 'Todo el tiempo';
      
      const renderBars = (items, max, color) => items.map(i => {
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
            ${d.topV.length > 0 ? `<div class="card"><div class="card-title" style="color: #1a2530;">Top Productos Vistos</div>${renderBars(d.topV, maxV, '#1a2530')}</div>` : ''}
            ${d.topSh.length > 0 ? `<div class="card"><div class="card-title" style="color: #0D8A39;">Top Productos Compartidos</div>${renderBars(d.topSh, maxSh, '#0D8A39')}</div>` : ''}
            ${tab === 'general' && d.brands?.length > 0 ? `<div class="card"><div class="card-title" style="color: #1a2530;">Marcas Más Consultadas</div>${renderBars(d.brands, d.brands[0]?.count || 1, '#1a2530')}</div>` : ''}
            ${tab === 'general' && d.users?.length > 0 ? `<div class="card"><div class="card-title" style="color: #1a2530;">Usuarios Más Activos</div>${renderBars(d.users, d.users[0]?.count || 1, '#1a2530')}</div>` : ''}
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
    } catch(e) {
      showToast('Error generando PDF.');
      console.log('Error PDF', e);
    } finally {
      setLoading(false);
    }
  }

  const data = tab === 'mine' ? myData : globalData;

  return (
    <View>
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tabBtn, tab === 'mine' && s.tabActive]} onPress={() => setTab('mine')}>
          <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>Mi actividad</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'general' && s.tabActive]} onPress={() => setTab('general')}>
          <Text style={[s.tabText, tab === 'general' && s.tabTextActive]}>General</Text>
        </TouchableOpacity>
      </View>

      <View style={s.periodRow}>
        {tab === 'general' && (
          <TouchableOpacity onPress={generatePdfReport} style={[s.periodBtn, {marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.navy, opacity: loading ? 0.5 : 1}]} disabled={loading}>
            <SvgIcon name="upload" size={14} color={COLORS.white} />
            <Text style={[s.periodText, {color: COLORS.white, marginLeft: 6, fontWeight: 'bold'}]}>Reporte</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.navy} style={{ marginTop: 30, marginBottom: 30 }} />
      ) : (
        <>
          <View style={s.statsRow}>
            <StatCard number={data.views} label="Vistas" color={COLORS.navy} />
            <StatCard number={data.shares} label="Compartidos" color={COLORS.green} />
          </View>

          <RankSection title="Productos más vistos" items={data.topV} color={COLORS.navy} imageMap={imageMap} iconName="ojo" navigation={navigation} defaultExpanded={true} />
          <RankSection title="Productos más compartidos" items={data.topSh} color={COLORS.green} imageMap={imageMap} iconName="upload" navigation={navigation} defaultExpanded={false} />

          {tab === 'general' && globalData.brands.length > 0 && (
            <CollapsibleSection title="Marcas más consultadas" color={COLORS.navy} iconName="chart" defaultExpanded={false}>
              {globalData.brands.map((b, i) => <BrandBar key={i} marca={b.marca} count={b.count} maxCount={globalData.brands[0]?.count || 1} />)}
            </CollapsibleSection>
          )}

          {tab === 'general' && globalData.users.length > 0 && (
            <CollapsibleSection title="Usuarios más activos" color={COLORS.navy} iconName="usuarios" defaultExpanded={false}>
              {globalData.users.map((u, i) => <UserBar key={i} email={u.user_email} count={u.count} maxCount={globalData.users[0]?.count || 1} onUserClick={handleUserClick} />)}
              
              <TouchableOpacity style={{ marginTop: 15, padding: 12, backgroundColor: '#F0F4F8', borderRadius: 8, alignItems: 'center' }} onPress={() => setShowDirectoryModal(true)}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.navy }}>Ver directorio completo de usuarios</Text>
              </TouchableOpacity>
            </CollapsibleSection>
          )}
        </>
      )}

      <DirectoryModal
        visible={showDirectoryModal}
        onClose={() => setShowDirectoryModal(false)}
        loadingDirectory={loadingDirectory}
        directoryUsers={directoryUsers}
        onUserClick={handleUserClick}
      />

      <UserProfileModal
        visible={showUserModal}
        onClose={() => setShowUserModal(false)}
        loadingUser={loadingUser}
        selectedUser={selectedUser}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: '#F0F4F8', borderRadius: 10, padding: 3, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: COLORS.white, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4 },
  tabTextActive: { fontFamily: FONTS.bodySemi, color: COLORS.navy, fontWeight: '700' },
  periodRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 6 },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#F0F4F8' },
  periodActive: { backgroundColor: COLORS.navy },
  periodText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 },
  periodTextActive: { color: COLORS.white, fontWeight: '700' },
  shareBtn: { marginLeft: 'auto', padding: 6 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy },
  empty: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, fontStyle: 'italic' },
  rankItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F8FA', borderRadius: 8, padding: 8, marginBottom: 5 },
  rankImg: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff', marginRight: 8 },
  rankModelo: { fontFamily: FONTS.heading, fontSize: 13, fontWeight: '600', color: COLORS.navy },
  rankMarca: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.gray4 },
  rankCount: { fontFamily: FONTS.heading, fontSize: 14, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingVertical: 4 },
  brandName: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.navy, width: 80 },
  brandCount: { fontFamily: FONTS.heading, fontSize: 13, fontWeight: '700', color: COLORS.navy, minWidth: 28, textAlign: 'right' },
});
