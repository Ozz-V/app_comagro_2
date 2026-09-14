import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './CalculatorStyles';
import { PumpGuidedForm } from './pump/PumpGuidedForm';
import { PumpAdvancedForm } from './pump/PumpAdvancedForm';

export const PumpTab = ({ 
  bombaTab, setBombaTab, 
  pumpWizard, setPumpWizard, 
  adv, setAdv, 
  setHasCalculated, handleCalculate, 
  wizardStep, setWizardStep, 
  handleUnitChange, stepHp,
  reglas, interpolateFriction, FRICCION_DIAMS, FIT_HEADERS, COLORS
}: any) => {
  return (
    <View>
      {!(bombaTab === 'guiado' && wizardStep > 1) && (
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, bombaTab === 'guiado' && styles.tabBtnActive]} onPress={() => { setBombaTab('guiado'); setHasCalculated(false); /* need to clear results via props if needed */ }}>
            <Text style={[styles.tabText, bombaTab === 'guiado' && styles.tabTextActive]}>GUIADO</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, bombaTab === 'avanzado' && styles.tabBtnActive]} onPress={() => { setBombaTab('avanzado'); setHasCalculated(false); }}>
            <Text style={[styles.tabText, bombaTab === 'avanzado' && styles.tabTextActive]}>CÁLCULO AVANZADO</Text>
          </TouchableOpacity>
        </View>
      )}

      {bombaTab === 'avanzado' ? (
        <PumpAdvancedForm 
          pumpWizard={pumpWizard} setPumpWizard={setPumpWizard}
          adv={adv} setAdv={setAdv}
          reglas={reglas} handleCalculate={handleCalculate}
          interpolateFriction={interpolateFriction}
          FRICCION_DIAMS={FRICCION_DIAMS}
          FIT_HEADERS={FIT_HEADERS}
          COLORS={COLORS}
        />
      ) : (
        <PumpGuidedForm 
          wizardStep={wizardStep} setWizardStep={setWizardStep}
          pumpWizard={pumpWizard} setPumpWizard={setPumpWizard}
          handleUnitChange={handleUnitChange} stepHp={stepHp}
          handleCalculate={handleCalculate}
          reglas={reglas} COLORS={COLORS}
        />
      )}
    </View>
  );
};

