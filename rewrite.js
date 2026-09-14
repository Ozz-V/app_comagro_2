const fs = require('fs');
let code = fs.readFileSync('src/components/CalculadoraModal.tsx', 'utf-8');

// 1. Add Imports
code = code.replace(
  "import SvgIcon from './SvgIcon';",
  "import SvgIcon from './SvgIcon';\nimport { GeneratorTab } from './calculator/GeneratorTab';\nimport { MotorForm } from './calculator/forms/MotorForm';\nimport { PumpTab } from './calculator/PumpTab';"
);

// 2. Replace Generator UI
const genStart = code.indexOf("{calcMode === 'gen' && (");
const genEndString = ")\}\n                  <\/View>";
const genMatch = code.match(/\{calcMode === 'gen' && \([\s\S]*?\}\)\n                  <\/View>/);

if (genMatch) {
  code = code.replace(
    genMatch[0], 
    "{calcMode === 'gen' && <GeneratorTab genUnit={genUnit} setGenUnit={setGenUnit} genFase={genFase} setGenFase={setGenFase} genStats={genStats} calcInput={calcInput} setCalcInput={setCalcInput} setHasCalculated={setHasCalculated} handleCalculate={handleCalculate} />}\n                  </View>"
  );
  console.log('Generator block replaced!');
} else {
  console.log('Generator block NOT found');
}

// 3. Replace Motor UI
const motorMatch = code.match(/\{calcMode === 'motor' && \([\s\S]*?\}\)\n                  \}\)/);
if (motorMatch) {
  code = code.replace(
    motorMatch[0],
    "{calcMode === 'motor' && <MotorForm motorState={motorState} setMotorState={setMotorState} setHasCalculated={setHasCalculated} stepHp={stepHp} handleCalculate={handleCalculate} />}\n                  })"
  );
  console.log('Motor block replaced!');
} else {
  console.log('Motor block NOT found');
}

// 4. Replace Pump UI
const pumpMatch = code.match(/\{calcMode === 'bomba' \? \([\s\S]*?<\/View>\n                  \) : null\}/);
if (pumpMatch) {
  code = code.replace(
    pumpMatch[0],
    "{calcMode === 'bomba' ? <PumpTab bombaTab={bombaTab} setBombaTab={setBombaTab} pumpWizard={pumpWizard} setPumpWizard={setPumpWizard} adv={adv} setAdv={setAdv} setHasCalculated={setHasCalculated} handleCalculate={handleCalculate} /> : null}"
  );
  console.log('Pump block replaced!');
} else {
  console.log('Pump block NOT found');
}

fs.writeFileSync('src/components/CalculadoraModal.tsx', code);
