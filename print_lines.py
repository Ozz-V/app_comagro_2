with open('src/components/CalculadoraModal.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if 860 <= i <= 1010:
        print(f"{i}: {line.rstrip()}")
