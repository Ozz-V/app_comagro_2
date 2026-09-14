import os
import re

f = 'src/utils/database.ts'
with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

content = content.replace(
    "query += ' AND p.subcategoria LIKE ?';",
    "query += ' AND p.subcategoria = ?';"
)
content = content.replace(
    "params.push(%%);",
    "params.push(subcatFiltro);"
)

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)
print("database.ts updated")
