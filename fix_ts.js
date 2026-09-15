const fs = require('fs');

let path = 'src/hooks/useCalculatorLogic.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/'m3\/h' as 'l\/min' \| 'm3\/h' \| 'l\/h'/g, "'m³/h' as 'l/min' | 'm³/h' | 'l/h'");
content = content.replace(/newUnit: 'l\/min' \| 'm3\/h' \| 'l\/h'/g, "newUnit: 'l/min' | 'm³/h' | 'l/h'");

fs.writeFileSync(path, content, 'utf8');
