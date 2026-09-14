import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { COLORS } from '../theme';
import { styles } from './calculator/CalculatorStyles';
import SvgIcon from './SvgIcon';
import { GeneratorTab } from './calculator/GeneratorTab';
import { MotorForm } from './calculator/forms/MotorForm';
import { PumpTab } from './calculator/PumpTab';
import { CalculatorResults } from './calculator/CalculatorResults';
import { useCalculatorLogic } from '../hooks/useCalculatorLogic';
import { FRICCION_DIAMS, interpolateFriction, FIT_HEADERS } from '../utils/frictionLogic';

interface CalculadoraModalProps {
  visible: boolean;
  onClose: () => void;
  navigation: any;
}

export default function CalculadoraModal({ visible, onClose, navigation }: CalculadoraModalProps) {
  const state = useCalculatorLogic(visible, onClose, navigation);
  
  const {
    calcMode, setCalcMode, genUnit, setGenUnit, genFase, setGenFase, genStats,
    calcInput, setCalcInput, hasCalculated, setHasCalculated, motorState, setMotorState,
    bombaTab, setBombaTab, pumpWizard, setPumpWizard, adv, setAdv, showDiamPicker, setShowDiamPicker,
    calcResult, setCalcResult, motorResult, setMotorResult, waitingForCatalog, motorWarning, motorResultTitle, wizardStep, setWizardStep,
    reglas, stepHp, handleUnitChange, handleCalculate, handleBack, getHeaderTitle
  } = state;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleBack}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.modalContent}>
          <View style={[styles.header, { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center' }]}>
            <View style={{ width: 30 }} />
            <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
            {!calcMode ? (
              <TouchableOpacity onPress={onClose} style={{ padding: 5 }}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            ) : <View style={{ width: 30 }} />}
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!calcMode ? (
            <View>
              <Text style={styles.subtitle}>Seleccioná un tipo de equipo para hacer un cálculo rápido:</Text>
              <View style={styles.optionsContainer}>
                <TouchableOpacity onPress={() => { setCalcMode('gen'); setHasCalculated(false); setCalcResult(null); setMotorResult(null); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="gen" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Generador Eléctrico</Text>
                    <Text style={styles.optionSubtitle}>Cálculo rápido en KVA</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('motor'); setHasCalculated(false); setCalcResult(null); setMotorResult(null); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="motor" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Motor Eléctrico</Text>
                    <Text style={styles.optionSubtitle}>Cálculo rápido en HP</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setCalcMode('bomba'); setBombaTab('guiado'); setHasCalculated(false); setCalcResult(null); setMotorResult(null); setWizardStep(1); }} style={styles.optionCard}>
                  <View style={styles.iconContainer}>
                    <SvgIcon name="bomba" size={28} color={COLORS.navy} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Bomba de Agua</Text>
                    <Text style={styles.optionSubtitle}>Cálculo por Altura y Caudal</Text>
                  </View>
                  <Text style={styles.arrowIcon}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              {calcMode === 'bomba' && (
                <PumpTab 
                  bombaTab={bombaTab} setBombaTab={setBombaTab} 
                  pumpWizard={pumpWizard} setPumpWizard={setPumpWizard} 
                  adv={adv} setAdv={setAdv} 
                  setHasCalculated={setHasCalculated} handleCalculate={handleCalculate}
                  wizardStep={wizardStep} setWizardStep={setWizardStep}
                  handleUnitChange={handleUnitChange} stepHp={stepHp}
                  reglas={reglas} interpolateFriction={interpolateFriction}
                  FRICCION_DIAMS={FRICCION_DIAMS} FIT_HEADERS={FIT_HEADERS}
                  COLORS={COLORS}
                />
              )}

              {calcMode === 'gen' && (
                <GeneratorTab 
                  genUnit={genUnit} setGenUnit={setGenUnit} 
                  genFase={genFase} setGenFase={setGenFase} 
                  genStats={genStats} calcInput={calcInput} 
                  setCalcInput={setCalcInput} setHasCalculated={setHasCalculated} 
                  handleCalculate={handleCalculate} 
                />
              )}

              {calcMode === 'motor' && (
                <MotorForm 
                  motorState={motorState} setMotorState={setMotorState} 
                  setHasCalculated={setHasCalculated} stepHp={stepHp} 
                  handleCalculate={handleCalculate} 
                />
              )}

              <CalculatorResults 
                hasCalculated={hasCalculated} calcInput={calcInput} calcMode={calcMode}
                genUnit={genUnit} genFase={genFase} waitingForCatalog={waitingForCatalog}
                motorWarning={motorWarning} calcResult={calcResult} motorResult={motorResult}
                motorResultTitle={motorResultTitle} navigation={navigation} onClose={onClose}
              />

            </View>
          )}
          </ScrollView>
        </View>

        <Modal visible={showDiamPicker} transparent animationType="fade" onRequestClose={() => setShowDiamPicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: '80%', backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '80%' }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.navy, marginBottom: 4, textAlign: 'center' }}>Seleccione Diámetro</Text>
              <Text style={{ fontSize: 12, color: COLORS.gray3, marginBottom: 15, textAlign: 'center' }}>
                {parseFloat(adv.caudal) > 0 ? `Para ${adv.caudal} ${adv.unidadCaudal} — los grises no son válidos` : 'Ingresá el caudal primero para ver opciones válidas'}
              </Text>
              <ScrollView style={{ flexShrink: 1, width: '100%' }} showsVerticalScrollIndicator={true}>
                {FRICCION_DIAMS.map((d, index) => {
                  const qRaw = parseFloat(adv.caudal) || 0;
                  let qM3h = qRaw;
                  if (adv.unidadCaudal === 'l/min') qM3h = qRaw * 60 / 1000;
                  else if (adv.unidadCaudal === 'l/h') qM3h = qRaw / 1000;
                  const { status } = qM3h > 0 ? interpolateFriction(qM3h, index) : { status: 'ok' as const };
                  const isInvalid = status === 'above' || status === 'sin-datos';
                  const isSelected = adv.diamIdx === index;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', opacity: isInvalid ? 0.3 : 1 }}
                      onPress={() => { setAdv({...adv, diamIdx: index}); setShowDiamPicker(false); }}
                      disabled={isInvalid}
                    >
                      <Text style={{ fontSize: 16, color: isSelected ? COLORS.green : (isInvalid ? COLORS.gray3 : COLORS.navy), fontWeight: isSelected ? 'bold' : 'normal' }}>
                        {d}
                      </Text>
                      {isInvalid && <Text style={{ fontSize: 11, color: '#c0392b', marginLeft: 8 }}>✗ caudal excede límite</Text>}
                      {isSelected && !isInvalid && <Text style={{ fontSize: 11, color: COLORS.green, marginLeft: 8 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={{ marginTop: 15, padding: 12, backgroundColor: COLORS.navy, borderRadius: 8 }} onPress={() => setShowDiamPicker(false)}>
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </Modal>
  );
}








