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

import { useDashboardAnalyticsLogic, getTrend } from '../hooks/useDashboardAnalyticsLogic';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DashboardKpiCards } from './dashboard/DashboardKpiCards';
import { DashboardActivityChart } from './dashboard/DashboardActivityChart';
import { DashboardRankingLists } from './dashboard/DashboardRankingLists';
import { s } from './dashboard/DashboardStyles';


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
      <DashboardHeader 
        tab={tab} 
        setTab={setTab} 
        period={period} 
        setPeriod={setPeriod} 
        isAdmin={isAdmin} 
        loading={loading} 
        onPdfPress={generatePdfReport} 
      />

      <ScrollView 
        style={s.contentArea} 
        contentContainerStyle={s.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1 }}>
          
          <DashboardKpiCards 
            views={data.views} 
            shares={data.shares} 
            prevViews={data.prevViews} 
            prevShares={data.prevShares} 
            period={period} 
            cleanText={cleanText} 
          />

          <DashboardActivityChart 
            views={data.views} 
            period={period} 
            chartMetrics={chartMetrics} 
            cleanText={cleanText} 
          />

          <DashboardRankingLists 
            tab={tab} 
            data={data} 
            renderListItem={renderListItem} 
          />

        </View>
      </ScrollView>
    </View>
  );
}
