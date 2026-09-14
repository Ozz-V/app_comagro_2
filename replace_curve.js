const fs = require('fs');

const path = 'src/components/ProductDetailModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add Import
content = content.replace(
    "import ImageViewerModal from './ImageViewerModal';",
    "import ImageViewerModal from './ImageViewerModal';\nimport CurveModal from './product/CurveModal';"
);

// Replace the <Modal visible={showCurveModal} ... > ... </Modal> with <CurveModal ... />
const startMarker = "          {curveData && (\n            <Modal\n              visible={showCurveModal}";
const endMarker = "            </Modal>\n          )}";

const s1 = content.indexOf(startMarker);
if (s1 !== -1) {
    let s2 = content.indexOf(endMarker, s1);
    if (s2 !== -1) {
        const replacement = "          <CurveModal\n" +
"            visible={showCurveModal}\n" +
"            onClose={() => setShowCurveModal(false)}\n" +
"            curveData={curveData}\n" +
"            modalProd={modalProd}\n" +
"            curveCaptureRef={curveCaptureRef}\n" +
"            curveSize={curveSize}\n" +
"            sharingCurvaImagen={sharingCurvaImagen}\n" +
"            sharingCurvaPdf={sharingCurvaPdf}\n" +
"            compartirCurvaImagen={compartirCurvaImagen}\n" +
"            compartirCurvaPdf={compartirCurvaPdf}\n" +
"            insets={insets}\n" +
"            screenHeight={screenHeight}\n" +
"            LOGO_BASE={LOGO_BASE}\n" +
"          />";
        content = content.substring(0, s1) + replacement + content.substring(s2 + endMarker.length);
        fs.writeFileSync(path, content, 'utf8');
        console.log("Replaced CurveModal successfully");
    }
}
