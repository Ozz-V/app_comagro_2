const fs = require('fs');
let path = 'src/components/ProductDetailModal.tsx';
let c = fs.readFileSync(path, 'utf8');
if (!c.includes('import ProductSpecsTab')) {
    c = c.replace(
        "import CurveModal from './product/CurveModal';",
        "import CurveModal from './product/CurveModal';\nimport ProductSpecsTab from './product/ProductSpecsTab';"
    );
    fs.writeFileSync(path, c, 'utf8');
    console.log("Import added!");
}
