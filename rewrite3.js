const fs = require('fs');
let code = fs.readFileSync('src/components/CalculadoraModal.tsx', 'utf-8');

const motorStart = code.indexOf("{calcMode === 'motor' && (");
const nextBlockStart = code.indexOf("{hasCalculated && (parseFloat(calcInput) > 0", motorStart);

if (motorStart > -1 && nextBlockStart > -1) {
  // We want to stop replacing before </View>\n                )}\n\n                {hasCalculated
  // Let's find the closing view tag
  const blockEnd = code.lastIndexOf("</View>", nextBlockStart) + 7;
  const blockEnd2 = code.indexOf(")}", blockEnd) + 2;
  
  const motorBlock = code.substring(motorStart, blockEnd2);
  code = code.replace(motorBlock, "{calcMode === 'motor' && <MotorForm motorState={motorState} setMotorState={setMotorState} setHasCalculated={setHasCalculated} stepHp={stepHp} handleCalculate={handleCalculate} />}");
  console.log("Replaced Motor");
}

fs.writeFileSync('src/components/CalculadoraModal.tsx', code);
