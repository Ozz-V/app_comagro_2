const fs = require('fs');

const path = 'src/components/ProductDetailModal.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /\{curveData && \([\s\S]*?<Modal[\s\S]*?visible=\{showCurveModal\}[\s\S]*?<\/Modal>\s*\)\}/;

const replacement = <CurveModal
            visible={showCurveModal}
            onClose={() => setShowCurveModal(false)}
            curveData={curveData}
            modalProd={modalProd}
            curveCaptureRef={curveCaptureRef}
            curveSize={curveSize}
            sharingCurvaImagen={sharingCurvaImagen}
            sharingCurvaPdf={sharingCurvaPdf}
            compartirCurvaImagen={compartirCurvaImagen}
            compartirCurvaPdf={compartirCurvaPdf}
            insets={insets}
            screenHeight={screenHeight}
            LOGO_BASE={LOGO_BASE}
          />;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Replaced successfully!");
} else {
    console.log("Not found with regex");
}
