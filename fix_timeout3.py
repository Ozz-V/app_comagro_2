import os
import re

path = 'src/hooks/useProductDetailLogic.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));',
    'await new Promise(resolve => setTimeout(resolve, 1000));'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Timeout fixed!")
