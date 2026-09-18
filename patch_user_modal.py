import re

with open("src/components/UserReportModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Add Platform to react-native imports
content = re.sub(r"Modal, View, Text, StyleSheet, TouchableOpacity,\s*FlatList, TextInput, ActivityIndicator, SafeAreaView",
                 "Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Platform", content)

# Add safe-area-context
content = content.replace("from 'react-native';", "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';")

# Replace SafeAreaView tag
content = content.replace("<SafeAreaView style={styles.safe}>", "<SafeAreaView style={[styles.safe, { paddingTop: Platform.OS === 'android' ? 35 : 0 }]} edges={['top', 'bottom']}>")

with open("src/components/UserReportModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)