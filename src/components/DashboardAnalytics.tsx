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
import { useTemplate } from '../hooks/useTemplate';
import { renderTemplate } from '../services/templateService';

const LOGO_BASE = APP_CONSTANTS.LOGO_BASE_BRANDS_2025;
const CACHE_KEY = 'comagro_productos_v3';

import { useDashboardAnalyticsLogic, getTrend } from '../hooks/useDashboardAnalyticsLogic';

export default function DashboardAnalytics({ navigation, onUserClick, onTabChange }: { navigation: any, onUserClick?: (email: string) => void, onTabChange?: (tab: 'mine' | 'general') => void }) {
  const {
    tab, setTab, period, setPeriod, loading, expandedCard, setExpandedCard,
    isAdmin, isOnline, myData, globalData, myChartMetrics, globalChartMetrics,
    imageMap, productBrandMap, cleanText, generatePdfReport
  } = useDashboardAnalyticsLogic(onTabChange);

  const data = tab === 'mine' || !isAdmin ? myData : globalData;
  const chartMetrics = tab === 'mine' || !isAdmin ? myChartMetrics : globalChartMetrics;

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
                  {chartMetrics.start} vistas
                </Text>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 9, color: COLORS.gray4 }}>
                  {period === 'today' ? '00:00h' : period === '7d' ? 'Hace 7d' : period === '30d' ? 'Hace 30d' : 'Inicio (60d)'}
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.navy, fontWeight: '700' }}>
                  Pico: {chartMetrics.peak} vistas
                </Text>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 9, color: COLORS.gray4 }}>
                  {chartMetrics.peakLabel}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: COLORS.navy, fontWeight: '700' }}>
                  {chartMetrics.today} vistas
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
