import os

path = 'src/components/CalculadoraModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace setGenUnit={setGenUnit} with handleGenUnitChange={handleGenUnitChange}
content = content.replace(
    'genUnit={genUnit} setGenUnit={setGenUnit}',
    'genUnit={genUnit} handleGenUnitChange={handleGenUnitChange}'
)
# Make sure handleGenUnitChange is destructured from useCalculatorLogic
content = content.replace(
    'reglas, stepHp, handleUnitChange, handleCalculate, handleBack, getHeaderTitle',
    'reglas, stepHp, handleUnitChange, handleGenUnitChange, handleCalculate, handleBack, getHeaderTitle, advResults'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("CalculadoraModal updated")
