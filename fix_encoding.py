import os

def fix_encoding(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            
        # If it doesn't contain the broken A-tilde, skip
        if "Ã" not in content and "Â" not in content:
            return False

        # Encode as latin1 (which reverses the double utf-8 interpretation) and decode as utf-8
        try:
            fixed_content = content.encode("latin1").decode("utf-8")
        except UnicodeError:
            # Maybe it's not a pure double-encoding. Let's do string replacement for the common ones just in case.
            fixed_content = content
            replacements = {
                "Ã³": "ó",
                "Ã­": "í",
                "Ã¡": "á",
                "Ã©": "é",
                "Ãº": "ú",
                "Ã±": "ñ",
                "Ãš": "Ú",
                "Â¿": "¿",
                "SÃ ": "SÍ",
                "SÃ": "SÍ",
                "Ã ": "à", # sometimes
                "GestiÃ³n": "Gestión",
                "visiÃ³n": "visión",
                "versiÃ³n": "versión",
                "automÃ¡ticamente": "automáticamente",
                "secciÃ³n": "sección",
                "cerrarÃ¡": "cerrará",
                "ConfiguraciÃ³n": "Configuración",
                "EstadÃ­sticas": "Estadísticas",
                "sÃ­": "sí",
                "perdiÃ³": "perdió",
                "mÃ¡s": "más",
                "ImÃ¡genes": "Imágenes",
                "ǭ": "á",
                "ǟ''": "á",
                "ǟ'.": "ú",
            }
            for bad, good in replacements.items():
                fixed_content = fixed_content.replace(bad, good)

        if content != fixed_content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(fixed_content)
            return True
    except Exception as e:
        print(f"Error on {filepath}: {e}")
    return False

fixed_count = 0
for root, dirs, files in os.walk("src"):
    for file in files:
        if file.endswith(".ts") or file.endswith(".tsx"):
            if fix_encoding(os.path.join(root, file)):
                print(f"Fixed encoding in {file}")
                fixed_count += 1
                
print(f"Total files fixed: {fixed_count}")