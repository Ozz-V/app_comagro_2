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
    'Elevaci?n': 'Elevación',
    'm?/h': 'm³/h',
    'Monof?sico': 'Monofásico',
    'Trif?sico': 'Trifásico',
    'Categor?a': 'Categoría',
    '¿Para qu? necesita': '¿Para qué necesita',
    'm/h': 'm³/h',
    'CLCULO': 'CÁLCULO',
    'Elevacin': 'Elevación',
    'Monofsico': 'Monofásico',
    'Trifsico': 'Trifásico',
    'Categora': 'Categoría',
    '¿Para qu necesita': '¿Para qué necesita',
    'Seleccion': 'Seleccioná',
    'clculo': 'cálculo',
    'rpido': 'rápido',
    'Alimentacin Elctrica': 'Alimentación Eléctrica',
    'Alimentaci?n El?ctrica': 'Alimentación Eléctrica',
    'Siguiente ?': 'Siguiente',
}

for filepath in files_to_fix:
    if os.path.exists(filepath):
        # Try utf-8 first
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(filepath, 'r', encoding='latin-1') as f:
                content = f.read()
                
        # Fix Windows-1252 weird characters that show up as 
        content = content.replace('', '?')
        
        for old, new in replacements.items():
            content = content.replace(old, new)
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
            
print("Fixed encoding bugs!")
