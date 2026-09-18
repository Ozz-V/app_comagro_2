import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ScrollView, Platform, ActivityIndicator, TextInput, Modal, DeviceEventEmitter } from 'react-native';
import LottieView from 'lottie-react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase, SUPABASE_URL } from '../supabase';
import { syncAnalyticsQueue } from '../utils/analyticsSync';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import DirectoryModal from '../components/DirectoryModal';
import UserProfileModal from '../components/UserProfileModal';
import * as Sentry from '@sentry/react-native';
import { useOfflineSync } from '../contexts/OfflineSyncContext';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useAuthStore } from '../store/useAuthStore';
import OfflineSyncModal from '../components/OfflineSyncModal';
import UpdateModal from '../components/UpdateModal';
import ProfileSection from '../components/config/ProfileSection';

const ANIMATION_ISO = require('../../assets/iso.json');

const WHATS_NEW_FEATURES = [
  { title: 'Visualizador de imágenes', description: 'Navega por múltiples fotos en alta calidad haciendo zoom y deslizando.' },
  { title: 'Nuevos íconos', description: 'Renovamos el diseño visual para una experiencia más moderna y clara.' },
  { title: 'Buzón de sugerencias', description: 'Envía tus comentarios y reportes de forma directa desde la app.' },
  { title: 'Estadísticas', description: 'Monitorea métricas y análisis detallados en tiempo real.' },
  { title: 'Curva de rendimiento', description: 'Visualiza gráficos avanzados de rendimiento en los equipos.' },
  { title: 'Calculadora avanzada', description: 'Herramienta de cálculo optimizada para tareas agrícolas.' },
  { title: 'Sección de notificaciones', description: 'Centro de mensajes para que no te pierdas ninguna alerta.' },
  { title: 'Alertas sobre actualizaciones', description: 'Recibe notificaciones en vivo cuando un producto cambia.' },
];

