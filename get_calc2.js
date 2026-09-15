const fs = require('fs');
let c = fs.readFileSync('src/hooks/useCalculatorLogic.ts', 'utf8');
let idx = c.indexOf('if (bombaTab === \'avanzado\') {');
if (idx > -1) {
    console.log(c.substring(idx, idx + 1000));
}
