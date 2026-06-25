import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import SvgIcon from './SvgIcon';
import { COLORS, FONTS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FilterHeader({
  filtroMarca,
  busqueda,
  filtroSubcategoria,
  setFiltroMarca,
  setBusqueda,
  setFiltroSubcategoria,
  onClearFilters,
  onGoBack
}) {
  const insets = useSafeAreaInsets();
  const isFiltered = filtroMarca || busqueda;

  return (
    <View style={[styles.topbar, { paddingTop: insets.top || 14 }]}>
      <View style={styles.topbarHeader}>
        <LottieView
          source={require('../../assets/iso.json')}
          autoPlay
          loop={true}
          style={styles.logoAnimado}
          resizeMode="contain"
        />
        <TouchableOpacity onPress={() => {
          if (isFiltered) {
            onClearFilters();
          } else {
            onGoBack();
          }
        }}>
          <Text style={styles.btnVolver}>
            {isFiltered ? '‹ Volver a marcas' : '‹ Volver'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={styles.searchWrap}>
          <SvgIcon name="buscar" size={18} color={COLORS.gray4} />
          <TextInput
            style={styles.searchInput}
            placeholder={filtroMarca ? `Buscar en ${filtroMarca}…` : 'Buscar producto…'}
            placeholderTextColor={COLORS.gray4}
            value={busqueda}
            onChangeText={v => {
              setBusqueda(v);
              if (v && !filtroMarca) {
                setFiltroSubcategoria('');
              }
            }}
          />
          {busqueda ? (
            <TouchableOpacity onPress={() => setBusqueda('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {filtroMarca ? (
        <View style={styles.filtersRow}>
          {[
            { key: '__todos__', label: 'Todos' },
            { key: '__productos__', label: 'Productos' },
            { key: '__acc__', label: 'Accesorios' }
          ].map(btn => {
            const isActive = (btn.key === '__todos__' && !filtroSubcategoria) || filtroSubcategoria === btn.key;
            return (
              <TouchableOpacity
                key={btn.key}
                onPress={() => setFiltroSubcategoria(btn.key === '__todos__' ? '' : btn.key)}
                style={[styles.filterBtn, isActive && styles.filterBtnActive]}
              >
                <Text numberOfLines={1} style={[styles.filterBtnText, isActive && styles.filterBtnTextActive]}>
                  {btn.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 12,
  },
  topbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoAnimado: { width: 100, height: 40 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: COLORS.white,
    borderRadius: 8,
  },
  searchInput: { flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, marginLeft: 8 },
  clearBtn: { color: COLORS.gray4, fontSize: 16, padding: 4 },
  btnVolver: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.green },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginBottom: 4 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 3,
    marginBottom: 6
  },
  filterBtnActive: {
    backgroundColor: COLORS.navy
  },
  filterBtnText: {
    color: COLORS.navy,
    fontWeight: 'bold',
    fontSize: 12
  },
  filterBtnTextActive: {
    color: COLORS.white
  }
});
