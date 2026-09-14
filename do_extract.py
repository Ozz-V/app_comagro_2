with open('src/components/CalculadoraModal.tsx', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

# lines[865] is '{hasCalculated &&...'
# lines[994] is '              )}'

block = '\n'.join(lines[865:995])

with open('src/components/calculator/CalculatorResults.tsx', 'w', encoding='utf-8') as f2:
    f2.write(f'''import React from 'react';
import {{ View, Text, TouchableOpacity, ActivityIndicator, FlatList }} from 'react-native';
import {{ Image }} from 'expo-image';
import {{ styles }} from './CalculatorStyles';
import {{ COLORS }} from '../../theme';
import SvgIcon from '../SvgIcon';
import {{ estimateGenerador, estimateMotor }} from '../../utils/calculations';

export const CalculatorResults = ({{
  hasCalculated, calcInput, calcMode, genUnit, genFase,
  waitingForCatalog, motorWarning, calcResult, motorResult, motorResultTitle,
  navigation, onClose
}}: any) => {{
  return (
    <>
{block}
    </>
  );
}};
''')

replacement = '''              <CalculatorResults 
                hasCalculated={hasCalculated} calcInput={calcInput} calcMode={calcMode}
                genUnit={genUnit} genFase={genFase} waitingForCatalog={waitingForCatalog}
                motorWarning={motorWarning} calcResult={calcResult} motorResult={motorResult}
                motorResultTitle={motorResultTitle} navigation={navigation} onClose={onClose}
              />'''

new_lines = lines[:865] + [replacement] + lines[995:]
new_code = '\n'.join(new_lines)
if 'import { CalculatorResults }' not in new_code:
    new_code = new_code.replace("import { PumpTab } from './calculator/PumpTab';", "import { PumpTab } from './calculator/PumpTab';\nimport { CalculatorResults } from './calculator/CalculatorResults';")

with open('src/components/CalculadoraModal.tsx', 'w', encoding='utf-8') as f:
    f.write(new_code)
