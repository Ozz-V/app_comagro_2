import re

path = 'tests/useOTAUpdate.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(\", null)\", \")\")
content = content.replace(\"'', '', )\", \"'', '')\")
# Just carefully replacing the exact matches of 3 args
content = re.sub(r'startDownloadUpdate\(([^,]+),\s*([^,]+),\s*[^)]+\)', r'startDownloadUpdate(\1, \2)', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
