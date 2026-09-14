import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { styles } from '../CalculatorStyles';
import { COLORS } from '../../../theme';

interface MotorFormProps {
  motorState: { hp: string; polos: string; fase: string };
  setMotorState: (state: { hp: string; polos: string; fase: string }) => void;
  setHasCalculated: (val: boolean) => void;
  stepHp: (current: number, direction: 'up' | 'down') => number;
  handleCalculate: () => void;
}

export const MotorForm: React.FC<MotorFormProps> = ({ motorState, setMotorState, setHasCalculated, stepHp, handleCalculate }) => {
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={styles.inputTitleSmall}>Potencia (HP)</Text>
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(motorState.hp || '0') || 0; setMotorState({...motorState, hp: current > 0 ? String(stepHp(current, 'down')) : ''}); setHasCalculated(false); }}>
          <Text style={styles.counterBtnText}>-</Text>
        </TouchableOpacity>
        <TextInput style={styles.textInput} keyboardType="numeric" placeholder="Ej: 5.5" placeholderTextColor={COLORS.gray4} value={motorState.hp} onChangeText={(t) => { setMotorState({...motorState, hp: t}); setHasCalculated(false); }} />
        <TouchableOpacity style={styles.counterBtn} onPress={() => { const current = parseFloat(motorState.hp || '0') || 0; setMotorState({...motorState, hp: String(stepHp(current, 'up'))}); setHasCalculated(false); }}>
          <Text style={styles.counterBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.inputTitleSmall}>Polos</Text>
      <View style={styles.faseGrid}>
        {[2, 4, 6].map(polo => (
            <TouchableOpacity key={polo} style={[styles.faseBtn, motorState.polos === String(polo) && styles.faseBtnActive]} onPress={() => { setMotorState({...motorState, polos: motorState.polos === String(polo) ? '' : String(polo)}); setHasCalculated(false); }}>
              <Text style={[styles.faseBtnText, motorState.polos === String(polo) && styles.faseBtnTextActive]}>{polo} Polos</Text>
            </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.inputTitleSmall}>Tensión eléctrica</Text>
      <View style={styles.unitTabs}>
        <TouchableOpacity style={[styles.unitTabBtn, motorState.fase === '220v' && styles.unitTabBtnActive]} onPress={() => {setMotorState({...motorState, fase: motorState.fase === '220v' ? '' : '220v'}); setHasCalculated(false);}}>
          <Text style={[styles.unitTabTxt, motorState.fase === '220v' && styles.unitTabTxtActive]}>Monofásico</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.unitTabBtn, motorState.fase === '380v' && styles.unitTabBtnActive]} onPress={() => {setMotorState({...motorState, fase: motorState.fase === '380v' ? '' : '380v'}); setHasCalculated(false);}}>
          <Text style={[styles.unitTabTxt, motorState.fase === '380v' && styles.unitTabTxtActive]}>Trifásico</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.calculateBtn, {marginTop: 20}]} onPress={handleCalculate}>
        <Text style={styles.calculateBtnText}>Buscar Motores</Text>
      </TouchableOpacity>
    </View>
  );
};

