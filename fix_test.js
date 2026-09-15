const fs = require('fs');
let path = 'tests/useOTAUpdate.test.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/startDownloadUpdate\('([^']*)', '([^']*)', null\)/g, "startDownloadUpdate('', '')");

fs.writeFileSync(path, content, 'utf8');
