import re

path = 'src/components/ProductDetailModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'\{curveData && \(\s*<Modal\s*visible=\{showCurveModal\}.*?</Modal>\s*\)\}', re.DOTALL)

replacement = '''<CurveModal
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
          />'''

if pattern.search(content):
    content = pattern.sub(replacement, content)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")
else:
    print("Not found")
