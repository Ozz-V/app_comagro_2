import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../../theme';
import { ParsedProduct } from '../../types';

interface Props {
  modalProd: ParsedProduct;
}

export default function ProductSpecsTab({ modalProd }: Props) {
  if (!modalProd || !modalProd.specs || modalProd.specs.length === 0) {
    return (
      <View style={st.tabContent}>
        <Text style={st.aiBodyText}>No hay especificaciones tcnicas detalladas para este producto.</Text>
      </View>
    );
  }

  return (
    <View style={st.tabContent}>
      <View style={st.specsWrap}>
        <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0' }}>
          {modalProd.specs.map(([n, v]: [string, string], i: number) => (
            <View key={i} style={[st.specRow, i % 2 === 1 && st.specRowAlt]}>
              <Text style={st.specName}>{n}</Text>
              <Text style={st.specVal}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tabContent: { padding: 16 },
  aiBodyText: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, lineHeight: 22 },
  specsWrap: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  specRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#edf1f5' },
  specRowAlt: { backgroundColor: '#fafbfc' },
  specName: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, fontWeight: '700', width: '45%', textTransform: 'uppercase', letterSpacing: 0.3, paddingRight: 10 },
  specVal: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray1, flex: 1, flexWrap: 'wrap' },
});
