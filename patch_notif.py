with open("src/screens/NotificationsScreen.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Add import
content = content.replace(
    "import { supabase } from '../supabase';",
    "import { supabase } from '../supabase';\nimport { renderMarkdown } from '../utils/renderMarkdown';"
)

# Replace plain Text with rendered markdown for item.body
content = content.replace(
    "<Text style={styles.cardBody}>{item.body}</Text>",
    "<View style={{ marginBottom: 6 }}>{renderMarkdown(item.body || '', styles.cardBody)}</View>"
)

with open("src/screens/NotificationsScreen.tsx", "w", encoding="utf-8") as f:
    f.write(content)