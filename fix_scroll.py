import os

f = 'src/components/CompareModal.tsx'
with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

content = content.replace(
    '<ScrollView contentContainerStyle={styles.scrollContent}>',
    '<ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>'
)

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)
print("CompareModal ScrollView fixed")
