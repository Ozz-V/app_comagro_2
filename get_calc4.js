const fs = require('fs');
let c = fs.readFileSync('src/hooks/useCalculatorLogic.ts', 'utf8');
let idx = c.indexOf('const hTotal');
if (idx === -1) idx = c.indexOf('let hTotal');
if (idx > -1) {
    console.log(c.substring(idx-200, idx + 500));
}
