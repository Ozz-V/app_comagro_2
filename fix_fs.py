with open("src/utils/pdfGridReport.ts", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("from 'expo-file-system'", "from 'expo-file-system/legacy'")

with open("src/utils/pdfGridReport.ts", "w", encoding="utf-8") as f:
    f.write(content)