import re

path = 'src/components/ProductDetailModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'\{modalProd\?.specs\?.length > 0 && \(\s*<View style=\{styles.specsWrap\}>\s*<View style=\{\{ borderRadius: 8, overflow: \'hidden\', borderWidth: 1, borderColor: \'#E0E0E0\' \}\}>\s*\{modalProd.specs.map\(\(\[n, v\]: \[string, string\], i: number\) => \(\s*<View key=\{i\} style=\{\[styles.specRow, i % 2 === 1 && styles.specRowAlt\]\}>\s*<Text style=\{styles.specName\}>\{n\}</Text>\s*<Text style=\{styles.specVal\}>\{v\}</Text>\s*</View>\s*\)\)\}\s*</View>\s*</View>\s*\)', re.DOTALL)

replacement = '<ProductSpecsTab modalProd={modalProd} />'

if pattern.search(content):
    content = pattern.sub(replacement, content)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success specs")
else:
    print("Not found specs")
