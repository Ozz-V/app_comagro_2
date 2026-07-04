import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';

export default function ProductCard({ item, cardW, isSelected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.card, { width: cardW }, isSelected && { borderColor: COLORS.navy, borderWidth: 2 }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={[styles.cardImg, { height: cardW * 0.85 }]}>
        <Image source={{ uri: item.imagen }} style={styles.cardImgI} contentFit="contain" />
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedText}>✓</Text>
          </View>
        )}
      </View>
      <View style={styles.greenBar} />
      <View style={styles.cardBody}>
        <Text style={styles.cardMarca}>{item.marca}</Text>
        <Text style={styles.cardModelo} numberOfLines={2}>{item.modelo}</Text>
        <Text style={styles.cardSubcat} numberOfLines={1}>{item.subcategoria}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  cardImg: {
    width: '100%',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  cardImgI: {
    width: '100%',
    height: '100%',
  },
  selectedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: COLORS.navy,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  selectedText: {
    color: 'white',
    fontWeight: 'bold'
  },
  greenBar: {
    height: 3,
    backgroundColor: COLORS.green,
    width: '100%',
  },
  cardBody: {
    padding: 10,
  },
  cardMarca: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.green,
    textTransform: 'uppercase',
  },
  cardModelo: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.navy,
    marginTop: 2,
    lineHeight: 16,
  },
  cardSubcat: {
    fontSize: 10,
    color: COLORS.gray4,
    marginTop: 4,
    textTransform: 'uppercase',
  },
});
