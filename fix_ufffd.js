const fs = require('fs');
const path = require('path');

const files = [
    'src/components/calculator/forms/MotorForm.tsx',
    'src/components/calculator/pump/PumpAdvancedForm.tsx',
    'src/components/calculator/pump/PumpGuidedForm.tsx',
    'src/components/calculator/GeneratorTab.tsx',
    'src/components/calculator/PumpTab.tsx',
    'src/components/CalculadoraModal.tsx',
    'src/components/product/CurveModal.tsx'
];

const replacements = {
    'C\\ufffdLCULO': 'CÁLCULO',
    'C\ufffdLCULO': 'CÁLCULO',
    'Elevaci\\ufffdn': 'Elevación',
    'Elevaci\ufffdn': 'Elevación',
    'm\\ufffd/h': 'm³/h',
    'm\ufffd/h': 'm³/h',
    'Monof\\ufffdsico': 'Monofásico',
    'Monof\ufffdsico': 'Monofásico',
    'Trif\\ufffdsico': 'Trifásico',
    'Trif\ufffdsico': 'Trifásico',
    'Categor\\ufffda': 'Categoría',
    'Categor\ufffda': 'Categoría',
    '¿Para qu\\ufffd necesita': '¿Para qué necesita',
    '¿Para qu\ufffd necesita': '¿Para qué necesita',
    'Seleccion\\ufffd': 'Seleccioná',
    'Seleccion\ufffd': 'Seleccioná',
    'c\\ufffdlculo': 'cálculo',
    'c\ufffdlculo': 'cálculo',
    'r\\ufffdpido': 'rápido',
    'r\ufffdpido': 'rápido',
    'Alimentaci\\ufffdn El\\ufffdtrica': 'Alimentación Eléctrica',
    'Alimentaci\ufffdn El\ufffdtrica': 'Alimentación Eléctrica',
    'T\\ufffdCNICA': 'TÉCNICA',
    'T\ufffdCNICA': 'TÉCNICA',
    'gr\\ufffdfica estimativa': 'gráfica estimativa',
    'gr\ufffdfica estimativa': 'gráfica estimativa'
};

for (const f of files) {
    if (fs.existsSync(f)) {
        let content = fs.readFileSync(f, 'utf8');
        for (const [old, newStr] of Object.entries(replacements)) {
            content = content.split(old).join(newStr);
        }
        // Also manually fix some just in case
        content = content.replace(/C.LCULO AVANZADO/g, 'CÁLCULO AVANZADO');
        content = content.replace(/Altura de Elevaci.n/g, 'Altura de Elevación');
        content = content.replace(/Monof.sico/g, 'Monofásico');
        content = content.replace(/Trif.sico/g, 'Trifásico');
        content = content.replace(/Filtro de Categor.a/g, 'Filtro de Categoría');
        content = content.replace(/¿Para qu. necesita/g, '¿Para qué necesita');
        content = content.replace(/m.\/h/g, 'm³/h');
        content = content.replace(/Alimentaci.n El.ctrica/g, 'Alimentación Eléctrica');
        content = content.replace(/Seleccion. un tipo/g, 'Seleccioná un tipo');
        content = content.replace(/c.lculo r.pido/g, 'cálculo rápido');
        content = content.replace(/C.lculo r.pido/g, 'Cálculo rápido');
        content = content.replace(/Siguiente \?/g, 'Siguiente ➔');
        
        fs.writeFileSync(f, content, 'utf8');
    }
}
console.log('Fixed ufffd!');
