import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { styles } from '../CalculatorStyles';

export const PumpGuidedForm = ({ wizardStep, setWizardStep, pumpWizard, setPumpWizard, handleUnitChange, stepHp, handleCalculate, reglas, COLORS }: any) => {
  return (
    <View style={styles.guiadoContainer}>
      {wizardStep === 1 ? (
        <View>
          <Text style={styles.inputTitleSmall}>�Para qu� necesita la bomba?</Text>
          <View style={styles.usosList}>
            {reglas?.categorias?.map((u: any) => (
              <TouchableOpacity key={u.id} style={[styles.usoListCard, pumpWizard.uso === u.id && styles.usoCardActive]} onPress={() => setPumpWizard({...pumpWizard, uso: u.id})}>
                <Text style={[styles.usoListTitle, pumpWizard.uso === u.id && styles.usoTitleActive]}>{u.title}</Text>
                <Text style={styles.usoListSubtitle}>{u.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.calculateBtn, !pumpWizard.uso && { backgroundColor: COLORS.gray4 }]} disabled={!pumpWizard.uso} onPress={() => setWizardStep(2)}>
            <Text style={styles.calculateBtnText}>Siguiente ➔</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <View style={styles.colList}>
             <View style={styles.colListRow}>
                <Text style={styles.inputTitleSmall}>Caudal</Text>
                <View style={styles.unitTabs}>
                   <TouchableOpacity style={[styles.unitTabBtn, pumpWizard.unidadCaudal === 'l/min' && styles.unitTabBtnActive]} onPress={() => handleUnitChange('l/min')}>
                      <Text style={[styles.unitTabTxt, pumpWizard.unidadCaudal === 'l/min' && styles.unitTabTxtActive]}>L/min</Text>
                   </TouchableOpacity>
                   <TouchableOpacity style={[styles.unitTabBtn, pumpWizard.unidadCaudal === 'm³/h' && styles.unitTabBtnActive]} onPress={() => handleUnitChange('m³/h')}>
                      <Text style={[styles.unitTabTxt, pumpWizard.unidadCaudal === 'm³/h' && styles.unitTabTxtActive]}>m³/h</Text>
                   </TouchableOpacity>
                   <TouchableOpacity style={[styles.unitTabBtn, pumpWizard.unidadCaudal === 'l/h' && styles.unitTabBtnActive]} onPress={() => handleUnitChange('l/h')}>
                      <Text style={[styles.unitTabTxt, pumpWizard.unidadCaudal === 'l/h' && styles.unitTabTxtActive]}>L/h</Text>
                   </TouchableOpacity>
                </View>
                <View style={styles.caudalRow}>
                  <TextInput style={[styles.textInputSmall, { flex: 1, marginHorizontal: 0, marginRight: 5 }]} keyboardType="numeric" placeholder="Ej: 100" placeholderTextColor={COLORS.gray4} value={pumpWizard.caudal} onChangeText={(t) => setPumpWizard({...pumpWizard, caudal: t})} />
                </View>
             </View>

             <View style={[styles.colListRow, { marginTop: 15 }]}>
                <Text style={styles.inputTitleSmall}>Altura de Elevación (m.c.a.)</Text>
                <TextInput style={[styles.textInputSmall, { marginHorizontal: 0 }]} keyboardType="numeric" placeholder="mca (Ej: 20)" placeholderTextColor={COLORS.gray4} value={pumpWizard.altura} maxLength={4} onChangeText={(t) => setPumpWizard({...pumpWizard, altura: t})} />
             </View>

             <View style={[styles.colListRow, { marginTop: 15 }]}>
                <Text style={styles.inputTitleSmall}>Potencia (HP) (Opcional)</Text>
                <View style={[styles.inputRow, { marginBottom: 0 }]}>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(pumpWizard.hp || '0') || 0; setPumpWizard({...pumpWizard, hp: current > 0 ? String(stepHp(current, 'down')) : ''}); }}>
                    <Text style={styles.counterBtnText}>-</Text>
                  </TouchableOpacity>
                  <TextInput style={styles.textInput} keyboardType="numeric" placeholder="Ej: 2.5" placeholderTextColor={COLORS.gray4} value={pumpWizard.hp} onChangeText={(t) => setPumpWizard({...pumpWizard, hp: t})} />
                  <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(pumpWizard.hp || '0') || 0; setPumpWizard({...pumpWizard, hp: String(stepHp(current, 'up'))}); }}>
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
             </View>
          </View>

          <Text style={{fontSize: 12, marginBottom: 10, textAlign: 'center', color: COLORS.gray4}}>
            * Ingresa al menos uno de los valores para calcular
          </Text>

          {pumpWizard.uso !== 'combustion' && (
            <>
              <Text style={styles.inputTitleSmall}>Alimentación Eléctrica (Opcional)</Text>
              <View style={styles.faseGrid}>
                <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '220v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '220v' ? '' : '220v'})}>
                  <Text style={[styles.faseBtnText, pumpWizard.fase === '220v' && styles.faseBtnTextActive]}>Monofásico</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === '380v' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === '380v' ? '' : '380v'})}>
                  <Text style={[styles.faseBtnText, pumpWizard.fase === '380v' && styles.faseBtnTextActive]}>Trifásico</Text>
                </TouchableOpacity>

                {(!['combustion', 'drenaje', 'vivienda'].includes(pumpWizard.uso)) && (
                  <TouchableOpacity style={[styles.faseBtn, pumpWizard.fase === 'sinelec' && styles.faseBtnActive]} onPress={() => setPumpWizard({...pumpWizard, fase: pumpWizard.fase === 'sinelec' ? '' : 'sinelec'})}>
                    <Text style={[styles.faseBtnText, pumpWizard.fase === 'sinelec' && styles.faseBtnTextActive]}>Sin Motor</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          <TouchableOpacity 
            style={[styles.calculateBtn, {paddingVertical: 10, marginBottom: 5}, (!pumpWizard.caudal && !pumpWizard.altura && !pumpWizard.hp) && { backgroundColor: COLORS.gray4 }]} 
            disabled={!pumpWizard.caudal && !pumpWizard.altura && !pumpWizard.hp}
            onPress={handleCalculate}
          >
            <Text style={styles.calculateBtnText}>Ver Recomendaciones</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

