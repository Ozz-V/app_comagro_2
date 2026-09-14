import os

files_to_fix = [
    'src/components/calculator/forms/MotorForm.tsx',
    'src/components/calculator/pump/PumpAdvancedForm.tsx',
    'src/components/calculator/pump/PumpGuidedForm.tsx',
    'src/components/calculator/GeneratorTab.tsx',
    'src/components/calculator/PumpTab.tsx',
    'src/components/CalculadoraModal.tsx',
    'src/components/product/CurveModal.tsx'
]

replacements = {
    'C?LCULO': 'CÁLCULO',
    'CLCULO': 'CÁLCULO',
    'Elevaci?n': 'Elevación',
    'Elevacin': 'Elevación',
    'm?/h': 'm³/h',
    'm/h': 'm³/h',
    'Monof?sico': 'Monofásico',
    'Monofsico': 'Monofásico',
    'Trif?sico': 'Trifásico',
    'Trifsico': 'Trifásico',
    'Categor?a': 'Categoría',
    'Categora': 'Categoría',
    '¿Para qu? necesita': '¿Para qué necesita',
    'Para qu necesita': '¿Para qué necesita',
    'm/h': 'm³/h',
    'Seleccion?': 'Seleccioná',
    'Seleccion': 'Seleccioná',
    'c?lculo': 'cálculo',
    'clculo': 'cálculo',
    'r?pido': 'rápido',
    'rpido': 'rápido',
    'Siguiente ?': 'Siguiente ➔',
    'Alimentaci?n El?ctrica': 'Alimentación Eléctrica',
    'Alimentacin Elctrica': 'Alimentación Eléctrica',
    'TCNICA': 'TÉCNICA'
}

for filepath in files_to_fix:
    if not os.path.exists(filepath): continue
    
    # Read as UTF-16 first, if fails try UTF-8, if fails try latin1
    content = ""
    try:
        with open(filepath, 'r', encoding='utf-16') as f:
            content = f.read()
    except Exception:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            with open(filepath, 'r', encoding='latin-1') as f:
                content = f.read()
                
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Fixed UTF-16 to UTF-8 and replaced texts!")
