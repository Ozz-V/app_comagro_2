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
        let original = content;
        
        content = content.replace(/Tensi.n el.ctrica/g, 'Tensión eléctrica');
        content = content.replace(/Monof.sico/g, 'Monofásico');
        content = content.replace(/Trif.sico/g, 'Trifásico');
        content = content.replace(/C.LCULO AVANZADO/g, 'CÁLCULO AVANZADO');
        content = content.replace(/C.lculo Avanzado/g, 'Cálculo Avanzado');
        content = content.replace(/.Para qu. necesita la bomba./g, '¿Para qué necesita la bomba?');
        content = content.replace(/Alimentaci.n El.ctrica/g, 'Alimentación Eléctrica');
        content = content.replace(/Elevaci.n/g, 'Elevación');
        content = content.replace(/Estimaci.n r.pida/g, 'Estimación rápida');
        content = content.replace(/Informaci.n/g, 'Información');
        content = content.replace(/cat.logo/g, 'catálogo');
        content = content.replace(/Cat.logo/g, 'Catálogo');
        content = content.replace(/Di.metro/g, 'Diámetro');
        content = content.replace(/v.lidas/g, 'válidas');
        content = content.replace(/Ingres./g, 'Ingresá');
        content = content.replace(/Categor.a/g, 'Categoría');
        content = content.replace(/categor.a/g, 'categoría');
        content = content.replace(/l.mite/g, 'límite');
        content = content.replace(/El.ctrico/g, 'Eléctrico');
        content = content.replace(/EL.CTRICO/g, 'ELÉCTRICO');
        content = content.replace(/Funci.n/g, 'Función');
        content = content.replace(/presi.n/g, 'presión');
        content = content.replace(/Presi.n/g, 'Presión');
        content = content.replace(/.s.. El requerimiento supera el l.mite para equipos Monof.sicos. Intente con Trif.sico./g, '⚠️ El requerimiento supera el límite para equipos Monofásicos. Intente con Trifásico.');
        content = content.replace(/Seleccion. una categor.a arriba/g, 'Seleccioná una categoría arriba');
        content = content.replace(/m..h/g, 'm³/h');
        content = content.replace(/Ca.er.a/g, 'Cañería');
        content = content.replace(/fricci.n/g, 'fricción');
        
        if (content !== original) {
            fs.writeFileSync(file, content, 'utf8');
            console.log('Fixed regex in ' + file);
        }
    }
});
