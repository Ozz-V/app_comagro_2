import os

path_modal = 'src/components/CalculadoraModal.tsx'
with open(path_modal, 'r', encoding='utf-8', errors='replace') as f:
    c_modal = f.read()
c_modal = c_modal.replace(
    'handleUnitChange={handleUnitChange} stepHp={stepHp}',
    'handleUnitChange={handleUnitChange} stepHp={stepHp}\n                  showDiamPicker={showDiamPicker} setShowDiamPicker={setShowDiamPicker}'
)
with open(path_modal, 'w', encoding='utf-8') as f:
    f.write(c_modal)


path_tab = 'src/components/calculator/PumpTab.tsx'
with open(path_tab, 'r', encoding='utf-8', errors='replace') as f:
    c_tab = f.read()
c_tab = c_tab.replace(
    'COLORS: any;\n}',
    'COLORS: any;\n  showDiamPicker?: boolean;\n  setShowDiamPicker?: any;\n}'
)
c_tab = c_tab.replace(
    'FIT_HEADERS, COLORS }: PumpTabProps) => {',
    'FIT_HEADERS, COLORS, showDiamPicker, setShowDiamPicker }: PumpTabProps) => {'
)
c_tab = c_tab.replace(
    'reglas={reglas} COLORS={COLORS} />',
    'reglas={reglas} COLORS={COLORS}\n            showDiamPicker={showDiamPicker} setShowDiamPicker={setShowDiamPicker} />'
)
with open(path_tab, 'w', encoding='utf-8') as f:
    f.write(c_tab)


path_adv = 'src/components/calculator/pump/PumpAdvancedForm.tsx'
with open(path_adv, 'r', encoding='utf-8', errors='replace') as f:
    c_adv = f.read()
c_adv = c_adv.replace(
    'COLORS: any;\n}',
    'COLORS: any;\n  showDiamPicker?: boolean;\n  setShowDiamPicker?: any;\n}'
)
c_adv = c_adv.replace(
    'COLORS }: PumpAdvancedFormProps) => {',
    'COLORS, showDiamPicker, setShowDiamPicker }: PumpAdvancedFormProps) => {'
)
with open(path_adv, 'w', encoding='utf-8') as f:
    f.write(c_adv)

print("Props passed!")
