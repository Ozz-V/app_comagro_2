import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, FONTS } from '../../theme';
import { ParsedProduct } from '../../types';

interface Props {
  productosSimilares: ParsedProduct[];
  productosMismaMarca: ParsedProduct[];
  modalProd: ParsedProduct | null;
  onOpenProduct: (p: ParsedProduct) => void;
}

export default function SimilarProductsTab({
  productosSimilares,
  productosMismaMarca,
  modalProd,
  onOpenProduct
}: Props) {
  return (
    <View style={styles.tabContent}>
      {productosMismaMarca.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.simSectionTitle}>Más de {modalProd?.marca}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
            {productosMismaMarca.map((sim: ParsedProduct) => (
              <TouchableOpacity
                key={sim.modelo}
                style={styles.simSlideCard}
                onPress={() => onOpenProduct(sim)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: sim.imagen }} style={styles.simSlideImg} contentFit="contain" />
                <Text style={styles.simSlideMarca}>{sim.subcategoria}</Text>
                <Text style={styles.simSlideModelo} numberOfLines={2}>{sim.modelo}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {productosSimilares.length > 0 && (
        <View>
          <Text style={styles.simSectionTitle}>Misma categoría</Text>
          {productosSimilares.map((sim: ParsedProduct) => (
            <TouchableOpacity key={sim.modelo} style={styles.simCard} onPress={() => onOpenProduct(sim)}>
              <Image source={{ uri: sim.imagen }} style={styles.simImg} contentFit="contain" />
              <View style={styles.simInfo}>
                <Text style={styles.simMarca}>{sim.marca}</Text>
                <Text style={styles.simModelo} numberOfLines={2}>{sim.modelo}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {productosSimilares.length === 0 && productosMismaMarca.length === 0 && (
        <Text style={styles.aiBodyText}>No hay productos relacionados.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: { padding: 16 },
  aiBodyText: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, lineHeight: 22 },
  simSectionTitle: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  simSlideCard: { width: 140, marginRight: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, backgroundColor: COLORS.white },
  simSlideImg: { width: '100%', height: 90, marginBottom: 8 },
  simSlideMarca: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.gray4, fontWeight: '700', textTransform: 'uppercase' },
  simSlideModelo: { fontFamily: FONTS.heading, fontSize: 13, color: COLORS.navy, marginTop: 2, lineHeight: 16 },
  simCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#edf1f5' },
  simImg: { width: 60, height: 60, borderRadius: 6, marginRight: 12, backgroundColor: '#f7f8fa' },
  simInfo: { flex: 1 },
  simMarca: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, fontWeight: '700', textTransform: 'uppercase' },
  simModelo: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, marginTop: 2 },
});
