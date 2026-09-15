const fs = require('fs');
let path = 'tests/useOTAUpdate.test.ts';
let content = fs.readFileSync(path, 'utf8');

// Match startDownloadUpdate(arg1, arg2, arg3)
content = content.replace(/startDownloadUpdate\(([^,]+),\s*([^,]+),\s*[^)]+\)/g, "startDownloadUpdate(, )");

fs.writeFileSync(path, content, 'utf8');
