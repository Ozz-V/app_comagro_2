import os

with open('src/components/CalculadoraModal.tsx', 'r', encoding='utf-8') as f:
    original_code = f.read()

start_func = "export default function CalculadoraModal("
start_idx = original_code.find(start_func)

start_body = original_code.find("{", start_idx) + 1
return_idx = original_code.find("  return (", start_body)

brain = original_code[start_body:return_idx]
imports = original_code[:start_idx]

logic_code = imports + f'''
export function useCalculatorLogic(visible: boolean, onClose: () => void, navigation: any) {{
{brain}
  return {{
    calcMode, setCalcMode, genUnit, setGenUnit, genFase, setGenFase, genStats, setGenStats,
    calcInput, setCalcInput, hasCalculated, setHasCalculated, motorState, setMotorState,
    bombaTab, setBombaTab, pumpWizard, setPumpWizard, adv, setAdv, showDiamPicker, setShowDiamPicker,
    calcResult, setCalcResult, motorResult, setMotorResult, waitingForCatalog, setWaitingForCatalog,
    motorWarning, setMotorWarning, motorResultTitle, setMotorResultTitle, wizardStep, setWizardStep,
    reglas, stepHp, handleUnitChange, handleCalculate, handleBack, getHeaderTitle
  }};
}}
'''

with open('src/hooks/useCalculatorLogic.ts', 'w', encoding='utf-8') as f:
    f.write(logic_code)

ui_body = original_code[return_idx:]

new_modal_code = f'''import React from 'react';
import {{ View, Text, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput }} from 'react-native';
import {{ COLORS }} from '../theme';
import {{ styles }} from './calculator/CalculatorStyles';
import SvgIcon from './SvgIcon';
import {{ GeneratorTab }} from './calculator/GeneratorTab';
import {{ MotorForm }} from './calculator/forms/MotorForm';
import {{ PumpTab }} from './calculator/PumpTab';
import {{ CalculatorResults }} from './calculator/CalculatorResults';
import {{ useCalculatorLogic }} from '../hooks/useCalculatorLogic';
import {{ FRICCION_DIAMS, interpolateFriction, FIT_HEADERS }} from '../utils/frictionLogic';

interface CalculadoraModalProps {{
  visible: boolean;
  onClose: () => void;
  navigation: any;
}}

export default function CalculadoraModal({{ visible, onClose, navigation }}: CalculadoraModalProps) {{
  const state = useCalculatorLogic(visible, onClose, navigation);
  
  const {{
    calcMode, setCalcMode, genUnit, setGenUnit, genFase, setGenFase, genStats,
    calcInput, setCalcInput, hasCalculated, setHasCalculated, motorState, setMotorState,
    bombaTab, setBombaTab, pumpWizard, setPumpWizard, adv, setAdv, showDiamPicker, setShowDiamPicker,
    calcResult, motorResult, waitingForCatalog, motorWarning, motorResultTitle, wizardStep, setWizardStep,
    reglas, stepHp, handleUnitChange, handleCalculate, handleBack, getHeaderTitle
  }} = state;

{ui_body}
'''

with open('src/components/CalculadoraModal.tsx', 'w', encoding='utf-8') as f:
    f.write(new_modal_code)

print("Split completed!")
