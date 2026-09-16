import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../supabase';
import { COLORS, FONTS } from '../../theme';
import SvgIcon from '../SvgIcon';
import { useCustomAlert } from '../../contexts/CustomAlertContext';

export default function ProfileSection() {
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phoneCode, setPhoneCode] = useState('+595');
  const [phone, setPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { showAlert, showToast } = useCustomAlert();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadProfile();
    return () => { isMounted.current = false; };
  }, []);

  async function loadProfile() {
    try {
      const cached = await AsyncStorage.getItem('@user_profile_cache');
      let data = cached ? JSON.parse(cached) : null;
      
      // Si hay caché, mostrar los datos INMEDIATAMENTE sin bloquear la pantalla
      if (data && isMounted.current) {
        if (data.id) setUserId(data.id);
        setUserEmail(data.email || '');
        setFullName(data.full_name && data.full_name.trim() !== '' ? data.full_name : '');
        if (data.telefono && data.telefono !== '+595') {
          if (data.telefono.includes(' ')) {
            const parts = data.telefono.split(' ');
            setPhoneCode(parts[0]);
            setPhone(parts.slice(1).join(' '));
          } else {
            setPhone(data.telefono);
          }
        }
        setAvatarUrl(data.avatar_local || data.avatar_url || null);
        setProfileLoading(false); // Quitar el loading al instante
      } else {
        setProfileLoading(true); // Solo mostrar loading si no hay absolutamente nada
      }
      
      // En SEGUNDO PLANO, consultar a Supabase para sincronizar
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const { data: dbProfile } = await supabase.from('profiles').select('id, full_name, avatar_url, telefono, email').eq('id', authData.user.id).single();
          if (dbProfile) {
            data = { ...data, ...dbProfile };
            await AsyncStorage.setItem('@user_profile_cache', JSON.stringify(data));
            
            // Actualizar silenciosamente si hubo cambios en la nube
            if (isMounted.current) {
              if (data.id) setUserId(data.id);
              setUserEmail(data.email || '');
              setFullName(data.full_name && data.full_name.trim() !== '' ? data.full_name : '');
              if (data.telefono && data.telefono !== '+595') {
                if (data.telefono.includes(' ')) {
                  const parts = data.telefono.split(' ');
                  setPhoneCode(parts[0]);
                  setPhone(parts.slice(1).join(' '));
                } else {
                  setPhone(data.telefono);
                }
              }
              setAvatarUrl(data.avatar_local || data.avatar_url || null);
            }
          }
        }
      } catch (err) {}

    } catch (_) {}
    if (isMounted.current) setProfileLoading(false);
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
        const oldAvatar = avatarUrl;
        
        const manipResult = await ImageManipulator.manipulateAsync(
          pickerUri,
          [{ resize: { width: 800 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );

        const localSafeUri = FileSystem.documentDirectory + 'avatar_local_' + Date.now() + '.jpg';
        await FileSystem.copyAsync({ from: manipResult.uri, to: localSafeUri });
        setAvatarUrl(localSafeUri); 
        await AsyncStorage.setItem('@pending_avatar', localSafeUri);
        uploadPhoto(localSafeUri);
        
        if (oldAvatar && oldAvatar.startsWith('file://')) {
          try { await FileSystem.deleteAsync(oldAvatar, { idempotent: true }); } catch (e) {}
        }
      }
    } catch (e) { 
        showAlert('Error', 'No se pudo seleccionar la imagen.');
    }
  }

  async function uploadPhoto(localUri: string) {
    try {
      if (!userId) {
         saveProfile(undefined, localUri);
         return;
      }
      const fileName = userId + '_avatar.jpg';
      const formData = new FormData();
      formData.append('file', {
        uri: localUri,
        name: fileName,
        type: 'image/jpeg',
      } as unknown as Blob);
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, formData, { upsert: true });
      if (uploadError) {
         saveProfile(undefined, localUri);
         return;
      }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      if (publicUrl) {
         const timestampedUrl = publicUrl + '?t=' + Date.now();
         saveProfile(timestampedUrl, localUri);
      } else {
         saveProfile(undefined, localUri);
      }
    } catch (err) {
      saveProfile(undefined, localUri);
    }
  }

  async function saveProfile(newAvatarUrl?: string, localAvatarUrl?: string) {
    try {
      setIsEditing(false);
      if (!userId) return;
      const combinedPhone = phoneCode.trim() + ' ' + phone.trim();
      
      let safeRemoteUrl = newAvatarUrl;
      if (safeRemoteUrl === undefined) {
        const cached = await AsyncStorage.getItem('@user_profile_cache');
        if (cached) {
          const p = JSON.parse(cached);
          safeRemoteUrl = p.avatar_url && p.avatar_url.startsWith('http') ? p.avatar_url : null;
        }
      }

      const updatedData = {
        id: userId, full_name: fullName, telefono: combinedPhone, email: userEmail,
        avatar_url: safeRemoteUrl,
        updated_at: new Date().toISOString(),
      };
      
      const { error } = await supabase.from('profiles').upsert(updatedData, { onConflict: 'id' });
      
      if (!error) {
         showToast('Perfil guardado');
         const cached = await AsyncStorage.getItem('@user_profile_cache');
         if (cached) {
            const p = JSON.parse(cached);
            p.full_name = fullName;
            p.telefono = combinedPhone;
            p.avatar_url = safeRemoteUrl;
            if (localAvatarUrl) p.avatar_local = localAvatarUrl;
            await AsyncStorage.setItem('@user_profile_cache', JSON.stringify(p));
         }
      } else {
         showAlert('Error', 'No se pudo guardar el perfil.');
      }
    } catch (err) {
      showAlert('Error', 'Problema al guardar el perfil.');
    } finally {
      if (isMounted.current) setProfileSaving(false);
    }
  }

  return (
    <View style={st.profileSection}>
      <TouchableOpacity onPress={pickPhoto} style={{ position: 'relative', marginBottom: 16 }} activeOpacity={0.7}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={st.avatar} />
        ) : (
          <View style={st.avatarEmpty}><SvgIcon name="agenteIA" size={36} color={COLORS.gray5} /></View>
        )}
        <View style={st.cameraBadge}><Text style={{ fontSize: 14 }}>📷</Text></View>
        {profileSaving && <View style={st.avatarOverlay}><ActivityIndicator size="small" color="#fff" /></View>}
      </TouchableOpacity>

      {profileLoading ? <ActivityIndicator size="small" color={COLORS.navy} /> : isEditing ? (
        <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
          <TextInput style={st.input} placeholder="Nombre completo" placeholderTextColor={COLORS.gray4} value={fullName} onChangeText={setFullName} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingHorizontal: 10, backgroundColor: '#F7F8FA' }}>
              <Text style={{ fontSize: 14, marginRight: 4 }}>{phoneCode === '+595' ? '🇵🇾' : '🌎'}</Text>
              <TextInput style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, paddingVertical: 10, minWidth: 40 }} value={phoneCode} onChangeText={setPhoneCode} keyboardType="phone-pad" />
            </View>
            <TextInput style={[st.input, { flex: 1 }]} placeholder="Número (ej. 981 123 456)" placeholderTextColor={COLORS.gray4} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <TouchableOpacity style={st.saveBtn} onPress={() => saveProfile()} disabled={profileSaving}>
              <Text style={st.saveBtnText}>{profileSaving ? 'Guardando...' : 'Guardar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.cancelBtn} onPress={() => setIsEditing(false)}>
              <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ width: '100%', alignItems: 'center' }}>
          <View style={{ width: '100%', backgroundColor: '#F7F8FA', borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Nombre:</Text>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, flex: 1 }}>{fullName || 'Sin nombre'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Celular:</Text>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, flex: 1 }}>{phoneCode} {phone}</Text>
            </View>
            {!!userEmail && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Correo:</Text>
                <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, flex: 1 }}>{userEmail}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={st.editBtn} onPress={() => setIsEditing(true)}>
            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy }}>Editar Perfil</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  profileSection: { alignItems: 'center', marginBottom: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.navy },
  avatarEmpty: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F0F4F8', borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', bottom: 0, right: -2, backgroundColor: COLORS.white, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, elevation: 2 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: '#DCE4EE', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, backgroundColor: '#F7F8FA' },
  saveBtn: { flex: 1, backgroundColor: COLORS.navy, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, fontWeight: '700', color: '#fff' },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  editBtn: { paddingVertical: 6, paddingHorizontal: 20, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 20 }
});
