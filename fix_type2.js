const fs = require('fs');
let path = 'src/hooks/useCalculatorLogic.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/unidadCaudal: 'm3\/h'/g, "unidadCaudal: 'm³/h'");

fs.writeFileSync(path, content, 'utf8');
