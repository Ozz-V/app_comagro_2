import React, { useState, useEffect } from 'react';
import { View, Text, Modal, SafeAreaView, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchProducts } from '../utils/database';

// Extrae el primer número de un string para comparación de specs
function extractNum(val: any) {
  if (!val || typeof val !== 'string') return null;
  const m = val.match(/([\d]+[\.,]?[\d]*)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

interface CompareModalProps {
  visible: boolean;
  compareItems: any[];
  onClose: () => void;
  onOpenProduct: (prod: any) => void;
  setCompareItems?: React.Dispatch<React.SetStateAction<any[]>>;
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
  const [similares, setSimilares] = useState<any[]>([]);

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
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, paddingTop: require('react-native').Platform.OS === 'android' ? insets.top : 0 }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Comparando {compareItems?.length || 0} productos</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12 }}>
            {/* Cabecera con imágenes y nombres */}
            <View style={{ flexDirection: 'row', marginBottom: 15, marginTop: 10 }}>
              <View style={{ width: 110 }} />
              {compareItems?.map((prod: any, idx: number) => (
                <TouchableOpacity 
                  key={prod.modelo} 
                  style={{ flex: 1, alignItems: 'center', marginHorizontal: 3 }}
                  activeOpacity={0.7}
                  onPress={() => onOpenProduct(prod)}
                >
                  <Image source={{ uri: prod.imagen }} style={styles.prodImg} contentFit="contain" />
                  <Text style={{ fontSize: 10, color: COLORS.green, fontWeight: 'bold', textAlign: 'center' }}>{prod.marca}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.navy, fontWeight: 'bold', textAlign: 'center' }} numberOfLines={2}>{prod.modelo}</Text>
                  <TouchableOpacity
                    onPress={() => { setItemToReplaceIndex(idx); setShowReplaceSelector(true); }}
                    style={styles.changeBtn}
                  >
                    <Text style={{ fontSize: 10, color: COLORS.navy, fontWeight: 'bold' }}>🔄 Cambiar</Text>
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

              compareItems.forEach((prod: any) => {
                (prod.specs || []).forEach(([n]: any) => {
                  if (!BLACKLIST_SPECS.includes(n.toLowerCase().trim()) && !allSpecNames.includes(n)) {
                    allSpecNames.push(n);
                  }
                });
              });
              return allSpecNames.map((specName, si) => {
                // Obtener valores de cada producto para este spec
                const vals = compareItems.map((prod: any) => {
                  const found = (prod.specs || []).find(([n]: any) => n === specName);
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
                  <View key={specName} style={{ flexDirection: 'row', backgroundColor: si % 2 === 0 ? '#F7F8FA' : COLORS.white, borderRadius: 6, marginBottom: 2, paddingVertical: 6, alignItems: 'center' }}>
                    <View style={{ width: 110, paddingHorizontal: 8 }}>
                      <Text style={{ fontSize: 10, color: COLORS.gray4, fontWeight: 'bold', textTransform: 'uppercase' }} numberOfLines={2}>{specName}</Text>
                    </View>
                    {compareItems.map((prod: any, pi: number) => {
                      const val = vals[pi];
                      const num = nums[pi];
                      let indicator = null;
                      if (hasDiff && num !== null) {
                        if (num === maxNum) indicator = <Text style={{ color: '#16a34a', fontWeight: 'bold', fontSize: 12 }}> ↑</Text>;
                        else if (num === minNum) indicator = <Text style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 12 }}> ↓</Text>;
                      }
                      return (
                        <View key={prod.modelo} style={{ flex: 1, marginHorizontal: 3, backgroundColor: hasDiff && num === maxNum ? '#f0fdf4' : hasDiff && num === minNum ? '#fef2f2' : 'transparent', borderRadius: 4, padding: 4 }}>
                          <Text style={{ fontSize: 11, color: COLORS.navy, fontWeight: '500', textAlign: 'center' }} numberOfLines={2}>
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
            <ScrollView style={{ padding: 10 }}>
              {similares.map((sim: any) => {
                const isAlreadyInGrid = compareItems?.some((c: any) => c.modelo === sim.modelo);
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
                    <Image source={{ uri: sim.imagen }} style={{ width: 50, height: 50, marginRight: 10 }} contentFit="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.navy }}>{sim.modelo}</Text>
                      <Text style={{ fontSize: 12, color: COLORS.green }}>{sim.marca}</Text>
                    </View>
                    {isAlreadyInGrid && <Text style={{ fontSize: 10, color: COLORS.gray4 }}>Ya en grilla</Text>}
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
  prodImg: { width: 60, height: 60, marginBottom: 5 },
  changeBtn: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
});
