import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, Image, Linking, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../theme';
import StatCard from './StatCard';

export default function UserProfileModal({ visible, onClose, loadingUser, selectedUser }) {
  const [showFullAvatar, setShowFullAvatar] = useState(null);

  return (
    <>
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 15, padding: 20, elevation: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy }}>Perfil de Usuario</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingUser ? (
              <ActivityIndicator size="large" color={COLORS.navy} style={{ marginVertical: 30 }} />
            ) : selectedUser ? (
              <View>
                <View style={{ alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 20 }}>
                  <TouchableOpacity onPress={() => setShowFullAvatar(selectedUser.avatar_url || 'https://ui-avatars.com/api/?name=' + selectedUser.email + '&background=0D8A39&color=fff')}>
                    <Image 
                      source={selectedUser.avatar_url ? { uri: selectedUser.avatar_url } : { uri: 'https://ui-avatars.com/api/?name=' + selectedUser.email + '&background=0D8A39&color=fff' }} 
                      style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 12 }} 
                    />
                  </TouchableOpacity>
                  
                  <View style={{ width: '100%', backgroundColor: '#F7F8FA', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Nombre:</Text>
                      <Text style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, flex: 1 }}>{selectedUser.full_name || 'Sin nombre'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Correo:</Text>
                      <TouchableOpacity onPress={() => Linking.openURL(`mailto:${selectedUser.email}`)} style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, textDecorationLine: 'underline' }}>{selectedUser.email}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Teléfono:</Text>
                      <TouchableOpacity onPress={() => {
                        const num = (selectedUser.telefono || '').replace(/\D/g, '');
                        if(num) Linking.openURL(`whatsapp://send?phone=${num}`).catch(()=>Linking.openURL(`tel:${num}`));
                      }} style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, textDecorationLine: 'underline' }}>{selectedUser.telefono || '-'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 12 }}>Actividad</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <StatCard number={selectedUser.stats.views} label="Vistas" color={COLORS.navy} />
                  <StatCard number={selectedUser.stats.shares} label="Compartidos" color={COLORS.green} />
                  <StatCard number={selectedUser.stats.searches} label="Búsquedas" color={COLORS.celeste} />
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Visor de Avatar Pantalla Completa */}
      <Modal visible={!!showFullAvatar} transparent animationType="fade" onRequestClose={() => setShowFullAvatar(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center'}}>
          <TouchableOpacity style={{position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10}} onPress={() => setShowFullAvatar(null)}>
            <Text style={{color: '#fff', fontSize: 30}}>✕</Text>
          </TouchableOpacity>
          <Image source={{uri: showFullAvatar}} style={{width: '90%', height: '70%'}} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
}
