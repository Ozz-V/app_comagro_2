const fs = require('fs');
const path = require('path');

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

const dict = {
    'Tensi\ufffdn el\ufffdctrica': 'Tensión eléctrica',
    'Monof\ufffdsico': 'Monofásico',
    'Trif\ufffdsico': 'Trifásico',
    'C\ufffdLCULO AVANZADO': 'CÁLCULO AVANZADO',
    'C\ufffdlculo Avanzado': 'Cálculo Avanzado',
    'Tensi\ufffdn': 'Tensión',
    '\ufffdPara qu\ufffd necesita la bomba\ufffd': '¿Para qué necesita la bomba?',
    'Alimentaci\ufffdn El\ufffdctrica': 'Alimentación Eléctrica',
    'Elevaci\ufffdn': 'Elevación',
    'Estimaci\ufffdn r\ufffdpida': 'Estimación rápida',
    'Informaci\ufffdn': 'Información',
    'informaci\ufffdn': 'información',
    'cat\ufffdlogo': 'catálogo',
    'Cat\ufffdlogo': 'Catálogo',
    'Di\ufffdmetro': 'Diámetro',
    'v\ufffdlidas': 'válidas',
    'Ingres\ufffd': 'Ingresá',
    'Categor\ufffda': 'Categoría',
    'l\ufffdmite': 'límite',
    'El\ufffdctrico': 'Eléctrico',
    'EL\ufffdCTRICO': 'ELÉCTRICO',
    'Funci\ufffdn': 'Función',
    's?': '⚠️',
    'ten\ufffds': 'tenés',
    'presi\ufffdn': 'presión',
    'Presi\ufffdn': 'Presión'
};

files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        let changed = false;
        for (const [bad, good] of Object.entries(dict)) {
            if (content.includes(bad)) {
                content = content.split(bad).join(good);
                changed = true;
            }
        }
        if (changed) {
            fs.writeFileSync(file, content, 'utf8');
            console.log('Fixed ' + file);
        }
    }
});
