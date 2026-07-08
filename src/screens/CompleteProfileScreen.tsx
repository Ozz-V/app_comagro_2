import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Image, TextInput, DeviceEventEmitter } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import { useCustomAlert } from '../contexts/CustomAlertContext';

export default function CompleteProfileScreen() {
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phoneCode, setPhoneCode] = useState('+595');
  const [phone, setPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const { showAlert } = useCustomAlert();

  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || '');
      setUserId(user.id);
      
      const { data } = await supabase.from('profiles').select('id, full_name, telefono, avatar_url').eq('id', user.id).single();
      if (!isMounted.current) return;
      
      if (data) {
        if (data.full_name && data.full_name !== 'EMPTY') setFullName(data.full_name);
        if (data.telefono && data.telefono !== '+595') {
          if (data.telefono.includes(' ')) {
            const parts = data.telefono.split(' ');
            setPhoneCode(parts[0]);
            setPhone(parts.slice(1).join(' '));
          } else {
            setPhone(data.telefono);
          }
        }
        setAvatarUrl(data.avatar_url || null);
      }
    } catch (e: any) {}
  }

  async function pickPhoto() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
          showAlert('Permiso requerido', 'Necesitamos acceso a tu galería.');
          return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (!result.canceled && result.assets?.[0]) {
        const pickerUri = result.assets[0].uri;
        
        // Comprimir imagen a ~500kb reduciendo dimensiones y calidad
        const manipResult = await ImageManipulator.manipulateAsync(
          pickerUri,
          [{ resize: { width: 800 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );

        const localSafeUri = FileSystem.documentDirectory + `avatar_local_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: manipResult.uri, to: localSafeUri });
        
        if (isMounted.current) setAvatarUrl(localSafeUri); 
        await AsyncStorage.setItem('@pending_avatar', localSafeUri);
      }
    } catch (e: any) { 
        showAlert('Error', 'No se pudo seleccionar la imagen.');
    }
  }

  async function saveProfile() {
    if (!fullName.trim() || fullName.trim() === 'EMPTY') {
      showAlert('Error', 'El nombre es obligatorio.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 6) {
      showAlert('Error', 'El teléfono es obligatorio y debe ser válido.');
      return;
    }

    setProfileSaving(true);
    try {
      if (!userId) return;
      const combinedPhone = `${phoneCode.trim()} ${phone.trim()}`;
      
      let safeRemoteUrl = avatarUrl && avatarUrl.startsWith('http') ? avatarUrl : null;
      
      const pendingAvatar = await AsyncStorage.getItem('@pending_avatar');
      if (pendingAvatar) {
         const fileName = `${userId}_avatar.jpg`;
         const formData = new FormData();
         formData.append('file', { uri: pendingAvatar, name: fileName, type: 'image/jpeg' } as any);
         const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, formData, { upsert: true });
         if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            if (publicUrl) {
               safeRemoteUrl = publicUrl + '?t=' + Date.now();
               await AsyncStorage.removeItem('@pending_avatar');
            }
         }
      }

      const updatedData = {
        id: userId, full_name: fullName.trim(), telefono: combinedPhone, email: userEmail,
        avatar_url: safeRemoteUrl,
        updated_at: new Date().toISOString(),
      };
      
      const cacheData = { ...updatedData, avatar_local: avatarUrl };
      await AsyncStorage.setItem('@user_profile_cache', JSON.stringify(cacheData));
      
      await supabase.from('profiles').upsert(updatedData, { onConflict: 'id' });
      await AsyncStorage.removeItem('@pending_profile');
      
      // Señal para que App.js quite esta pantalla y lo deje entrar al Main
      DeviceEventEmitter.emit('PROFILE_COMPLETED');
      
    } catch (e: any) {
      // Guardar pendiente si falla la red
      const combinedPhone = `${phoneCode.trim()} ${phone.trim()}`;
      const updatedData = {
        id: userId, full_name: fullName.trim(), telefono: combinedPhone, email: userEmail,
        avatar_url: avatarUrl && avatarUrl.startsWith('http') ? avatarUrl : null,
        updated_at: new Date().toISOString(),
      };
      await AsyncStorage.setItem('@pending_profile', JSON.stringify(updatedData));
      const cacheData = { ...updatedData, avatar_local: avatarUrl };
      await AsyncStorage.setItem('@user_profile_cache', JSON.stringify(cacheData));
      
      DeviceEventEmitter.emit('PROFILE_COMPLETED'); // Dejarlo pasar igual en modo offline
    } finally {
      if (isMounted.current) setProfileSaving(false);
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />
      <View style={st.topbar}>
        <Text style={st.topTitle}>Bienvenido a Comagro</Text>
      </View>
      <View style={{ height: 1, backgroundColor: COLORS.border }} />

      <ScrollView contentContainerStyle={st.content}>
        <Text style={st.instruction}>Por favor, completa tus datos para continuar. El nombre y el teléfono son obligatorios.</Text>
        
        <View style={st.profileSection}>
          <TouchableOpacity onPress={pickPhoto} style={{ position: 'relative', marginBottom: 16 }} activeOpacity={0.7}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={st.avatar} />
            ) : (
              <View style={st.avatarEmpty}><SvgIcon name="agenteIA" size={36} color={COLORS.gray5} /></View>
            )}
            <View style={st.cameraBadge}><Text style={{ fontSize: 14 }}>📷</Text></View>
          </TouchableOpacity>

          <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
            <TextInput style={st.input} placeholder="Nombre completo *" placeholderTextColor={COLORS.gray4} value={fullName} onChangeText={setFullName} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingHorizontal: 10, backgroundColor: '#F7F8FA' }}>
                <Text style={{ fontSize: 14, marginRight: 4 }}>{phoneCode === '+595' ? '🇵🇾' : '🌍'}</Text>
                <TextInput
                  style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, paddingVertical: 10, minWidth: 40 }}
                  value={phoneCode}
                  onChangeText={setPhoneCode}
                  keyboardType="phone-pad"
                />
              </View>
              <TextInput 
                style={[st.input, { flex: 1 }]} 
                placeholder="Número (ej. 981 123 456) *" 
                placeholderTextColor={COLORS.gray4} 
                keyboardType="phone-pad" 
                value={phone} 
                onChangeText={setPhone} 
              />
            </View>
            <View style={{ marginTop: 20 }}>
              <TouchableOpacity style={st.saveBtn} onPress={saveProfile} disabled={profileSaving}>
                <Text style={st.saveBtnText}>{profileSaving ? 'Guardando...' : 'Guardar y Continuar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                  style={st.logoutBtn} 
                  onPress={() => showAlert('Cerrar sesión', '¿Estás seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí', onPress: () => supabase.auth.signOut() }])}
                >
                <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4 }}>Usar otra cuenta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topbar: { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy },
  content: { padding: 20, alignItems: 'center' },
  instruction: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  profileSection: { width: '100%', alignItems: 'center' },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#E8ECF0' },
  avatarEmpty: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.white, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  input: { width: '100%', backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontFamily: FONTS.body, fontSize: 15, color: COLORS.navy },
  saveBtn: { backgroundColor: COLORS.green, paddingVertical: 15, borderRadius: 12, alignItems: 'center', elevation: 2, shadowColor: COLORS.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6 },
  saveBtnText: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.white },
  logoutBtn: { marginTop: 20, alignItems: 'center' },
});
