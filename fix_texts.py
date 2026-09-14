import os

files = [
    'src/components/calculator/GeneratorTab.tsx',
    'src/components/calculator/forms/MotorForm.tsx',
    'src/components/calculator/pump/PumpGuidedForm.tsx',
    'src/components/calculator/pump/PumpAdvancedForm.tsx'
]

for f in files:
    if os.path.exists(f):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Generator and Motor
        content = content.replace('Tensi?n el?ctrica', 'Tensión eléctrica')
        content = content.replace('Tensin elǸctrica', 'Tensión eléctrica')
        content = content.replace('Tensi\ufffdn el\ufffdtrica', 'Tensión eléctrica')
        content = content.replace('Tensi\uFFFDn el\uFFFDctrica', 'Tensión eléctrica')
        
        # Bomba de agua
        content = content.replace('?Para qu? necesita la bomba?', '¿Para qué necesita la bomba?')
        content = content.replace('Para quǸ necesita la bomba?', '¿Para qué necesita la bomba?')
        content = content.replace('\ufffdPara qu\ufffd necesita la bomba?', '¿Para qué necesita la bomba?')
        
        # Double check "C.LCULO AVANZADO" etc if they are still broken? 
        # User only complained about these specific ones now, which means the others were fixed.

        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)

print("Text errors replaced safely.")
