const fs = require('fs');
let path = 'tests/useOTAUpdate.test.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/, null\)/g, ')');

fs.writeFileSync(path, content, 'utf8');
