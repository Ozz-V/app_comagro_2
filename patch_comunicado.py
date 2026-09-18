import re

with open("src/components/ComunicadoModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Remove the duplicate import that was added
content = content.replace("import { renderMarkdown } from '../utils/renderMarkdown';\n", "", 1)

# Remove the local renderMarkdown and tokenizeInline functions
content = re.sub(
    r"// ---------------------------------------------------------------------------\n// Renderizador de Markdown basico\n// .*?\n// ---------------------------------------------------------------------------\nfunction renderMarkdown.*?^}",
    "",
    content,
    flags=re.DOTALL | re.MULTILINE
)

# Remove tokenizeInline and InlineToken
content = re.sub(
    r"interface InlineToken \{.*?^}\n\n/\*\* Tokeniza",
    "/** Tokeniza",
    content,
    flags=re.DOTALL | re.MULTILINE
)
content = re.sub(
    r"/\*\* Tokeniza marcadores inline.*?^}\n",
    "",
    content,
    flags=re.DOTALL | re.MULTILINE
)

# Add the import at the top after the last import line
content = content.replace(
    "import Constants from 'expo-constants';",
    "import Constants from 'expo-constants';\nimport { renderMarkdown } from '../utils/renderMarkdown';"
)

with open("src/components/ComunicadoModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)