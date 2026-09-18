with open("src/components/DashboardAnalytics.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("alert(\"Error generando PDF: \" + (e?.message || JSON.stringify(e)));", "showAlert('Error de Generación', 'No se pudo generar el reporte: ' + (e?.message || JSON.stringify(e)));")

with open("src/components/DashboardAnalytics.tsx", "w", encoding="utf-8") as f:
    f.write(content)