import re

path = 'src/components/ProductDetailModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace setCompartiendo in useProductDetailLogic
path2 = 'src/hooks/useProductDetailLogic.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

content2 = content2.replace("compartiendo, contentReady, setContentReady,", "compartiendo, setCompartiendo, contentReady, setContentReady,")
with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)

# Fix isMounted in ProductDetailModal.tsx
content = re.sub(r'if \(isMounted\.current\) \{\s*setCompartiendo\(false\);\s*setPdfUriForImage\(null\);\s*\}', 'setCompartiendo(false);\n                  setPdfUriForImage(null);', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Forced fixed isMounted")
