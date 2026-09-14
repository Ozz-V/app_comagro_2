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
    
    // Convert to latin1 and back? No, just use regex for both literal ? and U+FFFD
    content = content.replace(/C[\?]LCULO AVANZADO/g, 'CÁLCULO AVANZADO');
    content = content.replace(/Altura de Elevaci[\?]n/g, 'Altura de Elevación');
    content = content.replace(/m[\?]\/h/g, 'm³/h');
    content = content.replace(/Monof[\?]sico/g, 'Monofásico');
    content = content.replace(/Trif[\?]sico/g, 'Trifásico');
    content = content.replace(/Filtro de Categor[\?]a/g, 'Filtro de Categoría');
    content = content.replace(/¿Para qu[\?] necesita/g, '¿Para qué necesita');
    content = content.replace(/Alimentaci[\?]n El[\?]ctrica/g, 'Alimentación Eléctrica');
    content = content.replace(/Seleccion[\?] un tipo/g, 'Seleccioná un tipo');
    content = content.replace(/c[\?]lculo r[\?]pido/g, 'cálculo rápido');
    content = content.replace(/C[\?]lculo r[\?]pido/g, 'Cálculo rápido');
    content = content.replace(/Siguiente \?/g, 'Siguiente ➔');
    
    fs.writeFileSync(f, content, 'utf8');
}
console.log('Fixed regex encoding aggressively!');
