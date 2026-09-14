const fs = require('fs');

const replacements = {
    'Tensi\ufffdn el\ufffdctrica': 'Tensión eléctrica',
    'Monof\ufffdsico': 'Monofásico',
    'Trif\ufffdsico': 'Trifásico',
    'C\ufffdLCULO AVANZADO': 'CÁLCULO AVANZADO',
    'C\ufffdlculo Avanzado': 'Cálculo Avanzado',
    '\ufffdPara qu\ufffd necesita la bomba\ufffd': '¿Para qué necesita la bomba?',
    'Alimentaci\ufffdn El\ufffdctrica': 'Alimentación Eléctrica',
    'Elevaci\ufffdn': 'Elevación',
    'Estimaci\ufffdn r\ufffdpida': 'Estimación rápida',
    'Informaci\ufffdn': 'Información',
    'cat\ufffdlogo': 'catálogo',
    'Cat\ufffdlogo': 'Catálogo',
    'Di\ufffdmetro': 'Diámetro',
    'v\ufffdlidas': 'válidas',
    'Ingres\ufffd': 'Ingresá',
    'Categor\ufffda': 'Categoría',
    'categor\ufffda': 'categoría',
    'l\ufffdmite': 'límite',
    'El\ufffdctrico': 'Eléctrico',
    'EL\ufffdCTRICO': 'ELÉCTRICO',
    'Funci\ufffdn': 'Función',
    'presi\ufffdn': 'presión',
    'Presi\ufffdn': 'Presión',
    '\ufffds\ufffd? El requerimiento supera el l\ufffdmite para equipos Monof\ufffdsicos. Intente con Trif\ufffdsico.': '⚠️ El requerimiento supera el límite para equipos Monofásicos. Intente con Trifásico.',
    'Seleccion\ufffd una categor\ufffda arriba': 'Seleccioná una categoría arriba',
    'm\ufffd/h': 'm³/h',
    'Ca\ufffder\ufffda': 'Cañería',
    'fricci\ufffdn': 'fricción'
};

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
        let changed = false;
        for (const [bad, good] of Object.entries(replacements)) {
            if (content.includes(bad)) {
                content = content.split(bad).join(good);
                changed = true;
            }
        }
        if (changed) {
            fs.writeFileSync(file, content, 'utf8');
            console.log('Fixed texts in ' + file);
        }
    }
});
