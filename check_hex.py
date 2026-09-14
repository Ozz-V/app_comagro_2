import binascii

with open('src/components/calculator/pump/PumpGuidedForm.tsx', 'rb') as f:
    content = f.read()

idx = content.find(b'Monof')
if idx != -1:
    print(content[idx:idx+15])
    print(binascii.hexlify(content[idx:idx+15]))
