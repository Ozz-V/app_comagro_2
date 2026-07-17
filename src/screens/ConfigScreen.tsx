import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ScrollView, Platform, ActivityIndicator, Image, TextInput, Modal, DeviceEventEmitter } from 'react-native';
import LottieView from 'lottie-react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase, SUPABASE_URL } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import DashboardAnalytics from '../components/DashboardAnalytics';
import SystemHealthMonitor from '../components/SystemHealthMonitor';
import DirectoryModal from '../components/DirectoryModal';
import UserProfileModal from '../components/UserProfileModal';
import * as Sentry from '@sentry/react-native';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import OfflineSyncModal from '../components/OfflineSyncModal';
import UpdateModal from '../components/UpdateModal';

const ANIMATION_ISO = require('../../assets/iso.json');


export default function ConfigScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void; reset: (state: unknown) => void; goBack: () => void; [key: string]: unknown } }) {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const versionCode = Constants.expoConfig?.android?.versionCode || 1;
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phoneCode, setPhoneCode] = useState('+595');
  const [phone, setPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { showAlert, showToast } = useCustomAlert();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateModalData, setUpdateModalData] = useState<Record<string, unknown> | null>(null);

  const { isSyncing, isPaused, progress, startSync, syncAlert, setSyncAlert } = useOfflineSync();
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [offlineGroups, setOfflineGroups] = useState({ catalogos: true, fichas: true, productos: true });
  const [showNoInternetModal, setShowNoInternetModal] = useState(false);
  const [lastDownloadText, setLastDownloadText] = useState('Descargar datos para usar sin internet');

  useEffect(() => {
    AsyncStorage.getItem('@productos_cache_time').then(t => {
      if (t) {
        const d = new Date(parseInt(t));
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        setLastDownloadText(`Última descarga: ${day}/${month}/${d.getFullYear()}`);
      }
    }).catch(()=>{});
  }, [progress.current, progress.total]);

  async function handleOpenOfflineModal() {
    if (isSyncing || isPaused || (progress.total > 0 && progress.current === progress.total)) {
      setShowOfflineModal(true);
      return;
    }
    try {
      await Promise.race([
        fetch(SUPABASE_URL, { method: 'HEAD', cache: 'no-store' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
      ]);
      setShowOfflineModal(true);
    } catch (err) {
      setShowNoInternetModal(true);
    }
  }

  async function handleDownload() {
    try {
      await Promise.race([
        fetch(SUPABASE_URL, { method: 'HEAD', cache: 'no-store' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
      ]);
    } catch (err) {
      setShowNoInternetModal(true);
      return;
    }
    startSync(offlineGroups);
  }

  const [showDirectoryModal, setShowDirectoryModal] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { fetchDirectoryBackground(); }, []);

  async function fetchDirectoryBackground() {
    try {
      const cachedDir = await AsyncStorage.getItem('@directory_cache');
      if (cachedDir && isMounted.current) setDirectoryUsers(JSON.parse(cachedDir));
      if (!isOnline && isMounted.current) return;
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url, email, telefono').order('full_name');
      if (data && !error) {
        const valid = data.filter(u => u.full_name && u.full_name.trim() !== '');
        if (isMounted.current) setDirectoryUsers(valid);
        await AsyncStorage.setItem('@directory_cache', JSON.stringify(valid));
      }
    } catch(e: any) {
      Sentry.captureException(e);
    }
  }

  async function handleUserClick(email: string) {
    if (!isMounted.current) return;
    setShowUserModal(true);
    setLoadingUser(true);
    const cachedProfile = directoryUsers.find(u => u.email === email);
    setSelectedUser({ 
      email, 
      full_name: cachedProfile?.full_name || '', 
      telefono: cachedProfile?.telefono || '', 
      avatar_url: cachedProfile?.avatar_url || null, 
      stats: { views: 0, shares: 0 } 
    });
    
    if (!isOnline && isMounted.current) {
      setLoadingUser(false);
      return;
    }
    
    try {
      const { data: profile, error: errProfile } = await supabase.from('profiles').select('id, full_name, avatar_url, telefono, email').eq('email', email).single();
      const { data: analyticsData, error: errAnalytics } = await supabase.from('producto_analytics').select('action').eq('user_email', email);
      
      if (errProfile || errAnalytics) throw new Error('Network fail');
      
      let v = 0, sh = 0;
      if (analyticsData) {
        analyticsData.forEach(r => {
          if (r.action === 'view') v++;
          if (r.action === 'share_pdf' || r.action === 'share_image') sh++;
        });
      }

      if (isMounted.current) {
        setSelectedUser({
          email,
          full_name: profile?.full_name || '',
          telefono: profile?.telefono || '',
          avatar_url: profile?.avatar_url || null,
          stats: { views: v, shares: sh }
        });
      }
    } catch(e: any) {
      Sentry.captureException(e);
    } finally {
      if (isMounted.current) setLoadingUser(false);
    }
  }

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    setProfileLoading(true);
    try {
      const cached = await AsyncStorage.getItem('@user_profile_cache');
      if (cached) {
        const data = JSON.parse(cached);
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
    } catch (_) {}

    setProfileLoading(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || '');
      setUserId(user.id);
      
      let pendingProfileObj = null;
      const pendingProfile = await AsyncStorage.getItem('@pending_profile');
      if (pendingProfile) {
         try {
           pendingProfileObj = JSON.parse(pendingProfile);
           const { error } = await supabase.from('profiles').upsert(pendingProfileObj, { onConflict: 'id' });
           if (!error) {
             await AsyncStorage.removeItem('@pending_profile');
             pendingProfileObj = null; 
           }
         } catch(e) {}
      }

      const pendingAvatar = await AsyncStorage.getItem('@pending_avatar');
      if (pendingAvatar) {
         uploadPhoto(pendingAvatar);
      }

      const { data } = await supabase.from('profiles').select('id, full_name, telefono, avatar_url, email, role').eq('id', user.id).single();
      if (data && !pendingProfileObj) {
        const profileData = data as { email?: string; avatar_local?: string; avatar_url?: string | null; full_name?: string; telefono?: string; id?: string; role?: string };
        profileData.email = user.email;
        setIsAdmin(profileData.role === 'admin');
        
        if (profileData.avatar_url && profileData.avatar_url.startsWith('http')) {
           try {
             const localUri = FileSystem.documentDirectory + `avatar_cache_${Date.now()}.jpg`;
             await FileSystem.downloadAsync(profileData.avatar_url, localUri);
             profileData.avatar_local = localUri;
           } catch(e) {}
        }
        
        AsyncStorage.setItem('@user_profile_cache', JSON.stringify(profileData));
        setFullName(profileData.full_name && profileData.full_name.trim() !== '' ? profileData.full_name : '');
        if (profileData.telefono && profileData.telefono !== '+595') {
          if (profileData.telefono.includes(' ')) {
            const parts = profileData.telefono.split(' ');
            setPhoneCode(parts[0]);
            setPhone(parts.slice(1).join(' '));
          } else {
            setPhone(profileData.telefono);
          }
        }
        const hasPendingAvatar = await AsyncStorage.getItem('@pending_avatar');
        if (!hasPendingAvatar) {
          setAvatarUrl(profileData.avatar_local || profileData.avatar_url || null);
        }
      }
    } catch (e) {}
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
        
        // Comprimir imagen a ~500kb
        const manipResult = await ImageManipulator.manipulateAsync(
          pickerUri,
          [{ resize: { width: 800 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );

        const localSafeUri = FileSystem.documentDirectory + `avatar_local_${Date.now()}.jpg`;
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
      const fileName = `${userId}_avatar.jpg`;
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
         await AsyncStorage.removeItem('@pending_avatar');
         saveProfile(timestampedUrl, localUri);
      } else {
         saveProfile(undefined, localUri);
      }
    } catch (e) {
      saveProfile(undefined, localUri);
    }
  }

  async function saveProfile(newAvatarUrl?: string, localAvatarUrl?: string) {
    try {
      setIsEditing(false);
      if (!userId) return;
      const combinedPhone = `${phoneCode.trim()} ${phone.trim()}`;
      
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
      
      const cacheData = { ...updatedData, avatar_local: localAvatarUrl || avatarUrl };
      await AsyncStorage.setItem('@user_profile_cache', JSON.stringify(cacheData));
      
      try {
         const { error } = await supabase.from('profiles').upsert(updatedData, { onConflict: 'id' });
         if (error) throw error;
         await AsyncStorage.removeItem('@pending_profile');
      } catch (err) {
         await AsyncStorage.setItem('@pending_profile', JSON.stringify(updatedData));
      }
      
    } catch (e) {
        showAlert('Error local', 'Hubo un error al guardar localmente.');
    }
  }

  async function buscarActualizacion() {
    setCheckingUpdate(true);
    
    try {
      await Promise.race([
        fetch(SUPABASE_URL, { method: 'HEAD', cache: 'no-store' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
      ]);
    } catch (err) {
      setCheckingUpdate(false);
      setShowNoInternetModal(true);
      return;
    }

    try {
      const { data, error } = await supabase.from('version_apk').select('version_code, download_url, release_notes, sha256_hash, md5_hash').order('created_at', { ascending: false }).limit(1).single();
      if (error) throw error;
      if (data && data.version_code > versionCode) {
        setUpdateModalData(data);
        setShowUpdateModal(true);
      } else { 
        showToast('App actualizada a la última versión.');
      }
    } catch (e) { showAlert('Error', 'No se pudo verificar.'); }
    finally { setCheckingUpdate(false); }
  }

  async function clearCache() {
    showAlert('Limpiar Caché', '¿Eliminar las imágenes guardadas en memoria para liberar espacio?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpiar', onPress: async () => {
        try {
          await ExpoImage.clearDiskCache();
          await ExpoImage.clearMemoryCache();
          showToast('Caché liberada correctamente.');
        } catch (e) {
          showToast('Error al limpiar caché.');
        }
      }}
    ]);
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

        <DashboardAnalytics navigation={navigation} onUserClick={handleUserClick} />

        <TouchableOpacity style={st.dirHeader} onPress={() => setShowDirectoryModal(true)} activeOpacity={0.7}>
          <View style={st.dirHeaderLeft}>
            <SvgIcon name="usuarios" size={18} color={COLORS.navy} />
            <Text style={st.dirTitle}>Directorio de Contactos</Text>
          </View>
        </TouchableOpacity>

        {isAdmin && <SystemHealthMonitor />}

        <View style={st.versionCard}>
          <LottieView source={ANIMATION_ISO} autoPlay loop style={{ width: 60, height: 60 }} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: '700', color: COLORS.navy }}>Comagro App</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, marginTop: 4 }}>v{appVersion} (build {versionCode})</Text>
          </View>
        </View>

        <TouchableOpacity style={st.offlineCard} onPress={handleOpenOfflineModal} activeOpacity={0.7}>
          <View style={st.offlineIconBg}>
            <SvgIcon name="cloud" size={24} color={COLORS.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy }}>
              Permitir acceso sin conexión
            </Text>
            {isSyncing ? (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.green, marginTop: 4 }}>
                Descargando: {progress.current} / {progress.total}
              </Text>
            ) : isPaused ? (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, marginTop: 4 }}>
                Descarga en pausa ({progress.current}/{progress.total})
              </Text>
            ) : progress.total > 0 && progress.current === progress.total ? (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.green, marginTop: 4 }}>
                Descarga completada
              </Text>
            ) : (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, marginTop: 4 }}>{lastDownloadText}</Text>
            )}
          </View>
          {isSyncing ? (
            <ActivityIndicator size="small" color={COLORS.navy} />
          ) : (
            lastDownloadText !== 'Descargar datos para usar sin internet' ? (
              <View style={{width: 22, height: 22, borderRadius: 11, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{color: COLORS.green, fontSize: 12, fontWeight: 'bold'}}>✓</Text>
              </View>
            ) : (
              <Text style={{ fontFamily: FONTS.heading, fontSize: 20, color: COLORS.gray4 }}>›</Text>
            )
          )}
        </TouchableOpacity>

        <TouchableOpacity style={st.updateBtn} onPress={buscarActualizacion} disabled={checkingUpdate} activeOpacity={0.7}>
          <SvgIcon name="actualizar" size={22} color="#fff" />
          <Text style={st.updateText}>{checkingUpdate ? 'Verificando...' : 'Buscar actualización'}</Text>
          {checkingUpdate && <ActivityIndicator color="#fff" size="small" />}
        </TouchableOpacity>

        <TouchableOpacity style={[st.updateBtn, { backgroundColor: '#F0F4F8', marginTop: 12 }]} onPress={clearCache} activeOpacity={0.7}>
          <View style={{ marginRight: 8 }}>
            <SvgIcon name="trash" size={20} color={COLORS.navy} />
          </View>
          <Text style={[st.updateText, { color: COLORS.navy }]}>Limpiar Caché de Imágenes</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={st.logoutBtn} 
          onPress={() => showAlert('Cerrar sesión', '¿Estás seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí', onPress: () => supabase.auth.signOut() }])}
        >
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4 }}>Cerrar sesión</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>

      <UpdateModal
        visible={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onUpdate={() => {
          setShowUpdateModal(false);
          DeviceEventEmitter.emit('TRIGGER_OTA_UPDATE', { directDownload: true });
        }}
        updateData={updateModalData}
        isAvailable={true}
      />

      <OfflineSyncModal
        visible={showOfflineModal}
        onClose={() => setShowOfflineModal(false)}
        offlineGroups={offlineGroups}
        setOfflineGroups={setOfflineGroups}
        onDownload={handleDownload}
      />

      <Modal visible={showNoInternetModal} animationType="fade" transparent onRequestClose={() => setShowNoInternetModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 28, elevation: 5, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF5F5', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <SvgIcon name="cloud" size={32} color={COLORS.navy || '#E53935'} />
            </View>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginBottom: 12, textAlign: 'center' }}>
              Sin conexión
            </Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4, textAlign: 'center', marginBottom: 30, lineHeight: 22 }}>
              Conéctese a internet para usar esta función y descargar los datos para acceso offline.
            </Text>
            <TouchableOpacity style={{ backgroundColor: COLORS.navy, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' }} onPress={() => setShowNoInternetModal(false)}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.white }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!syncAlert} animationType="fade" transparent onRequestClose={() => setSyncAlert && setSyncAlert(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 28, elevation: 5, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: syncAlert?.title?.includes('error') || syncAlert?.title?.includes('Error') ? '#FFF5F5' : syncAlert?.title?.includes('día') ? '#E8F5E9' : '#FFF9E6', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <SvgIcon name="cloud" size={32} color={syncAlert?.title?.includes('error') || syncAlert?.title?.includes('Error') ? (COLORS.navy || '#E53935') : syncAlert?.title?.includes('día') ? COLORS.green : '#FFB020'} />
            </View>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginBottom: 12, textAlign: 'center' }}>
              {syncAlert?.title}
            </Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4, textAlign: 'center', marginBottom: 30, lineHeight: 22 }}>
              {syncAlert?.message}
            </Text>
            <TouchableOpacity style={{ backgroundColor: COLORS.navy, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' }} onPress={() => { setSyncAlert && setSyncAlert(null); setShowOfflineModal(false); }}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.white }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DirectoryModal
        visible={showDirectoryModal}
        onClose={() => setShowDirectoryModal(false)}
        loadingDirectory={loadingDirectory}
        directoryUsers={directoryUsers}
        onUserClick={handleUserClick}
      />

      <UserProfileModal
        visible={showUserModal}
        onClose={() => setShowUserModal(false)}
        loadingUser={loadingUser}
        selectedUser={selectedUser}
      />

    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  dirHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderRadius: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, marginBottom: 20 },
  dirHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  dirTitle: { marginLeft: 12, fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy },
  safe: { flex: 1, backgroundColor: COLORS.white },
  topbar: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white },
  topTitle: { fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy },
  content: { padding: 24, paddingBottom: 100 },
  profileSection: { alignItems: 'center', marginBottom: 28, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.navy },
  avatarEmpty: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F0F4F8', borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', bottom: 0, right: -2, backgroundColor: COLORS.white, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, elevation: 2 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, backgroundColor: '#F7F8FA' },
  saveBtn: { flex: 1, backgroundColor: COLORS.navy, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, fontWeight: '700', color: COLORS.white },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  versionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F8FA', padding: 20, borderRadius: 14, marginBottom: 16, gap: 16, marginTop: 8 },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.green, paddingVertical: 14, borderRadius: 12, marginBottom: 28, gap: 10 },
  updateText: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  logoutBtn: { borderWidth: 1, borderColor: '#E0E0E0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  offlineCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4F8', padding: 18, borderRadius: 14, marginBottom: 20, gap: 14 },
  offlineIconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  editBtn: { paddingVertical: 6, paddingHorizontal: 20, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 20 },
});
