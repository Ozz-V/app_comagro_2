import os

replacements = {
    "automǭticamente": "automáticamente",
    "Estadsticas": "Estadísticas",
    "ǟ'.ltimos": "Últimos",
    "dǟ''as": "días",
    "Imǟ''genes": "Imágenes",
    "Mǭs": "Más",
    "ǭ": "á",
    "?": "¿",
    "": "í"
}

for filepath in ["src/utils/pdfGridReport.ts", "src/hooks/useDashboardAnalyticsLogic.ts"]:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    for bad, good in replacements.items():
        content = content.replace(bad, good)
        
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
print("Manual encoding fixes applied")