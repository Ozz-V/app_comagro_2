path = 'src/components/ProductDetailModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("<ProductSpecsTab modalProd={modalProd} />}", "<ProductSpecsTab modalProd={modalProd} />")
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed syntax")
