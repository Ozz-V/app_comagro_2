import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { styles } from './CalculatorStyles';
import { COLORS } from '../../theme';

interface GeneratorTabProps {
  genUnit: 'KVA' | 'AMPER';
  setGenUnit: (u: 'KVA' | 'AMPER') => void;
  genFase: '220v' | '380v';
  setGenFase: (f: '220v' | '380v') => void;
  genStats: { min380: number; max220: number };
  calcInput: string;
  setCalcInput: (val: string) => void;
  setHasCalculated: (val: boolean) => void;
  handleCalculate: () => void;
}

export const GeneratorTab: React.FC<GeneratorTabProps> = ({ genUnit, setGenUnit, genFase, setGenFase, genStats, calcInput, setCalcInput, setHasCalculated, handleCalculate }) => {
  const genValInput = parseFloat(calcInput) || 0;
  let kva220 = genValInput;
  let kva380 = genValInput;
  if (genUnit === 'AMPER') {
      kva220 = (genValInput * 220) / 1000;
      kva380 = (genValInput * 380 * 1.732) / 1000;
  }
  
  const is220Disabled = genValInput > 0 && genStats.max220 > 0 && kva220 > genStats.max220 * 1.3;
  const is380Disabled = genValInput > 0 && genStats.min380 > 0 && kva380 < genStats.min380 * 0.7;

  if (is220Disabled && genFase === '220v') setTimeout(() => setGenFase('380v'), 0);
  if (is380Disabled && genFase === '380v') setTimeout(() => setGenFase('220v'), 0);

  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={styles.inputTitleSmall}>Unidad de medida</Text>
      <View style={[styles.unitTabs, { marginBottom: 15 }]}>
        <TouchableOpacity style={[styles.unitTabBtn, genUnit === 'KVA' && styles.unitTabBtnActive]} onPress={() => {setGenUnit('KVA'); setHasCalculated(false);}}>
          <Text style={[styles.unitTabTxt, genUnit === 'KVA' && styles.unitTabTxtActive]}>KVA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.unitTabBtn, genUnit === 'AMPER' && styles.unitTabBtnActive]} onPress={() => {setGenUnit('AMPER'); setHasCalculated(false);}}>
          <Text style={[styles.unitTabTxt, genUnit === 'AMPER' && styles.unitTabTxtActive]}>AMPERES</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginBottom: 15 }}>
        <Text style={styles.inputTitleSmall}>Tensión eléctrica</Text>
        <View style={styles.unitTabs}>
          <TouchableOpacity 
            disabled={is220Disabled}
            style={[styles.unitTabBtn, genFase === '220v' && styles.unitTabBtnActive, is220Disabled && { opacity: 0.3 }]} 
            onPress={() => {setGenFase('220v'); setHasCalculated(false);}}
          >
            <Text style={[styles.unitTabTxt, genFase === '220v' && styles.unitTabTxtActive]}>Monofásico</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            disabled={is380Disabled}
            style={[styles.unitTabBtn, genFase === '380v' && styles.unitTabBtnActive, is380Disabled && { opacity: 0.3 }]} 
            onPress={() => {setGenFase('380v'); setHasCalculated(false);}}
          >
            <Text style={[styles.unitTabTxt, genFase === '380v' && styles.unitTabTxtActive]}>Trifásico</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View>
        <Text style={styles.inputTitleSmall}>Valor en {genUnit === 'KVA' ? 'KVA' : 'Amperes'}</Text>
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(calcInput) || 0; if (current > 1) { setCalcInput(String(current - 1)); setHasCalculated(false); } }}>
            <Text style={styles.counterBtnText}>-</Text>
          </TouchableOpacity>
          <TextInput style={styles.textInput} keyboardType="numeric" placeholder="Ej: 50" placeholderTextColor={COLORS.gray4} value={calcInput} onChangeText={(t) => { setCalcInput(t); setHasCalculated(false); }} />
          <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(calcInput) || 0; const max = genUnit === 'KVA' ? 3000 : 5000; if (current < max) { setCalcInput(String(current + 1)); setHasCalculated(false); } }}>
            <Text style={styles.counterBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.calculateBtn} onPress={handleCalculate}>
          <Text style={styles.calculateBtnText}>Calcular y Ver Equipos</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
