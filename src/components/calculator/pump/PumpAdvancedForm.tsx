import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, ScrollView } from 'react-native';
import { styles } from '../CalculatorStyles';

export const PumpAdvancedForm = ({ pumpWizard, setPumpWizard, adv, setAdv, reglas, handleCalculate, interpolateFriction, FRICCION_DIAMS, FIT_HEADERS, COLORS, showDiamPicker, setShowDiamPicker, advResults }: any) => {
  
  const tx = (reglas as any)?.textos ?? {};
  const tCaudal   = tx.label_caudal   ?? 'Caudal (m³/h)';
  const tLongitud = tx.label_longitud ?? 'Longitud de Ca�er�a (m)';
  const tDesnivel = tx.label_desnivel ?? 'Altura a Elevar (m)';
  const tDiametro = tx.label_diametro ?? 'Di�metro de Ca�er�a';
  const tAccesorios = tx.label_accesorios ?? 'Accesorios (Cantidades)';
  const tBtnBuscar = tx.btn_buscar ?? 'Buscar Equipos';
  const tAvisoDiamInsuf  = tx.aviso_diametro_insuficiente ?? 'Di�metro insuficiente';
  const tAvisoDiamBloq   = tx.aviso_diametro_bloqueado    ?? 'Rango supera tabla de fricci�n';
  const tAvisoSinCaudal  = tx.aviso_sin_caudal            ?? 'Ingres� el caudal para buscar';

  const advQ = parseFloat(adv.caudal) || 0;
  const currentDiamSt = advQ > 0 ? interpolateFriction(advQ, adv.diamIdx).status : 'ok';
  const currentDiamInvalid = currentDiamSt === 'above' || currentDiamSt === 'sin-datos';
  const allDiamsInvalid = advQ > 0 && FRICCION_DIAMS.every((_: any, idx: number) => {
    const s = interpolateFriction(advQ, idx).status;
    return s === 'above' || s === 'sin-datos';
  });

  const hasCaudal = advQ > 0;
  const hasUso = !!pumpWizard.uso;
  const canBuscar = hasCaudal && hasUso;

  return (
    <View style={styles.avanzadoContainer}>
      <Text style={styles.inputTitleSmall}>Filtro de Categoría</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
        {reglas?.categorias?.map((u: any) => (
          <TouchableOpacity key={u.id} style={[styles.usoListCard, { flexGrow: 1, minWidth: '45%', padding: 10, minHeight: 40, marginRight: 0 }, pumpWizard.uso === u.id && styles.usoCardActive]} onPress={() => setPumpWizard({...pumpWizard, uso: u.id})}>
            <Text style={[styles.usoListTitle, { fontSize: 12, textAlign: 'center' }, pumpWizard.uso === u.id && styles.usoTitleActive]}>{u.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.grid2Cols}>
        <View style={styles.col}>
          <Text style={styles.inputTitleSmall}>{tCaudal}</Text>
          <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 15" placeholderTextColor={COLORS.gray4} value={adv.caudal} onChangeText={(t) => setAdv({...adv, caudal: t})} />
        </View>
        <View style={styles.col}>
          <Text style={styles.inputTitleSmall}>{tDiametro}</Text>
          <TouchableOpacity
            style={[
              styles.textInputSmall,
              allDiamsInvalid && { opacity: 0.45, backgroundColor: '#f0f0f0' },
              currentDiamInvalid && !allDiamsInvalid && { borderColor: '#c0392b', borderWidth: 1.5 }
            ]}
            onPress={() => !allDiamsInvalid && setShowDiamPicker(true)}
            disabled={allDiamsInvalid}
          >
            <Text style={{ color: allDiamsInvalid ? COLORS.gray3 : currentDiamInvalid ? '#c0392b' : COLORS.navy, fontSize: 14 }}>
              {FRICCION_DIAMS[adv.diamIdx]}
            </Text>
            {currentDiamInvalid && !allDiamsInvalid && <Text style={{ fontSize: 10, color: '#c0392b', marginTop: 1 }}>{tAvisoDiamInsuf}</Text>}
            {allDiamsInvalid && <Text style={{ fontSize: 10, color: COLORS.gray3, marginTop: 1 }}>{tAvisoDiamBloq}</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.grid2Cols}>
        <View style={styles.col}>
          <Text style={styles.inputTitleSmall}>{tLongitud}</Text>
          <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 200" placeholderTextColor={COLORS.gray4} value={adv.lRecta} onChangeText={(t) => setAdv({...adv, lRecta: t})} />
        </View>
        <View style={styles.col}>
          <Text style={styles.inputTitleSmall}>{tDesnivel}</Text>
          <TextInput style={styles.textInputSmall} keyboardType="numeric" placeholder="Ej: 1" placeholderTextColor={COLORS.gray4} value={adv.hGeo} onChangeText={(t) => setAdv({...adv, hGeo: t})} />
        </View>
      </View>

      <Text style={[styles.inputTitleSmall, { marginTop: 5, marginBottom: 5 }]}>{tAccesorios}</Text>
      <View style={styles.accGrid}>
        {FIT_HEADERS.map((h: any, i: number) => (
          <View key={h} style={styles.accCell}>
            <Text style={styles.accLabel}>{h}</Text>
            <TextInput
              style={styles.accInput}
              keyboardType="numeric"
              value={adv.acc[i] ? String(adv.acc[i]) : ''}
              onChangeText={(t) => {
                const n = parseInt(t) || 0;
                const newAcc = [...adv.acc];
                newAcc[i] = n;
                setAdv({...adv, acc: newAcc});
              }}
            />
          </View>
        ))}
      </View>


      {canBuscar && advResults && advResults.hTotal > 0 && (
        <View style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#e1e5eb' }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.navy, marginBottom: 8 }}>Resultados de Cañería</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: '#555' }}>Long. Equivalente Total:</Text>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>{advResults?.lTotal?.toFixed(2)} m</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: '#555' }}>Pérdida por Fricción:</Text>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>{advResults?.perdida?.toFixed(2)} m.c.a.</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e1e5eb' }}>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.navy }}>Altura Dinámica Total:</Text>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.green }}>{advResults?.hTotal?.toFixed(2)} m.c.a.</Text>
          </View>
        </View>
      )}

      <Modal visible={showDiamPicker} transparent animationType="fade" onRequestClose={() => setShowDiamPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowDiamPicker(false)}>
          <View style={{ width: '80%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', maxHeight: '70%' }}>
            <Text style={{ padding: 15, fontSize: 16, fontWeight: 'bold', backgroundColor: COLORS.navy, color: '#fff', textAlign: 'center' }}>Seleccionar Diámetro</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {FRICCION_DIAMS.map((d: any, idx: number) => {
                const s = interpolateFriction(advQ, idx).status;
                const isInvalid = s === 'above' || s === 'sin-datos';
                return (
                  <TouchableOpacity
                    key={d}
                    style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: isInvalid ? '#f9f9f9' : adv.diamIdx === idx ? '#f0f8ff' : '#fff' }}
                    onPress={() => { if (!isInvalid) { setAdv({...adv, diamIdx: idx}); setShowDiamPicker(false); } }}
                    disabled={isInvalid}
                  >
                    <Text style={{ fontSize: 15, color: isInvalid ? '#ccc' : COLORS.navy, fontWeight: adv.diamIdx === idx ? 'bold' : 'normal', textAlign: 'center' }}>
                      {d} {isInvalid && '(Fuera de rango)'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity
        style={[styles.calculateBtn, { marginTop: 10, paddingVertical: 10 }, !canBuscar && { backgroundColor: COLORS.gray4 }]}
        onPress={handleCalculate}
        disabled={!canBuscar}
      >
        <Text style={styles.calculateBtnText}>
          {canBuscar ? tBtnBuscar : (!hasUso ? 'Seleccionáá una categor�a arriba' : tAvisoSinCaudal)}
        </Text>
      </TouchableOpacity>
    </View>
  );
};