// --- COMPONENTE GENÉRICO DE TARJETA PARA EL MENÚ ---
const MenuCard = ({ iconName, iconNode, title, subtitle, onPress, rightNode, disabled }: any) => (
  <TouchableOpacity style={[st.actionCard, disabled && { opacity: 0.7 }]} onPress={onPress} activeOpacity={0.7} disabled={disabled || !onPress}>
    <View style={st.actionIconBg}>
      {iconNode ? iconNode : <SvgIcon name={iconName} size={22} color={COLORS.navy} />}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={st.actionTitle}>{title}</Text>
      {!!subtitle && <Text style={st.actionSubtitle}>{subtitle}</Text>}
    </View>
    {rightNode !== undefined ? rightNode : (onPress ? <Text style={st.actionArrow}>›</Text> : null)}
  </TouchableOpacity>
);

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
  const { isAdmin } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);

  const { showAlert, showToast } = useCustomAlert();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateModalData, setUpdateModalData] = useState<Record<string, unknown> | null>(null);

  const { isSyncing, isPaused, progress, startSync, syncAlert, setSyncAlert, isOnline } = useOfflineSync();
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
    
    // Mostramos la data del caché inmediatamente
    const cachedProfile = directoryUsers.find(u => u.email === email);
    let cachedStats = { views: 0, shares: 0 };
    try {
      const statsStr = await AsyncStorage.getItem('@user_stats_cache');
      if (statsStr) {
        const parsed = JSON.parse(statsStr);
        if (parsed[email]) cachedStats = parsed[email];
      }
    } catch(e) {}

    setSelectedUser({ 
      email, 
      full_name: cachedProfile?.full_name || '', 
      telefono: cachedProfile?.telefono || '', 
      avatar_url: cachedProfile?.avatar_url || null, 
      stats: cachedStats 
    });
    setLoadingUser(false);
    
    if (!isOnline && isMounted.current) return;
    
    try {
      await syncAnalyticsQueue();
      const { data: profile, error: errProfile } = await supabase.from('profiles').select('id, full_name, avatar_url, telefono, email').eq('email', email).single();
      // RPC agregada: cualquier usuario (admin o no) puede ver los totales de
      // vistas/compartidos de cualquier contacto, sin necesitar leer las filas
      // crudas de producto_analytics (bloqueadas por RLS para no-admins).
      const { data: statsRows, error: errAnalytics } = await supabase.rpc('get_user_analytics_summary', { p_email: email });

      if (errProfile || errAnalytics) throw new Error('Network fail');

      const statsRow = Array.isArray(statsRows) ? statsRows[0] : statsRows;
      const v = Number(statsRow?.views || 0);
      const sh = Number(statsRow?.shares || 0);

      if (isMounted.current) {
        setSelectedUser({
          email,
          full_name: profile?.full_name || '',
          telefono: profile?.telefono || '',
          avatar_url: profile?.avatar_url || null,
          stats: { views: v, shares: sh }
        });
      }

      // Guardar silenciosamente en caché
      try {
        const statsStr = await AsyncStorage.getItem('@user_stats_cache');
        const parsed = statsStr ? JSON.parse(statsStr) : {};
        parsed[email] = { views: v, shares: sh };
        await AsyncStorage.setItem('@user_stats_cache', JSON.stringify(parsed));
      } catch(e) {}

    } catch(e: any) {
      Sentry.captureException(e);
    } finally {
      if (isMounted.current) setLoadingUser(false);
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
      const { data, error } = await supabase.from('version_apk').select('version_code, download_url, release_notes, sha256_hash').order('created_at', { ascending: false }).limit(1).single();
      if (error) throw error;
      if (data && data.version_code > versionCode) {
        setUpdateModalData(data);
        setShowUpdateModal(true);
      } else { 
        showAlert('El sistema está actualizado', 'Versión ' + appVersion);
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
        <View style={{ width: 60 }} />
        <Text style={st.topTitle}>Configuración</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={{ height: 1, backgroundColor: COLORS.border }} />

      <ScrollView contentContainerStyle={st.content}>
        
        <ProfileSection />

          {/* --- LISTA DE MENÚ ESTANDARIZADA --- */}
        <View style={{ width: '100%' }}>
          <MenuCard 
            iconName="usuarios"
            title="Directorio de Contactos"
            subtitle="Ver usuarios de la empresa"
            onPress={() => setShowDirectoryModal(true)}
          />

          <MenuCard 
            iconNode={<LottieView source={ANIMATION_ISO} autoPlay loop style={{ width: 34, height: 34 }} resizeMode="contain" />}
            title="Comagro App"
            subtitle={`v${appVersion} (build ${versionCode})`}
            rightNode={<View />} 
          />

          <MenuCard 
            iconName="cloud"
            title="Permitir acceso sin conexión"
            subtitle={
              isSyncing ? `Descargando: ${progress.current} / ${progress.total}` :
              isPaused ? `Descarga en pausa (${progress.current}/${progress.total})` :
              (progress.total > 0 && progress.current === progress.total) ? 'Descarga completada' :
              lastDownloadText
            }
            onPress={handleOpenOfflineModal}
            rightNode={
              isSyncing ? <ActivityIndicator size="small" color={COLORS.navy} /> :
              (lastDownloadText !== 'Descargar datos para usar sin internet' && !isPaused) ? (
                <View style={{width: 22, height: 22, borderRadius: 11, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{color: COLORS.green, fontSize: 12, fontWeight: 'bold'}}>✓</Text>
                </View>
              ) : <Text style={st.actionArrow}>›</Text>
            }
          />

          <MenuCard 
            iconName="actualizar"
            title="Buscar actualización"
            subtitle="Verificar si hay una nueva versión"
            onPress={buscarActualizacion}
            disabled={checkingUpdate}
            rightNode={checkingUpdate ? <ActivityIndicator color={COLORS.navy} size="small" /> : <Text style={st.actionArrow}>›</Text>}
          />

          <MenuCard 
            iconName="trash"
            title="Limpiar Caché de Imágenes"
            subtitle="Liberar espacio en el dispositivo"
            onPress={clearCache}
          />
        </View>

        {/* --- CERRAR SESIÓN (Discreto) --- */}
        <TouchableOpacity style={st.logoutBtn} onPress={() => showAlert('Cerrar sesión', '¿Estás seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí', onPress: () => supabase.auth.signOut() }])}>
          <Text style={st.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
        
      </ScrollView>

      {/* --- MODALS --- */}
      <UpdateModal visible={showUpdateModal} onClose={() => setShowUpdateModal(false)} onUpdate={() => { setShowUpdateModal(false); DeviceEventEmitter.emit('TRIGGER_OTA_UPDATE', { directDownload: true }); }} updateData={updateModalData} isAvailable={true} />

      <OfflineSyncModal visible={showOfflineModal} onClose={() => setShowOfflineModal(false)} offlineGroups={offlineGroups} setOfflineGroups={setOfflineGroups} onDownload={handleDownload} />

      <Modal visible={showNoInternetModal} animationType="fade" transparent onRequestClose={() => setShowNoInternetModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 28, elevation: 5, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF5F5', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <SvgIcon name="cloud" size={32} color={COLORS.navy || '#E53935'} />
            </View>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginBottom: 12, textAlign: 'center' }}>Sin conexión</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4, textAlign: 'center', marginBottom: 30, lineHeight: 22 }}>Conéctese a internet para usar esta función y descargar los datos para acceso offline.</Text>
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
            <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginBottom: 12, textAlign: 'center' }}>{syncAlert?.title}</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4, textAlign: 'center', marginBottom: 30, lineHeight: 22 }}>{syncAlert?.message}</Text>
            <TouchableOpacity style={{ backgroundColor: COLORS.navy, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' }} onPress={() => { setSyncAlert && setSyncAlert(null); setShowOfflineModal(false); }}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.white }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DirectoryModal visible={showDirectoryModal} onClose={() => setShowDirectoryModal(false)} loadingDirectory={loadingDirectory} directoryUsers={directoryUsers} onUserClick={handleUserClick} />
      <UserProfileModal visible={showUserModal} onClose={() => setShowUserModal(false)} loadingUser={loadingUser} selectedUser={selectedUser} />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topbar: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white },
  topTitle: { fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy },
  content: { padding: 24, paddingBottom: 60 },
  
  profileSection: { alignItems: 'center', marginBottom: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.navy },
  avatarEmpty: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F0F4F8', borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', bottom: 0, right: -2, backgroundColor: COLORS.white, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, elevation: 2 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy, backgroundColor: '#F7F8FA' },
  saveBtn: { flex: 1, backgroundColor: COLORS.navy, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { fontFamily: FONTS.bodySemi, fontSize: 14, fontWeight: '700', color: COLORS.white },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  editBtn: { paddingVertical: 6, paddingHorizontal: 20, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 20 },

  /* --- NUEVOS ESTILOS PARA LAS TARJETAS DEL MENÚ --- */
  actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4F8', padding: 16, borderRadius: 14, marginBottom: 12, gap: 14 },
  actionIconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy },
  actionSubtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, marginTop: 2 },
  actionArrow: { fontFamily: FONTS.heading, fontSize: 20, color: COLORS.gray4 },
  
  /* --- CERRAR SESIÓN --- */
  logoutBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 16, marginBottom: 20 },
  logoutText: { fontFamily: FONTS.bodySemi, fontSize: 15, color: '#A0AAB5', textDecorationLine: 'underline' },
});
