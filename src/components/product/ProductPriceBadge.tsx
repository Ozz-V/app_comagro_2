import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS } from '../../theme';

interface ProductPriceBadgeProps {
  price?: number | null;
}

const formatGuaranies = (val: number) => new Intl.NumberFormat('es-PY').format(val);

export default function ProductPriceBadge({ price }: ProductPriceBadgeProps) {
  if (!price) return null;

  return (
    <View style={styles.pricePillContainer}>
      <Text style={styles.precioWebLabel}>PRECIO WEB</Text>
      <LinearGradient
        colors={['#0F204D', '#1B7A43']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.pricePill}
      >
        <Text style={styles.priceSymbol}>₲</Text>
        <Text style={styles.priceValue}>{formatGuaranies(price)}</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  pricePillContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  precioWebLabel: {
    fontSize: 9,
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    color: COLORS.gray3,
    marginBottom: 2,
    marginRight: 4,
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  priceSymbol: {
    color: '#FFF',
    fontFamily: FONTS.bodySemi,
    fontSize: 12,
    marginRight: 4,
  },
  priceValue: {
    color: '#FFF',
    fontFamily: FONTS.bodySemi,
    fontSize: 14,
  },
});
