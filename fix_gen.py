import os

path = 'src/components/calculator/GeneratorTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("setGenUnit: (u: 'KVA' | 'AMPER') => void;", "handleGenUnitChange: (u: 'KVA' | 'AMPER') => void;")
content = content.replace("setGenUnit,", "handleGenUnitChange,")
content = content.replace("setGenUnit('KVA')", "handleGenUnitChange('KVA')")
content = content.replace("setGenUnit('AMPER')", "handleGenUnitChange('AMPER')")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("GeneratorTab updated")
