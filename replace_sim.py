import re

path = 'src/components/ProductDetailModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'\{activeTab === \'SIMILARES\' && \(\s*<View style=\{styles.tabContent\}>.*?\{productosSimilares.length === 0 && productosMismaMarca.length === 0 && \(\s*<Text style=\{styles.aiBodyText\}>No hay productos relacionados.</Text>\s*\)\}\s*</View>\s*\)', re.DOTALL)

replacement = '''{activeTab === 'SIMILARES' && (
                <SimilarProductsTab 
                  productosSimilares={productosSimilares}
                  productosMismaMarca={productosMismaMarca}
                  modalProd={modalProd}
                  onOpenProduct={onOpenProduct}
                />
              )}'''

if pattern.search(content):
    content = pattern.sub(replacement, content)
    content = content.replace(
        "import ImageViewerModal from './ImageViewerModal';",
        "import ImageViewerModal from './ImageViewerModal';\nimport SimilarProductsTab from './product/SimilarProductsTab';"
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success replacing SimilarProductsTab")
else:
    print("Not found SimilarProductsTab")
