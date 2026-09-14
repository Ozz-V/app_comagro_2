const fs = require('fs');

const files = [
    'src/components/calculator/forms/MotorForm.tsx',
    'src/components/calculator/pump/PumpAdvancedForm.tsx',
    'src/components/calculator/pump/PumpGuidedForm.tsx',
    'src/components/calculator/GeneratorTab.tsx',
    'src/components/calculator/PumpTab.tsx',
    'src/components/CalculadoraModal.tsx',
    'src/components/product/CurveModal.tsx'
];

for (const f of files) {
    if (!fs.existsSync(f)) continue;
    let content = fs.readFileSync(f, 'utf8');
    
    // Hard replacement of known weird strings
    content = content.split('CLCULO AVANZADO').join('CÁLCULO AVANZADO');
    content = content.split('Alimentacin ElǸctrica').join('Alimentación Eléctrica');
    content = content.split('Monofǭsico').join('Monofásico');
    content = content.split('Trifǭsico').join('Trifásico');
    content = content.split('m/h').join('m³/h');
    content = content.split('Para quǸ necesita').join('¿Para qué necesita');
    content = content.split('Categora').join('Categoría');
    content = content.split('Elevacin').join('Elevación');
    content = content.split('Seleccion').join('Seleccioná');
    content = content.split('clculo rpido').join('cálculo rápido');
    content = content.split('Clculo rpido').join('Cálculo rápido');
    
    fs.writeFileSync(f, content, 'utf8');
}
console.log('Fixed explicitly!');
