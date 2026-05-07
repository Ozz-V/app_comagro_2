import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';

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
  const logoUrl = `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\s+/g, '_')}.jpg`;
  return (
    <TouchableOpacity 
      style={s.rankItem} 
      activeOpacity={0.7}
      onPress={() => {
        if (navigation) {
          navigation.navigate('Productos', { openProductSku: item.sku || item.modelo });
        }
      }}
    >
      <Image source={{ uri: imgUrl || logoUrl }} style={s.rankImg} resizeMode="contain" />
      <View style={{ flex: 1 }}>
        <Text style={s.rankModelo} numberOfLines={1}>{item.modelo}</Text>
        <Text style={s.rankMarca}>{item.marca}</Text>
        <ProgressBar value={item.count} max={maxCount} color={color} />
      </View>
      <Text style={[s.rankCount, { color }]}>{item.count}</Text>
    </TouchableOpacity>
  );
}

function RankSection({ title, items, color, imageMap, emoji, navigation }) {
  if (!items || items.length === 0) return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{emoji} {title}</Text>
      <Text style={s.empty}>Sin datos aún</Text>
    </View>
  );
  const maxC = items[0]?.count || 1;
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{emoji} {title}</Text>
      {items.map((it, i) => <RankItem key={i} item={it} maxCount={maxC} color={color} imageMap={imageMap} navigation={navigation} />)}
    </View>
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

function UserBar({ email, count, maxCount }) {
  const w = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 0;
  const short = email.split('@')[0];
  return (
    <View style={s.brandRow}>
      <Text style={s.brandName} numberOfLines={1}>{short}</Text>
      <View style={{ flex: 1, height: 8, backgroundColor: '#E8ECF0', borderRadius: 4, marginHorizontal: 8 }}>
        <View style={{ width: `${w}%`, height: 8, backgroundColor: COLORS.celeste, borderRadius: 4 }} />
      </View>
      <Text style={s.brandCount}>{count}</Text>
    </View>
  );
}

function StatCard({ number, label, trend, color }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statNum, { color: color || COLORS.navy }]}>{number}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {trend ? <Text style={{ fontSize: 10, color: trend.startsWith('↑') ? COLORS.green : trend.startsWith('↓') ? '#e74c3c' : COLORS.gray4, marginTop: 2 }}>{trend}</Text> : null}
    </View>
  );
}

