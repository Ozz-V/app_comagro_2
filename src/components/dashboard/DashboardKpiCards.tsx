import React from 'react';
import { View, Text } from 'react-native';
import { s } from './DashboardStyles';
import { getTrend } from '../../hooks/useDashboardAnalyticsLogic';

interface Props {
  views: number;
  shares: number;
  prevViews?: number;
  prevShares?: number;
  period: string;
  cleanText: (v: any) => string;
}

export function DashboardKpiCards({ views, shares, prevViews, prevShares, period, cleanText }: Props) {
  return (
    <View style={s.rowTotals}>
       <View style={[s.cardTotal, s.cardTotalViews]}>
          <Text style={s.cardTitleLight}>Vistas Totales</Text>
          <View style={s.kpiRow}>
            <Text style={s.totalValueLight}>{cleanText(views)}</Text>
            {period !== 'all' && (
              <Text style={[s.trendTextLight, { color: (views >= (prevViews || 0)) ? '#81C784' : '#FF8A80' }]}>
                {getTrend(views, prevViews || 0)}
              </Text>
            )}
          </View>
       </View>
       <View style={[s.cardTotal, s.cardTotalShares]}>
          <Text style={s.cardTitleLight}>Compartidos</Text>
          <View style={s.kpiRow}>
            <Text style={s.totalValueLight}>{cleanText(shares)}</Text>
            {period !== 'all' && (
              <Text style={[s.trendTextLight, { color: (shares >= (prevShares || 0)) ? '#81C784' : '#FF8A80' }]}>
                {getTrend(shares, prevShares || 0)}
              </Text>
            )}
          </View>
       </View>
    </View>
  );
}
