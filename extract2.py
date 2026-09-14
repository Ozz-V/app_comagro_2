import re

with open('src/components/CalculadoraModal.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

start_marker = "{hasCalculated && (parseFloat(calcInput) > 0 || calcMode === 'bomba' || calcMode === 'motor') && ("
end_marker = "</ScrollView>"

start_idx = code.find(start_marker)
end_idx = code.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    block_to_replace = code[start_idx:end_idx]
    
    # We must preserve the closing </View> and )} that belong to the else branch (if any) or just the wrapper View.
    # Looking at the code:
    #             </View>
    #           )}
    #           </ScrollView>
    # We want to extract up to the end of the hasCalculated block. 
    # Let's find the closing tags of the hasCalculated block.
    
    # A safe way is to replace up to the exact end of the hasCalculated block, but since we know it ends right before </View>\n          )}\n          </ScrollView>, we can use rfind.
    
    view_close = code.rfind("</View>", start_idx, end_idx)
    bracket_close = code.rfind(")}", view_close, end_idx)
    
    actual_block = code[start_idx:bracket_close+2]

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
{actual_block}
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
              />'''
          
    new_code = code[:start_idx] + replacement + code[bracket_close+2:]
    if 'import { CalculatorResults }' not in new_code:
        new_code = new_code.replace("import { PumpTab } from './calculator/PumpTab';", "import { PumpTab } from './calculator/PumpTab';\nimport { CalculatorResults } from './calculator/CalculatorResults';")
        
    with open('src/components/CalculadoraModal.tsx', 'w', encoding='utf-8') as f:
        f.write(new_code)
    print("SUCCESS")
else:
    print("FAILED TO FIND")
