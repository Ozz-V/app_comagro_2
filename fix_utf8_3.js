const fs = require('fs');
let file = 'src/components/calculator/pump/PumpAdvancedForm.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.split('categor\ufffda').join('categoría');
fs.writeFileSync(file, content, 'utf8');
console.log('Fixed category');
