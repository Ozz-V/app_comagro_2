import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../theme';

const SearchIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${COLORS.gray4}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const CheckIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const RadioOn = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="${COLORS.green}"/></svg>`;
const RadioOff = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.border}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;
const GlobeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
const UsersIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

interface Props {
  visible: boolean;
  onClose: () => void;
  users: any[];
  onGenerateGlobal: () => void;
  onGenerateGrid: (selectedEmails: string[]) => void;
  isGenerating: boolean;
}

export function UserReportModal({ visible, onClose, users, onGenerateGlobal, onGenerateGrid, isGenerating }: Props) {
  const [mode, setMode] = useState<'global' | 'users'>('global');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return users;
    return users.filter(u => 
      (u.full_name || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term)
    );
  }, [search, users]);

  const toggleUser = (email: string) => {
    const next = new Set(selected);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filteredUsers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUsers.map(u => u.email)));
    }
  };

  const handleGenerate = () => {
    if (mode === 'global') {
      onGenerateGlobal();
    } else {
      if (selected.size === 0) return; // Must select at least one
      onGenerateGrid(Array.from(selected));
    }
  };

  const canGenerate = mode === 'global' || (mode === 'users' && selected.size > 0);

  const renderItem = ({ item }: { item: any }) => {
    const isSel = selected.has(item.email);
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.full_name || item.email)}&background=0D8A39&color=fff`;

    return (
      <TouchableOpacity style={styles.userRow} onPress={() => toggleUser(item.email)} activeOpacity={0.7}>
        <View style={[styles.checkbox, isSel && styles.checkboxActive]}>
          {isSel && <SvgXml xml={CheckIcon} />}
        </View>
        <Image source={{ uri: item.avatar_url || fallbackAvatar }} style={styles.avatar} />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{item.full_name || item.email.split('@')[0]}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { paddingTop: Platform.OS === 'android' ? 35 : 0 }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} disabled={isGenerating}>
            <Text style={styles.headerBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Exportar Reporte</Text>
          <TouchableOpacity onPress={handleGenerate} style={styles.headerBtn} disabled={isGenerating || !canGenerate}>
            {isGenerating ? (
              <ActivityIndicator size="small" color={COLORS.green} />
            ) : (
              <Text style={[styles.headerBtnText, { color: canGenerate ? COLORS.green : COLORS.gray4, fontFamily: FONTS.bodySemi }]}>Generar</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.border} />

        <View style={styles.content}>
          {/* Opciones de Modo */}
          <TouchableOpacity style={[styles.modeCard, mode === 'global' && styles.modeCardActive]} onPress={() => setMode('global')} activeOpacity={0.8}>
            <View style={styles.modeIcon}><SvgXml xml={GlobeIcon} /></View>
            <View style={styles.modeText}>
              <Text style={styles.modeTitle}>Reporte Global</Text>
              <Text style={styles.modeDesc}>Resumen general de toda la aplicación.</Text>
            </View>
            <SvgXml xml={mode === 'global' ? RadioOn : RadioOff} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.modeCard, mode === 'users' && styles.modeCardActive]} onPress={() => setMode('users')} activeOpacity={0.8}>
            <View style={styles.modeIcon}><SvgXml xml={UsersIcon} /></View>
            <View style={styles.modeText}>
              <Text style={styles.modeTitle}>Reporte por Usuario</Text>
              <Text style={styles.modeDesc}>Detalle individualizado en formato grilla.</Text>
            </View>
            <SvgXml xml={mode === 'users' ? RadioOn : RadioOff} />
          </TouchableOpacity>

          {/* Lista de Usuarios (Solo si mode === 'users') */}
          {mode === 'users' && (
            <View style={styles.usersSection}>
              <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                  <SvgXml xml={SearchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar usuario..."
                    value={search}
                    onChangeText={setSearch}
                    placeholderTextColor={COLORS.gray4}
                  />
                </View>
                <TouchableOpacity style={styles.toggleAllBtn} onPress={toggleAll}>
                  <Text style={styles.toggleAllText}>
                    {selected.size === filteredUsers.length && filteredUsers.length > 0 ? 'Deseleccionar' : 'Todos'}
                  </Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={filteredUsers}
                keyExtractor={item => item.email}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                showsVerticalScrollIndicator={false}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  headerBtnText: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4 },
  border: { height: 1, backgroundColor: COLORS.border },
  content: { flex: 1, padding: 16 },
  
  modeCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, marginBottom: 12, backgroundColor: COLORS.white },
  modeCardActive: { borderColor: COLORS.green, backgroundColor: '#F0FDF4' },
  modeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  modeText: { flex: 1 },
  modeTitle: { fontFamily: FONTS.bodySemi, fontSize: 15, color: COLORS.navy, marginBottom: 2 },
  modeDesc: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 },

  usersSection: { flex: 1, marginTop: 8 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 8, paddingHorizontal: 12, height: 40, gap: 8 },
  searchInput: { flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, height: '100%' },
  toggleAllBtn: { justifyContent: 'center', paddingHorizontal: 12, backgroundColor: COLORS.bg, borderRadius: 8 },
  toggleAllText: { fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.navy },
  
  listContainer: { paddingBottom: 40 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bg },
  userInfo: { flex: 1 },
  userName: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy },
  userEmail: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 },
  separator: { height: 1, backgroundColor: COLORS.bg, marginLeft: 44 }
});