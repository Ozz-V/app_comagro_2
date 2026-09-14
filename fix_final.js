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
    // We will read as utf8. The  is actually \ufffd in utf8.
    // The others are U+01F8 (Ǹ) or U+01ED (ǭ) because of the UTF-16 corruption!
    let content = fs.readFileSync(f, 'utf8');
    
    content = content.replace(/C[^\s]?LCULO AVANZADO/gi, 'CÁLCULO AVANZADO');
    content = content.replace(/C.lculo r.pido/g, 'Cálculo rápido');
    content = content.replace(/c.lculo r.pido/g, 'cálculo rápido');
    content = content.replace(/m[\uFFFD\u0100-\u02FF\?]\/h/g, 'm³/h');
    content = content.replace(/m\/h/g, 'm³/h');
    content = content.replace(/Altura de Elevaci[\uFFFD\u0100-\u02FF\?]n/g, 'Altura de Elevación');
    content = content.replace(/Filtro de Categor[\uFFFD\u0100-\u02FF\?]a/g, 'Filtro de Categoría');
    content = content.replace(/Monof[\uFFFD\u0100-\u02FF\?]sico/g, 'Monofásico');
    content = content.replace(/Trif[\uFFFD\u0100-\u02FF\?]sico/g, 'Trifásico');
    content = content.replace(/Alimentaci[\uFFFD\u0100-\u02FF\?]n El[\uFFFD\u0100-\u02FF\?]ctrica/g, 'Alimentación Eléctrica');
    content = content.replace(/¿Para qu[\uFFFD\u0100-\u02FF\?] necesita/g, '¿Para qué necesita');
    content = content.replace(/Seleccion[\uFFFD\u0100-\u02FF\?] un tipo/g, 'Seleccioná un tipo');
    content = content.replace(/Siguiente [\?]/g, 'Siguiente ➔');
    // Also fixing simple  just in case
    content = content.replace(/Alimentacin ElǸctrica/g, 'Alimentación Eléctrica');
    content = content.replace(/Monofǭsico/g, 'Monofásico');
    content = content.replace(/Trifǭsico/g, 'Trifásico');
    content = content.replace(/m\/h/g, 'm³/h');
    content = content.replace(/¿Para quǸ necesita/g, '¿Para qué necesita');
    content = content.replace(/Categora/g, 'Categoría');
    content = content.replace(/Elevacin/g, 'Elevación');
    content = content.replace(/CLCULO/g, 'CÁLCULO');
    
    fs.writeFileSync(f, content, 'utf8');
}
console.log('Fixed regex encoding!');
