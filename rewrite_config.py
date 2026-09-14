import os
import re

config_path = 'src/screens/ConfigScreen.tsx'
with open(config_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove states
states_to_remove = [
    "  const [profileLoading, setProfileLoading] = useState(true);\n",
    "  const [profileSaving, setProfileSaving] = useState(false);\n",
    "  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);\n",
    "  const [fullName, setFullName] = useState('');\n",
    "  const [phoneCode, setPhoneCode] = useState('+595');\n",
    "  const [phone, setPhone] = useState('');\n",
    "  const [userEmail, setUserEmail] = useState('');\n",
    "  const [userId, setUserId] = useState<string | null>(null);\n",
    "  const [isEditing, setIsEditing] = useState(false);\n",
]
for state in states_to_remove:
    content = content.replace(state, "")

# Remove profile logic hooks
logic_regex = re.compile(r'useEffect\(\(\) => \{ loadProfile\(\); \}, \[\]\);.*?async function saveProfile.*?\}\s*\}', re.DOTALL)
content = re.sub(logic_regex, '', content)

# Remove JSX Profile Section
jsx_regex = re.compile(r'\{/\* --- TARJETA DE PERFIL --- \*/\}.*?(?=\{/\* --- LISTA )', re.DOTALL)
content = re.sub(jsx_regex, '<ProfileSection />\n\n        ', content)

# Add import
content = content.replace(
    "import UpdateModal from '../components/UpdateModal';",
    "import UpdateModal from '../components/UpdateModal';\nimport ProfileSection from '../components/config/ProfileSection';"
)

with open(config_path, 'w', encoding='utf-8') as f:
    f.write(content)
