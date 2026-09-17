import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { styles } from './CalculatorStyles';
import { COLORS } from '../../theme';
import SvgIcon from '../SvgIcon';
import { estimateGenerador, estimateMotor } from '../../utils/CapacityEstimator';

export const CalculatorResults = ({
  hasCalculated, calcInput, calcMode, genUnit, genFase,
  waitingForCatalog, motorWarning, calcResult, motorResult, motorResultTitle,
  navigation, onClose
}: any) => {
  return (
    <>
              {hasCalculated && (parseFloat(calcInput) > 0 || calcMode === 'bomba' || calcMode === 'motor') && (
                <View style={styles.resultContainer}>
                  {calcMode !== 'bomba' && (
                  <View style={styles.estimationBox}>
                    <Text style={styles.estimationTitle}>Estimación rápida:</Text>
                    <Text style={styles.estimationText}>
                      {calcMode === 'gen' ? (() => {
                          let finalKva = parseFloat(calcInput) || 0;
                          if (genUnit === 'AMPER') {
                              if (genFase === '220v') finalKva = (finalKva * 220) / 1000;
                              else finalKva = (finalKva * 380 * 1.732) / 1000;
                          }
                          const equivalentText = genUnit === 'AMPER' ? `(Equivale a ${finalKva.toFixed(1)} KVA)\n\n` : '';
                          return equivalentText + estimateGenerador(finalKva);
                      })() :
                       calcMode === 'motor' ? estimateMotor(parseFloat(calcInput)) : ''}
                    </Text>
                  </View>
                  )}

                {calcResult && calcResult.length === 0 && (
                  <View style={styles.suggestedContainer}>
                    {waitingForCatalog ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color={COLORS.navy} />
                        <Text style={styles.estimationText}>Estamos terminando de descargar el catálogo. El resultado va a aparecer solo en un momento…</Text>
                      </View>
                    ) : (
                      <Text style={[styles.estimationText, motorWarning ? { color: '#c0392b', fontWeight: '600' } : {}]}>
                        {motorWarning || 'No encontramos equipos que coincidan con ese requerimiento en la categoría seleccionada.'}
                      </Text>
                    )}
                  </View>
                )}

                {(() => {
                  const PAIRED_COLORS = ['#2E7D32', '#1565C0', '#D84315', '#6A1B9A', '#00838F', '#AD1457'];
                  const pumpColorMap = new Map<string, string>();
                  if (calcResult) {
                     let colorIdx = 0;
                     calcResult.forEach((item: any) => {
                        if (item.pairedSku && !pumpColorMap.has(item.modelo)) {
                           pumpColorMap.set(item.modelo, PAIRED_COLORS[colorIdx % PAIRED_COLORS.length]);
                           colorIdx++;
                        }
                     });
                  }

                  return (
                    <>
                {calcResult && calcResult.length > 0 && (
                  <View style={styles.suggestedContainer}>
                    <Text style={styles.suggestedTitle}>Equipos Sugeridos:</Text>
                    <FlatList
                      data={calcResult}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item, index) => item.modelo + index}
                      renderItem={({ item }) => {
                        const borderColor = pumpColorMap.get(item.modelo) || COLORS.border;
                        const borderWidth = pumpColorMap.has(item.modelo) ? 2 : 1;
                        return (
                        <TouchableOpacity 
                          style={[styles.suggestedCard, { borderColor: borderColor, borderWidth: borderWidth }]}
                          onPress={() => { navigation.navigate('ProductViewer', { sku: item.modelo, contextSkus: calcResult.map((r: any) => r.modelo) }); }}
                        >
                          {item.imagen ? (
                            <Image source={{ uri: item.imagen }} style={styles.suggestedImg} contentFit="contain" />
                          ) : (
                            <View style={styles.suggestedImgPlaceholder} />
                          )}
                          {!!item.pairedSku && (
                            <View style={[styles.pairedBadge, { backgroundColor: borderColor }]}>
                              <Text style={styles.pairedBadgeText}>🔗 Requiere componente</Text>
                            </View>
                          )}
                          <Text style={styles.suggestedMarca} numberOfLines={1}>{item.marca}</Text>
                          <Text style={styles.suggestedModelo} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={[styles.suggestedVal, pumpColorMap.has(item.modelo) && {color: borderColor}]}>
                            {item.displayValue || (calcMode === 'gen' ? `${item.calcVal} KVA` : calcMode === 'motor' ? `${item.calcVal} HP` : `${item.calcVal > 0 ? item.calcVal.toFixed(1) : '?'} HP`)}
                          </Text>
                        </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                )}

                {motorResult && motorResult.length > 0 && (
                  <View style={[styles.suggestedContainer, {marginTop: 5}]}>
                    <Text style={styles.suggestedTitle}>{motorResultTitle}</Text>
                    <FlatList
                      data={motorResult}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item, index) => item.modelo + index}
                      renderItem={({ item }) => {
                        const parentColor = item.pairedSku ? pumpColorMap.get(item.pairedSku) : null;
                        const borderColor = parentColor || COLORS.green;
                        return (
                        <TouchableOpacity 
                          style={[styles.suggestedCard, { borderColor: borderColor, borderWidth: 2 }]}
                          onPress={() => { navigation.navigate('ProductViewer', { sku: item.modelo, contextSkus: motorResult.map((r: any) => r.modelo) }); }}
                        >
                          {item.imagen ? (
                            <Image source={{ uri: item.imagen }} style={styles.suggestedImg} contentFit="contain" />
                          ) : (
                            <View style={styles.suggestedImgPlaceholder} />
                          )}
                          {!!item.pairedSku && (
                            <View style={[styles.pairedBadge, { backgroundColor: borderColor }]}>
                              <Text style={styles.pairedBadgeText}>🔗 Para: {item.pairedSku}</Text>
                            </View>
                          )}
                          <Text style={styles.suggestedMarca} numberOfLines={1}>{item.marca}</Text>
                          <Text style={styles.suggestedModelo} numberOfLines={2}>{item.modelo}</Text>
                          <Text style={[styles.suggestedVal, {color: borderColor}]}>
                            {item.displayValue || `${item.calcVal} HP`}
                          </Text>
                        </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                )}
                    </>
                  );
                })()}
                </View>
              )}
    </>
  );
};



