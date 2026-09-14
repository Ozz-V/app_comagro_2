import re

path = 'src/components/ProductDetailModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('''                onError={(e) => {
                  Sentry.captureException(e);
                  showAlert('Error', 'Fallo al capturar la imagen en alta calidad.');
                  if (isMounted.current) {
                    setCompartiendo(false);
                    setPdfUriForImage(null);
                  }
                }}''', '''                onError={(e) => {
                  Sentry.captureException(e);
                  showAlert('Error', 'Fallo al capturar la imagen en alta calidad.');
                  setPdfUriForImage(null);
                }}''')
                
content = content.replace("    compartiendo, contentReady, setContentReady,", "    compartiendo, setCompartiendo, contentReady, setContentReady,")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

path2 = 'src/hooks/useProductDetailLogic.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

content2 = content2.replace("import { useState, useRef, useEffect, useMemo } from 'react';", "import { useState, useRef, useEffect, useMemo } from 'react';\nimport { View } from 'react-native';")
with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)

print("Fixed missing variables")
