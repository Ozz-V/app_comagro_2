import binascii
files = [
    'src/components/calculator/PumpTab.tsx',
    'src/components/calculator/forms/MotorForm.tsx'
]
for p in files:
    with open(p, 'rb') as f:
        content = f.read()
    print("---", p, "---")
    idx = content.find(b'LCULO')
    if idx != -1:
        print(content[idx-2:idx+10])
    idx2 = content.find(b'Monof')
    if idx2 != -1:
        print(content[idx2:idx2+15])
