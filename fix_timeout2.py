import os
import re

path = 'src/hooks/useProductDetailLogic.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'await new Promise\([^)]*requestAnimationFrame\([^)]*\)\);',
    'await new Promise(resolve => setTimeout(resolve, 1000));',
    content
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Timeout added aggressively")