export default function DashboardAnalytics({ navigation }) {
  const [tab, setTab] = useState('mine');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [imageMap, setImageMap] = useState({});
  const [myData, setMyData] = useState({ views: 0, shares: 0, searches: 0, tV: '', tS: '', tSe: '', topV: [], topSh: [], topSe: [] });
  const [globalData, setGlobalData] = useState({ views: 0, shares: 0, searches: 0, tV: '', tS: '', tSe: '', topV: [], topSh: [], topSe: [], brands: [], users: [] });

  useEffect(() => { loadImages(); }, []);
  useEffect(() => { loadData(); }, [period]);

  async function loadImages() {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const rows = JSON.parse(raw);
      const m = {};
      rows.forEach(r => {
        const sku = (r['SKU'] || '').toString().trim();
        const img = (r['imagen 1'] || '').toString().trim();
        if (sku && img && /^https?:\/\//i.test(img)) m[sku] = img;
      });
      setImageMap(m);
    } catch (e) {}
  }

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const pDate = getPeriodDate(period);
      const ppDate = getPrevPeriodDate(period);

      let q = supabase.from('producto_analytics').select('modelo,marca,sku,action,user_email,created_at').order('created_at', { ascending: false }).limit(10000);
      if (pDate) q = q.gte('created_at', pDate);
      const { data: cur } = await q;
      const all = cur || [];

      let prev = [];
      if (pDate && ppDate) {
        const { data: p } = await supabase.from('producto_analytics').select('action,user_email').gte('created_at', ppDate).lt('created_at', pDate).limit(10000);
        prev = p || [];
      }

      const my = all.filter(d => d.user_email === user.email);
      const myPrev = prev.filter(d => d.user_email === user.email);

      const process = (items, prevItems, limit) => {
        const views = items.filter(d => d.action === 'view');
        const shares = items.filter(d => d.action === 'share_pdf' || d.action === 'share_image');
        const searches = items.filter(d => d.action === 'search');
        const pv = prevItems.filter(d => d.action === 'view').length;
        const ps = prevItems.filter(d => d.action === 'share_pdf' || d.action === 'share_image').length;
        const pse = prevItems.filter(d => d.action === 'search').length;
        return {
          views: views.length, shares: shares.length, searches: searches.length,
          tV: pDate ? getTrend(views.length, pv) : '', tS: pDate ? getTrend(shares.length, ps) : '', tSe: pDate ? getTrend(searches.length, pse) : '',
          topV: countByKey(views, i => i.sku || i.modelo, limit),
          topSh: countByKey(shares, i => i.sku || i.modelo, limit),
          topSe: countByKey(searches, i => i.sku || i.modelo, limit),
        };
      };

      setMyData(process(my, myPrev, 5));

      const gd = process(all, prev, 10);
      gd.brands = countByKey(all, i => i.marca, 8);
      gd.users = countByKey(all, i => i.user_email, 8).map(u => ({ ...u, modelo: u.user_email }));
      setGlobalData(gd);
    } catch (e) {
      console.log('Dashboard error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function shareSummary() {
    const d = tab === 'mine' ? myData : globalData;
    const label = tab === 'mine' ? 'Mi actividad' : 'General';
    const pLabel = period === '7d' ? 'Últimos 7 días' : period === '30d' ? 'Últimos 30 días' : 'Todo el tiempo';
    let txt = `📊 Resumen Comagro - ${label}\n📅 ${pLabel}\n━━━━━━━━━━━━━━━━━━━━\n👁 Vistas: ${d.views}\n📤 Compartidos: ${d.shares}\n🔍 Búsquedas: ${d.searches}\n`;
    if (d.topV[0]) txt += `\n🏆 Más visto: ${d.topV[0].modelo} (${d.topV[0].marca}) - ${d.topV[0].count}x`;
    if (d.topSh[0]) txt += `\n📤 Más compartido: ${d.topSh[0].modelo} (${d.topSh[0].marca}) - ${d.topSh[0].count}x`;
    await Clipboard.setStringAsync(txt);
    require('react-native').Alert.alert('Copiado', 'Resumen copiado al portapapeles.');
  }

  const data = tab === 'mine' ? myData : globalData;

  return (
    <View>
      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tabBtn, tab === 'mine' && s.tabActive]} onPress={() => setTab('mine')}>
          <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>Mi actividad</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'general' && s.tabActive]} onPress={() => setTab('general')}>
          <Text style={[s.tabText, tab === 'general' && s.tabTextActive]}>General</Text>
        </TouchableOpacity>
      </View>

      {/* Period */}
      <View style={s.periodRow}>
        {['7d', '30d', 'all'].map(p => (
          <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodActive]} onPress={() => setPeriod(p)}>
            <Text style={[s.periodText, period === p && s.periodTextActive]}>
              {p === '7d' ? '7 días' : p === '30d' ? '30 días' : 'Todo'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={shareSummary} style={s.shareBtn}>
          <Text style={{ fontSize: 16 }}>📋</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.navy} style={{ marginTop: 30, marginBottom: 30 }} />
      ) : (
        <>
          {/* Stats */}
          <View style={s.statsRow}>
            <StatCard number={data.views} label="Vistas" trend={data.tV} color={COLORS.navy} />
            <StatCard number={data.shares} label="Compartidos" trend={data.tS} color={COLORS.green} />
            <StatCard number={data.searches} label="Búsquedas" trend={data.tSe} color={COLORS.celeste} />
          </View>

          <RankSection title="Productos más vistos" items={data.topV} color={COLORS.navy} imageMap={imageMap} emoji="👁" navigation={navigation} />
          <RankSection title="Productos más compartidos" items={data.topSh} color={COLORS.green} imageMap={imageMap} emoji="📤" navigation={navigation} />
          <RankSection title="Productos más buscados" items={data.topSe} color={COLORS.celeste} imageMap={imageMap} emoji="🔍" navigation={navigation} />

          {tab === 'general' && globalData.brands.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>📊 Marcas más consultadas</Text>
              {globalData.brands.map((b, i) => <BrandBar key={i} marca={b.marca} count={b.count} maxCount={globalData.brands[0]?.count || 1} />)}
            </View>
          )}

          {tab === 'general' && globalData.users.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>👥 Usuarios más activos</Text>
              {globalData.users.map((u, i) => <UserBar key={i} email={u.user_email} count={u.count} maxCount={globalData.users[0]?.count || 1} />)}
            </View>
          )}
        </>
      )}
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
  statCard: { flex: 1, backgroundColor: '#F0F4F8', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  statNum: { fontFamily: FONTS.heading, fontSize: 26, fontWeight: '700' },
  statLabel: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, marginTop: 2 },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, marginBottom: 10 },
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
