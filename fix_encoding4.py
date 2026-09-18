import re

with open("src/utils/pdfGridReport.ts", "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(r"ǟ[^a-zA-Z]*ltimos", "Últimos", content)
content = re.sub(r"dǟ[^a-zA-Z]*as", "días", content)
content = re.sub(r"Imǟ[^a-zA-Z]*genes", "Imágenes", content)
content = re.sub(r"automǭticamente", "automáticamente", content)

with open("src/utils/pdfGridReport.ts", "w", encoding="utf-8") as f:
    f.write(content)

with open("src/hooks/useDashboardAnalyticsLogic.ts", "r", encoding="utf-8") as f:
    content = f.read()
content = re.sub(r"Estad[^a-zA-Z]*sticas", "Estadísticas", content)
content = content.replace("Mǭs", "Más")
content = content.replace("acǭ", "acá")
content = content.replace("decisin", "decisión")
content = content.replace("Estadsticas", "Estadísticas")
content = content.replace("automǭticamente", "automáticamente")

with open("src/hooks/useDashboardAnalyticsLogic.ts", "w", encoding="utf-8") as f:
    f.write(content)
print("Regex cleanup done")