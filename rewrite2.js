const fs = require('fs');
let code = fs.readFileSync('src/components/CalculadoraModal.tsx', 'utf-8');

// The Generator UI starts at:
// {calcMode === 'gen' && (
//   <View style={{ marginBottom: 15 }}>
//     <Text style={styles.inputTitleSmall}>Unidad de medida</Text>

// It ends before {calcMode === 'motor' && (

const motorStart = code.indexOf("{calcMode === 'motor' && (");
const genStart = code.lastIndexOf("{calcMode === 'gen' && (", motorStart);

if (genStart > -1 && motorStart > -1) {
  const genBlock = code.substring(genStart, motorStart);
  code = code.replace(genBlock, "{calcMode === 'gen' && <GeneratorTab genUnit={genUnit} setGenUnit={setGenUnit} genFase={genFase} setGenFase={setGenFase} genStats={genStats} calcInput={calcInput} setCalcInput={setCalcInput} setHasCalculated={setHasCalculated} handleCalculate={handleCalculate} />}\n\n                  ");
  console.log("Replaced Generator");
}

fs.writeFileSync('src/components/CalculadoraModal.tsx', code);
