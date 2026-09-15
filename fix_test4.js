const fs = require('fs');
let path = 'tests/useOTAUpdate.test.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/startDownloadUpdate\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g, "startDownloadUpdate($1, $2)");

fs.writeFileSync(path, content, 'utf8');
