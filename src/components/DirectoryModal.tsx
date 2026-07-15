import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, ScrollView, Image } from 'react-native';
import { COLORS, FONTS } from '../theme';

interface DirectoryModalProps {
  visible: boolean;
  onClose: () => void;
  loadingDirectory: boolean;
  directoryUsers: any[];
  onUserClick: (email: string) => void;
}

export default function DirectoryModal({ visible, onClose, loadingDirectory, directoryUsers, onUserClick }: DirectoryModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, height: '80%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy }}>Directorio de Contactos</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text>
            </TouchableOpacity>
          </View>
          {loadingDirectory ? (
            <ActivityIndicator size="large" color={COLORS.navy} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {directoryUsers.map((u: any, i: number) => (
                <TouchableOpacity 
                  key={i} 
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
                  onPress={() => { onClose(); onUserClick(u.email); }}
                >
                  <Image source={u.avatar_url ? { uri: u.avatar_url } : { uri: 'https://ui-avatars.com/api/?name=' + u.email + '&background=0D8A39&color=fff' }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FONTS.heading, fontSize: 14, color: COLORS.navy }}>{u.full_name}</Text>
                    <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4 }}>{u.telefono || u.email}</Text>
                  </View>
                  <Text style={{ color: COLORS.gray4 }}>›</Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
