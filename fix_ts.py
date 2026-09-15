import os
import re

path = 'src/hooks/useCalculatorLogic.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix types
content = content.replace(\"'m3/h' as 'l/min' | 'm3/h' | 'l/h'\", \"'m³/h' as 'l/min' | 'm³/h' | 'l/h'\")
content = content.replace(\"newUnit: 'l/min' | 'm3/h' | 'l/h'\", \"newUnit: 'l/min' | 'm³/h' | 'l/h'\")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
