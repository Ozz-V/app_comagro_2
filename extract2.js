const fs = require('fs');

const configPath = 'src/screens/ConfigScreen.tsx';
let content = fs.readFileSync(configPath, 'utf8');

// Add import
content = content.replace(
    "import UpdateModal from '../components/UpdateModal';",
    "import UpdateModal from '../components/UpdateModal';\nimport ProfileSection from '../components/config/ProfileSection';"
);

// Remove the inline states
content = content.replace("const [profileLoading, setProfileLoading] = useState(true);\n", "");
content = content.replace("const [profileSaving, setProfileSaving] = useState(false);\n", "");
content = content.replace("const [avatarUrl, setAvatarUrl] = useState<string | null>(null);\n", "");
content = content.replace("const [fullName, setFullName] = useState('');\n", "");
content = content.replace("const [phoneCode, setPhoneCode] = useState('+595');\n", "");
content = content.replace("const [phone, setPhone] = useState('');\n", "");
content = content.replace("const [userEmail, setUserEmail] = useState('');\n", "");
content = content.replace("const [userId, setUserId] = useState<string | null>(null);\n", "");
content = content.replace("const [isEditing, setIsEditing] = useState(false);\n", "");

// Replace the ProfileSection JSX. We use regex or string replace.
// Since it's big, we'll find the start and end.
const startMarker = "{/* --- TARJETA DE PERFIL --- */}";
const endMarker = "{/* --- SECCI"; // Wait, what is the next marker?
