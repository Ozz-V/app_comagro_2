const fs = require('fs');

const files = [
    'src/components/calculator/pump/PumpAdvancedForm.tsx',
    'src/components/calculator/pump/PumpGuidedForm.tsx'
];

const dict = {
    'm\ufffd/h': 'm³/h',
    'Ca\ufffder\ufffda': 'Cañería',
    'fricci\ufffdn': 'fricción',
    'Seleccion\ufffd': 'Seleccioná',
    '\ufffdPara qu\ufffd': '¿Para qué'
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
