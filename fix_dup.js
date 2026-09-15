const fs = require('fs');

let path = 'src/components/CalculadoraModal.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('                  showDiamPicker={showDiamPicker} setShowDiamPicker={setShowDiamPicker}\n', '');

fs.writeFileSync(path, content, 'utf8');
