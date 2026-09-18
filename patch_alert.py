with open("src/components/DashboardAnalytics.tsx", "r", encoding="utf-8") as f:
    content = f.read()

import re
content = re.sub(
    r"\} catch \(e\) \{\s*console\.error\('Error al generar PDF de usuarios', e\);\s*\} finally \{",
    """} catch (e: any) {\n              console.error('Error al generar PDF de usuarios', e);\n              alert("Error generando PDF: " + (e?.message || JSON.stringify(e)));\n            } finally {""",
    content
)

with open("src/components/DashboardAnalytics.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Alert agregado")