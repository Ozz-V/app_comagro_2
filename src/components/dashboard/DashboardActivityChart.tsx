import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Line, Path, Circle } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';
import { s } from './DashboardStyles';
import { ChartMetrics } from '../../hooks/useDashboardAnalyticsLogic';

interface Props {
  views: number;
  period: string;
  chartMetrics: ChartMetrics;
  cleanText: (v: any) => string;
}

export function DashboardActivityChart({ views, period, chartMetrics, cleanText }: Props) {
  return (
    <View style={s.cardChart}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={s.cardTitle}>Historial de Uso</Text>
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy, fontWeight: '700' }}>
          {cleanText(views)} vistas totales
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
  );
}
