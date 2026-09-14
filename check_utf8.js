const fs = require('fs');

const files = [
    'src/hooks/useCalculatorLogic.ts',
    'src/components/CalculadoraModal.tsx',
    'src/components/calculator/CalculatorResults.tsx',
    'src/components/calculator/PumpTab.tsx',
    'src/components/calculator/GeneratorTab.tsx',
    'src/components/calculator/pump/PumpAdvancedForm.tsx',
    'src/components/calculator/pump/PumpGuidedForm.tsx',
    'src/components/calculator/forms/MotorForm.tsx'
];

files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        let lines = content.split('\n');
        lines.forEach((line, i) => {
            if (line.includes('\ufffd')) {
                console.log(file + ':' + (i+1) + ' -> ' + line.trim());
            }
        });
    }
});
