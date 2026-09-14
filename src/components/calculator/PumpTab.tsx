import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { PumpGuidedForm } from './PumpGuidedForm';
import { PumpAdvancedForm } from './PumpAdvancedForm';
import { styles } from '../CalculatorStyles';

export const PumpTab: React.FC<any> = ({ bombaTab, setBombaTab }) => {
  return (
    <View style={{ marginBottom: 15 }}>
      <View style={styles.unitTabs}>
        <TouchableOpacity style={[styles.unitTabBtn, bombaTab === 'guiado' && styles.unitTabBtnActive]} onPress={() => setBombaTab('guiado')}>
          <Text style={[styles.unitTabTxt, bombaTab === 'guiado' && styles.unitTabTxtActive]}>Búsqueda Guiada</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.unitTabBtn, bombaTab === 'avanzado' && styles.unitTabBtnActive]} onPress={() => setBombaTab('avanzado')}>
          <Text style={[styles.unitTabTxt, bombaTab === 'avanzado' && styles.unitTabTxtActive]}>Búsqueda Avanzada</Text>
        </TouchableOpacity>
      </View>
      
      {bombaTab === 'guiado' ? <PumpGuidedForm /> : <PumpAdvancedForm />}
    </View>
  );
};
