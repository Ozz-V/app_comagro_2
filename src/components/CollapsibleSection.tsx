import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';

interface CollapsibleSectionProps {
  title: string;
  iconName: string;
  color?: string;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  onPress?: () => void; // si se pasa, reemplaza el toggle interno (ej. abrir un modal)
  rightIndicator?: React.ReactNode; // ej. un spinner mientras carga
}

export default function CollapsibleSection({
  title, iconName, color = COLORS.navy, defaultExpanded = false, children, onPress, rightIndicator,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = !!children;
  const handlePress = onPress ?? (() => setExpanded(!expanded));

  return (
    <View style={s.section}>
      <TouchableOpacity style={s.row} onPress={handlePress} activeOpacity={0.7}>
        <View style={s.left}>
          <SvgIcon name={iconName} size={16} color={color} />
          <Text style={s.title}>{title}</Text>
        </View>
        <View style={s.right}>
          {rightIndicator}
          <Text style={s.arrow}>{hasChildren ? (expanded ? '▲' : '▼') : '›'}</Text>
        </View>
      </TouchableOpacity>
      {hasChildren && expanded && <View style={s.content}>{children}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  left: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, marginLeft: 6 },
  right: { flexDirection: 'row', alignItems: 'center' },
  arrow: { color: COLORS.gray4, fontSize: 16, marginLeft: 8 },
  content: { marginTop: 10 },
});
