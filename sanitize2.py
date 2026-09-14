import os
import codecs

replacements = {
    'Trifǭsico': 'Trifásico',
    'Monofǭsico': 'Monofásico',
    'Diǭmetro': 'Diámetro',
    'Informacin': 'Información',
    'informacin': 'información',
    'Cǭlculo': 'Cálculo',
    'cǭlculo': 'cálculo',
    'Mǭx': 'Máx',
    'mǭx': 'máx',
    'Mn': 'Mín',
    'mn': 'mín',
    'Tensin': 'Tensión',
    'tensin': 'tensión',
    'Presin': 'Presión',
    'presin': 'presión',
    'Catǭlogo': 'Catálogo',
    'catǭlogo': 'catálogo',
    'Estimacin': 'Estimación',
    'rǭpida': 'rápida',
    'vǭlidas': 'válidas',
    'Ingresǭ': 'Ingresá',
    'Categora': 'Categoría',
    'categora': 'categoría',
    'Lmite': 'Límite',
    'lmite': 'límite',
    'Elctrico': 'Eléctrico',
    'ELCTRICO': 'ELÉCTRICO',
    'Funcin': 'Función',
    'funcin': 'función',
    's?': '⚠️',
    'tenǸs': 'tenés',
    '?"': '→'
}

files = [
    'src/hooks/useCalculatorLogic.ts',
    'src/components/CalculadoraModal.tsx',
    'src/components/calculator/CalculatorResults.tsx',
    'src/components/calculator/PumpTab.tsx',
    'src/components/calculator/GeneratorTab.tsx',
    'src/components/calculator/pump/PumpAdvancedForm.tsx',
    'src/components/calculator/forms/MotorForm.tsx'
]

for file_path in files:
    if os.path.exists(file_path):
        print(f"Processing {file_path}")
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        for k, v in replacements.items():
            content = content.replace(k, v)
            
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

print("Sanitization complete")
