const fs = require('fs');
let path = 'src/components/ProductDetailModal.tsx';
let c = fs.readFileSync(path, 'utf8');
if (!c.includes('import CurveModal')) {
    c = c.replace(
        "import ImageViewerModal from './ImageViewerModal';",
        "import ImageViewerModal from './ImageViewerModal';\nimport CurveModal from './product/CurveModal';"
    );
    fs.writeFileSync(path, c, 'utf8');
    console.log("Import added!");
}
