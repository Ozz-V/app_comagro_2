import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../theme';

interface StatCardProps {
  number: number | string;
  label: string;
  trend?: string;
  color?: string;
}

export default function StatCard({ number, label, trend, color }: StatCardProps) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statNum, { color: color || COLORS.navy }]}>{number}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {trend ? <Text style={{ fontSize: 10, color: trend.startsWith('↑') ? COLORS.green : trend.startsWith('↓') ? '#e74c3c' : COLORS.gray4, marginTop: 2 }}>{trend}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  statCard: { flex: 1, backgroundColor: '#F0F4F8', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  statNum: { fontFamily: FONTS.heading, fontSize: 26, fontWeight: '700' },
  statLabel: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, marginTop: 2 },
});
