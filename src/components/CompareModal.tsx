import React, { useState, useEffect } from 'react';
import { View, Text, Modal, SafeAreaView, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchProducts } from '../utils/database';
import { ParsedProduct, SpecTuple } from '../types';

// Extrae el primer número de un string para comparación de specs
function extractNum(val: string | null | undefined): number | null {
  if (!val || typeof val !== 'string') return null;
  const m = val.match(/([\d]+[\.,]?[\d]*)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

interface CompareModalProps {
  visible: boolean;
  compareItems: ParsedProduct[];
  onClose: () => void;
  onOpenProduct: (prod: ParsedProduct) => void;
  setCompareItems?: React.Dispatch<React.SetStateAction<ParsedProduct[]>>;
}

export default function CompareModal({
  visible,
  compareItems,
  onClose,
  onOpenProduct,
  setCompareItems
}: CompareModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [itemToReplaceIndex, setItemToReplaceIndex] = useState<number | null>(null);
  const [showReplaceSelector, setShowReplaceSelector] = useState(false);
  const [similares, setSimilares] = useState<ParsedProduct[]>([]);

  useEffect(() => {
    if (showReplaceSelector && compareItems?.length > 0) {
      searchProducts('Todas', compareItems[0].subcategoria, '').then(res => {
        setSimilares(res.slice(0, 30));
      }).catch(() => {});
    }
  }, [showReplaceSelector, compareItems]);

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Comparando {compareItems?.length || 0} productos</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Cabecera con imágenes y nombres */}
            <View style={styles.productsHeaderRow}>
              <View style={styles.emptyHeaderCell} />
              {compareItems?.map((prod: ParsedProduct, idx: number) => (
                <TouchableOpacity 
                  key={prod.modelo} 
                  style={styles.productHeaderCol}
                  activeOpacity={0.7}
                  onPress={() => onOpenProduct(prod)}
                >
                  <Image source={{ uri: prod.imagen }} style={styles.prodImg} contentFit="contain" />
                  <Text style={styles.prodMarcaLabel}>{prod.marca}</Text>
                  <Text style={styles.prodModeloLabel} numberOfLines={2}>{prod.modelo}</Text>
                  <TouchableOpacity
                    onPress={() => { setItemToReplaceIndex(idx); setShowReplaceSelector(true); }}
                    style={styles.changeBtn}
                  >
                    <Text style={styles.changeBtnText}>🔄 Cambiar</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tabla de specs con indicadores ↑↓ */}
            {(() => {
              if (!compareItems || compareItems.length === 0) return null;
              // Reunir todos los nombres de specs únicos en orden
              const allSpecNames: string[] = [];
              const BLACKLIST_SPECS = ['nombre del producto', 'denominador estándar', 'denominador estandar', 'sku', 'accesorios', 'aplicación', 'aplicacion', 'descripción', 'descripcion', 'marca', 'modelo', 'imagen', 'video', 'id'];

              compareItems.forEach((prod: ParsedProduct) => {
                (prod.specs || []).forEach((spec: SpecTuple) => {
                  const n = spec[0];
                  if (!BLACKLIST_SPECS.includes(n.toLowerCase().trim()) && !allSpecNames.includes(n)) {
                    allSpecNames.push(n);
                  }
                });
              });
              return allSpecNames.map((specName, si) => {
                // Obtener valores de cada producto para este spec
                const vals = compareItems.map((prod: ParsedProduct) => {
                  const found = (prod.specs || []).find((spec: SpecTuple) => spec[0] === specName);
                  return found ? found[1] : null;
                });
                // Extraer números para comparación
                const COMPARABLE_SPECS = ['caudal', 'tensión', 'tension', 'potencia', 'kva', 'presión', 'presion', 'capacidad', 'cilindrada', 'peso', 'velocidad', 'rpm', 'amper', 'voltaje', 'altura', 'fuerza', 'torque', 'fases', 'diámetro', 'diametro', 'largo', 'ancho', 'profundidad', 'consumo', 'cc', 'hp', 'kw', 'litros'];
                const isComparable = COMPARABLE_SPECS.some(k => specName.toLowerCase().includes(k));
                
                const nums = vals.map(v => extractNum(v));
                const validNums = nums.filter((n): n is number => n !== null);
                const maxNum = (validNums.length > 1 && isComparable) ? Math.max(...validNums) : null;
                const minNum = (validNums.length > 1 && isComparable) ? Math.min(...validNums) : null;
                const hasDiff = maxNum !== null && maxNum !== minNum;
                return (
                  <View key={specName} style={[styles.specRow, { backgroundColor: si % 2 === 0 ? '#F7F8FA' : COLORS.white }]}>
                    <View style={styles.specLabelContainer}>
                      <Text style={styles.specLabelText} numberOfLines={2}>{specName}</Text>
                    </View>
                    {compareItems.map((prod: ParsedProduct, pi: number) => {
                      const val = vals[pi];
                      const num = nums[pi];
                      let indicator = null;
                      if (hasDiff && num !== null) {
                        if (num === maxNum) indicator = <Text style={styles.indicatorUp}> ↑</Text>;
                        else if (num === minNum) indicator = <Text style={styles.indicatorDown}> ↓</Text>;
                      }
                      const cellBg = hasDiff && num === maxNum ? '#f0fdf4' : hasDiff && num === minNum ? '#fef2f2' : 'transparent';
                      return (
                        <View key={prod.modelo} style={[styles.specValueContainer, { backgroundColor: cellBg }]}>
                          <Text style={styles.specValueText} numberOfLines={2}>
                            {val !== null ? val : '—'}{indicator}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              });
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal Selector de Reemplazo (Similares) */}
      <Modal visible={showReplaceSelector} animationType="fade" transparent onRequestClose={() => setShowReplaceSelector(false)}>
        <View style={styles.replaceOverlay}>
          <View style={[styles.replaceDialog, { paddingBottom: insets.bottom || 15 }]}>
            <View style={styles.replaceHeader}>
              <Text style={styles.replaceTitle}>Elegir reemplazo</Text>
              <TouchableOpacity onPress={() => setShowReplaceSelector(false)}>
                <Text style={styles.replaceClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.replaceScroll}>
              {similares.map((sim: ParsedProduct) => {
                const isAlreadyInGrid = compareItems?.some((c: ParsedProduct) => c.modelo === sim.modelo);
                return (
                  <TouchableOpacity 
                    key={sim.modelo} 
                    style={[styles.simRow, { opacity: isAlreadyInGrid ? 0.4 : 1 }]}
                    disabled={isAlreadyInGrid}
                    onPress={() => {
                      if (setCompareItems) {
                        setCompareItems(prev => {
                          const newArr = [...prev];
                          if (itemToReplaceIndex !== null) {
                            newArr[itemToReplaceIndex] = sim;
                          }
                          return newArr;
                        });
                      }
                      setShowReplaceSelector(false);
                    }}
                  >
                    <Image source={{ uri: sim.imagen }} style={styles.simRowImage} contentFit="contain" />
                    <View style={styles.simRowTextContainer}>
                      <Text style={styles.simRowModelo}>{sim.modelo}</Text>
                      <Text style={styles.simRowMarca}>{sim.marca}</Text>
                    </View>
                    {isAlreadyInGrid && <Text style={styles.simRowAlreadyInGrid}>Ya en grilla</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  scrollContent: {
    padding: 12
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.navy },
  closeBtn: { fontSize: 24, color: COLORS.gray4 },
  productsHeaderRow: {
    flexDirection: 'row',
    marginBottom: 15,
    marginTop: 10
  },
  emptyHeaderCell: {
    width: 110
  },
  productHeaderCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 3
  },
  prodImg: { width: 60, height: 60, marginBottom: 5 },
  prodMarcaLabel: {
    fontSize: 10,
    color: COLORS.green,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  prodModeloLabel: {
    fontSize: 11,
    color: COLORS.navy,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  changeBtn: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  changeBtnText: {
    fontSize: 10,
    color: COLORS.navy,
    fontWeight: 'bold'
  },
  specRow: {
    flexDirection: 'row',
    borderRadius: 6,
    marginBottom: 2,
    paddingVertical: 6,
    alignItems: 'center'
  },
  specLabelContainer: {
    width: 110,
    paddingHorizontal: 8
  },
  specLabelText: {
    fontSize: 10,
    color: COLORS.gray4,
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  specValueContainer: {
    flex: 1,
    marginHorizontal: 3,
    borderRadius: 4,
    padding: 4
  },
  specValueText: {
    fontSize: 11,
    color: COLORS.navy,
    fontWeight: '500',
    textAlign: 'center'
  },
  indicatorUp: {
    color: '#16a34a',
    fontWeight: 'bold',
    fontSize: 12
  },
  indicatorDown: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: 12
  },
  replaceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  replaceDialog: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  replaceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  replaceTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.navy },
  replaceClose: { fontSize: 20, color: COLORS.gray4 },
  replaceScroll: {
    padding: 10
  },
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  simRowImage: {
    width: 50,
    height: 50,
    marginRight: 10
  },
  simRowTextContainer: {
    flex: 1
  },
  simRowModelo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.navy
  },
  simRowMarca: {
    fontSize: 12,
    color: COLORS.green
  },
  simRowAlreadyInGrid: {
    fontSize: 10,
    color: COLORS.gray4
  }
});
