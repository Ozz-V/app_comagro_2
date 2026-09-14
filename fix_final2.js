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
    
    // Instead of matching the weird character, let's match the prefix and suffix!
    content = content.replace(/C.LCULO AVANZADO/g, 'CÁLCULO AVANZADO');
    content = content.replace(/C.lculo/g, 'Cálculo');
    content = content.replace(/c.lculo/g, 'cálculo');
    content = content.replace(/r.pido/g, 'rápido');
    content = content.replace(/m.\/h/g, 'm³/h');
    content = content.replace(/Elevaci.n/g, 'Elevación');
    content = content.replace(/Categor.a/g, 'Categoría');
    content = content.replace(/Monof.sico/g, 'Monofásico');
    content = content.replace(/Trif.sico/g, 'Trifásico');
    content = content.replace(/Alimentaci.n El.ctrica/g, 'Alimentación Eléctrica');
    content = content.replace(/¿Para qu. necesita/g, '¿Para qué necesita');
    content = content.replace(/Seleccion. un tipo/g, 'Seleccioná un tipo');
    
    fs.writeFileSync(f, content, 'utf8');
}
console.log('Fixed prefix suffix encoding!');
