import os

replacements = {
    "RestauraciÃ³n": "Restauración",
    "versiÃ³n": "versión",
    "aplicaciÃ³n": "aplicación",
    "OcurriÃ³": "Ocurrió",
    "bloqueÃ³": "bloqueó",
    "notificaciÃ³n": "notificación",
    "despuÃ©s": "después",
    "atrÃ¡s": "atrás",
    "hacÃ­a": "hacía",
    "podÃ­a": "podía",
    "mÃ¡s": "más",
    "cuÃ¡ntas": "cuántas",
    "Ãºnica": "única",
    "lÃ­mite": "límite",
    "sesiÃ³n": "sesión",
    "botÃ³n": "botón",
    "abriÃ³": "abrió",
    "cachÃ©": "caché",
    "instantÃ¡nea": "instantánea",
    "parecÃ­a": "parecía",
    "COMPARACIÃ“N": "COMPARACIÓN",
    "ACTUALIZACIÃ“N": "ACTUALIZACIÓN",
    "Ã ndice": "Índice",
    "MIGRACIÃ“N": "MIGRACIÓN",
    "EXCEPCIÃ“N": "EXCEPCIÓN",
    "EstadÃ­sticas": "Estadísticas",
    "automÃ¡ticamente": "automáticamente"
}

for filepath in ["App.tsx", "src/screens/ProductosScreen.tsx", "src/utils/database.ts", "tests/templateService.test.ts"]:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    original = content
    for bad, good in replacements.items():
        content = content.replace(bad, good)
        
    if original != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed {filepath}")