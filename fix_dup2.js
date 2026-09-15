const fs = require('fs');
let path = 'src/components/CalculadoraModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// replace the duplicate showDiamPicker
let str = 'showDiamPicker={showDiamPicker} setShowDiamPicker={setShowDiamPicker}';
let firstIdx = content.indexOf(str);
if (firstIdx !== -1) {
    let secondIdx = content.indexOf(str, firstIdx + 1);
    if (secondIdx !== -1) {
        content = content.substring(0, secondIdx) + content.substring(secondIdx + str.length);
    }
}
fs.writeFileSync(path, content, 'utf8');
