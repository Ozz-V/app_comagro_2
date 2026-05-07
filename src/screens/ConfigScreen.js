import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, Platform, Alert, ActivityIndicator,
  Image, TextInput
} from 'react-native';
import LottieView from 'lottie-react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import DashboardAnalytics from '../components/DashboardAnalytics';

export default function ConfigScreen({ navigation }) {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const versionCode = Constants.expoConfig?.android?.versionCode || 1;
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [fullName, setFullName] = useState('');
  const [phoneCode, setPhoneCode] = useState('+595');
  const [phone, setPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    setProfileLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || '');
      setUserId(user.id);
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setFullName(data.full_name || '');
        if (data.telefono) {
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
    } catch (e) {
      console.log('Error cargando perfil:', e);
    } finally {
      setProfileLoading(false);
    }
  }

  async function pickPhoto() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (!result.canceled && result.assets?.[0]) await uploadPhoto(result.assets[0].uri);
    } catch (e) { Alert.alert('Error', 'No se pudo seleccionar la imagen.'); }
  }

  async function uploadPhoto(localUri) {
    try {
      setProfileSaving(true);
      if (!userId) return;
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
      const fileName = `${userId}_avatar.jpg`;
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) { setAvatarUrl(localUri); await saveProfile(localUri); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const photoUrl = urlData?.publicUrl || localUri;
      setAvatarUrl(photoUrl);
      await saveProfile(photoUrl);
    } catch (e) { setAvatarUrl(localUri); await saveProfile(localUri); }
    finally { setProfileSaving(false); }
  }

  async function saveProfile(newAvatarUrl) {
    try {
      setProfileSaving(true);
      if (!userId) return;
      const combinedPhone = `${phoneCode.trim()} ${phone.trim()}`;
      const { error } = await supabase.from('profiles').upsert({
        id: userId, full_name: fullName, telefono: combinedPhone, email: userEmail,
        avatar_url: newAvatarUrl !== undefined ? newAvatarUrl : avatarUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) Alert.alert('Error', 'No se pudo guardar el perfil.');
      else setIsEditing(false);
    } catch (e) { Alert.alert('Error', 'No se pudo guardar el perfil.'); }
    finally { setProfileSaving(false); }
  }

  async function buscarActualizacion() {
    setCheckingUpdate(true);
    try {
      const { data } = await supabase.from('version_apk').select('*').order('created_at', { ascending: false }).limit(1).single();
      if (data && data.version_code > versionCode) {
        Alert.alert('Actualización disponible', `Versión ${data.version_name} disponible.\n${data.release_notes || ''}\n\nCerrá la app y volvé a abrirla para actualizar.`, [{ text: 'Entendido' }]);
      } else { Alert.alert('Actualizado', 'Ya tenés la última versión.'); }
    } catch (e) { Alert.alert('Error', 'No se pudo verificar.'); }
    finally { setCheckingUpdate(false); }
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />
      <View style={st.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 16, color: COLORS.green }}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={st.topTitle}>Configuración</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={{ height: 1, backgroundColor: COLORS.border }} />

      <ScrollView contentContainerStyle={st.content}>
        {/* Profile */}
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
                  placeholder="Número (ej. 981 123 456)" 
                  placeholderTextColor={COLORS.gray4} 
                  keyboardType="phone-pad" 
                  value={phone} 
                  onChangeText={setPhone} 
                />
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
                  <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Correo:</Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, flex: 1 }}>{userEmail}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.gray4, width: 70 }}>Teléfono:</Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, flex: 1 }}>{phoneCode ? `${phoneCode} ` : ''}{phone || '-'}</Text>
                </View>
              </View>
              <TouchableOpacity style={st.editBtn} onPress={() => setIsEditing(true)}>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.navy }}>Editar perfil</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Dashboard */}
        <DashboardAnalytics navigation={navigation} />

        {/* Version */}
        <View style={st.versionCard}>
          <LottieView source={require('../../assets/iso.json')} autoPlay loop style={{ width: 60, height: 60 }} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: '700', color: COLORS.navy }}>Comagro App</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, marginTop: 4 }}>v{appVersion} (build {versionCode})</Text>
          </View>
        </View>

        <TouchableOpacity style={st.updateBtn} onPress={buscarActualizacion} disabled={checkingUpdate} activeOpacity={0.7}>
          <SvgIcon name="actualizar" size={22} color="#fff" />
          <Text style={st.updateText}>{checkingUpdate ? 'Verificando...' : 'Buscar actualización'}</Text>
          {checkingUpdate && <ActivityIndicator color="#fff" size="small" />}
        </TouchableOpacity>

        <TouchableOpacity style={st.logoutBtn} onPress={() => Alert.alert('Cerrar sesión', '¿Estás seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí', onPress: () => supabase.auth.signOut() }])}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4 }}>Cerrar sesión</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topbar: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white },
  topTitle: { fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy },
  content: { padding: 24 },
  profileSection: { alignItems: 'center', marginBottom: 28, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.navy },
  avatarEmpty: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F0F4F8', borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', bottom: 0, right: -2, backgroundColor: COLORS.white, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, elevation: 2 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  profileName: { fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginBottom: 4 },
  profileEmail: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginBottom: 12 },
  editBtn: { paddingVertical: 6, paddingHorizontal: 20, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 20 },
  input: { borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, backgroundColor: '#F7F8FA' },
  saveBtn: { flex: 1, backgroundColor: COLORS.navy, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, fontWeight: '700', color: COLORS.white },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  versionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F8FA', padding: 20, borderRadius: 14, marginBottom: 16, gap: 16, marginTop: 8 },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.green, paddingVertical: 14, borderRadius: 12, marginBottom: 28, gap: 10 },
  updateText: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  logoutBtn: { borderWidth: 1, borderColor: '#E0E0E0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
});
