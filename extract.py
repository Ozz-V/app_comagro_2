import re

with open('src/components/CalculadoraModal.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

start_marker = "{hasCalculated && (parseFloat(calcInput) > 0 || calcMode === 'bomba' || calcMode === 'motor') && ("
end_marker = "<Modal visible={showDiamPicker}"

start_idx = code.find(start_marker)
end_idx = code.find(end_marker)

if start_idx != -1 and end_idx != -1:
    # We want to keep </View>\n          )}\n          </ScrollView>\n        </View>\n\n        
    # Let's find the </ScrollView>
    scrollview_end = code.rfind("</ScrollView>", start_idx, end_idx) + len("</ScrollView>")
    
    # We will replace from start_marker to just before </ScrollView>
    block_to_replace = code[start_idx:scrollview_end - len("</ScrollView>")]
    
    with open('src/components/calculator/CalculatorResults.tsx', 'w', encoding='utf-8') as f2:
        f2.write(f'''import React from 'react';
import {{ View, Text, TouchableOpacity, ActivityIndicator, FlatList, Image }} from 'react-native';
import {{ styles }} from './CalculatorStyles';
import {{ COLORS }} from '../../theme';
import SvgIcon from '../SvgIcon';
import {{ estimateGenerador, estimateMotor }} from '../../utils/calculations';

export const CalculatorResults = ({{
  hasCalculated, calcInput, calcMode, genUnit, genFase,
  waitingForCatalog, motorWarning, calcResult, motorResult, motorResultTitle,
  navigation, onClose, pumpColorMap
}}: any) => {{
  return (
    <>
{block_to_replace}
    </>
  );
}};
''')

    replacement = '''<CalculatorResults 
              hasCalculated={hasCalculated} calcInput={calcInput} calcMode={calcMode}
              genUnit={genUnit} genFase={genFase} waitingForCatalog={waitingForCatalog}
              motorWarning={motorWarning} calcResult={calcResult} motorResult={motorResult}
              motorResultTitle={motorResultTitle} navigation={navigation} onClose={onClose}
              pumpColorMap={new Map()}
            />
          '''
          
    new_code = code[:start_idx] + replacement + code[scrollview_end - len("</ScrollView>"):]
    if 'import { CalculatorResults }' not in new_code:
        new_code = new_code.replace("import { PumpTab } from './calculator/PumpTab';", "import { PumpTab } from './calculator/PumpTab';\nimport { CalculatorResults } from './calculator/CalculatorResults';")
        
    with open('src/components/CalculadoraModal.tsx', 'w', encoding='utf-8') as f:
        f.write(new_code)
    print("SUCCESS")
else:
    print("FAILED TO FIND")
