import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, Platform, Alert, ActivityIndicator,
  TextInput, Image
} from 'react-native';
import LottieView from 'lottie-react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';

export default function ConfigScreen({ navigation }) {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const versionCode = Constants.expoConfig?.android?.versionCode || 1;
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [topVistos, setTopVistos] = useState([]);
  const [topBuscados, setTopBuscados] = useState([]);
  // Perfil del usuario
  const [perfil, setPerfil] = useState({ nombre: '', avatar: null, email: '' });
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [notificaciones, setNotificaciones] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    await cargarPerfil();
    setLoading(false);
  }

  async function cargarPerfil() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, notifications_enabled')
        .eq('id', user.id)
        .single();

      if (data) {
        setPerfil({
          nombre: data.full_name || '',
          avatar: data.avatar_url || null,
          email: user.email
        });
        setNotificaciones(data.notifications_enabled !== false);
      } else {
        setPerfil(prev => ({ ...prev, email: user.email }));
      }
    } catch (e) {
      console.log('Error perfil:', e);
    }
  }

  async function toggleNotificaciones() {
    const nuevoEstado = !notificaciones;
    setNotificaciones(nuevoEstado);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('profiles').upsert({ id: user.id, notifications_enabled: nuevoEstado });
    } catch (e) {}
  }

  async function guardarNombre() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, full_name: perfil.nombre, updated_at: new Date() });
      
      if (error) throw error;
      setEditandoPerfil(false);
      Alert.alert('Éxito', 'Nombre actualizado correctamente.');
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el nombre.');
    }
  }

  async function cambiarFoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0].uri) {
        uploadAvatar(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir la galería.');
    }
  }

  async function uploadAvatar(uri) {
    setSubiendoAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileName = `${user.id}-${Date.now()}.jpg`;
      
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        name: fileName,
        type: 'image/jpeg',
      });

      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, formData);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      await supabase.from('profiles').upsert({ id: user.id, avatar_url: publicUrl });
      setPerfil(prev => ({ ...prev, avatar: publicUrl }));
      Alert.alert('Éxito', 'Foto de perfil actualizada.');
    } catch (e) {
      console.log('Error upload:', e);
      Alert.alert('Error', 'No se pudo subir la foto.');
    } finally {
      setSubiendoAvatar(false);
    }
  }

  async function buscarActualizacion() {
    setCheckingUpdate(true);
    try {
      const { data } = await supabase
        .from('version_apk')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data && data.version_code > versionCode) {
        Alert.alert(
          'Actualización disponible',
          `Versión ${data.version_name} disponible.\n${data.release_notes || ''}\n\nPor favor, cerrá la app y volvé a abrirla para que se descargue e instale automáticamente de forma silenciosa.`,
          [{ text: 'Entendido' }]
        );
      } else {
        Alert.alert('Actualizado', 'Ya tenés la última versión instalada.');
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo verificar actualizaciones.');
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function cerrarSesion() {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, cerrar', onPress: async () => await supabase.auth.signOut() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Configuración</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Mi Perfil */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <SvgIcon name="usuario" size={20} color={COLORS.navy} />
            <Text style={styles.sectionTitle}>Mi Perfil</Text>
          </View>
          <View style={styles.profileCard}>
            <TouchableOpacity onPress={cambiarFoto} style={styles.avatarWrap} disabled={subiendoAvatar}>
              {perfil.avatar ? (
                <Image source={{ uri: perfil.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#E0E0E0', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 30 }}>👤</Text>
                </View>
              )}
              {subiendoAvatar && <ActivityIndicator style={styles.avatarLoader} color={COLORS.green} />}
              <View style={styles.editBadge}><Text style={{ color: 'white', fontSize: 10 }}>✎</Text></View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              {editandoPerfil ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={perfil.nombre}
                    onChangeText={t => setPerfil(p => ({ ...p, nombre: t }))}
                    placeholder="Tu nombre completo"
                    autoFocus
                  />
                  <TouchableOpacity onPress={guardarNombre} style={styles.saveBtn}>
                    <Text style={styles.saveBtnText}>OK</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setEditandoPerfil(true)} style={styles.nameRow}>
                  <Text style={styles.profileName}>{perfil.nombre || 'Sin nombre (click para editar)'}</Text>
                  <Text style={{ fontSize: 14, color: COLORS.green, marginLeft: 8 }}>✎</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.profileEmail}>{perfil.email}</Text>
            </View>
          </View>
        </View>

        {/* Notificaciones */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <SvgIcon name="share" size={20} color={COLORS.navy} />
            <Text style={styles.sectionTitle}>Alertas y Notificaciones</Text>
          </View>
          <TouchableOpacity 
            style={styles.configRow} 
            activeOpacity={0.7}
            onPress={toggleNotificaciones}
          >
            <View style={styles.configInfo}>
              <Text style={styles.configLabel}>Notificar nuevos productos</Text>
              <Text style={styles.configDesc}>Recibir aviso cuando hay lanzamientos de Plitix</Text>
            </View>
            <View style={[styles.switch, notificaciones && styles.switchOn]}>
              <View style={[styles.switchDot, notificaciones && styles.switchDotOn]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Actualización */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <SvgIcon name="actualizar" size={20} color={COLORS.navy} />
            <Text style={styles.sectionTitle}>Sistema</Text>
          </View>
          <TouchableOpacity 
            style={styles.updateBtn} 
            onPress={buscarActualizacion}
            disabled={checkingUpdate}
            activeOpacity={0.7}
          >
            <Text style={styles.updateBtnText}>
              {checkingUpdate ? 'Verificando...' : 'Buscar actualización'}
            </Text>
            {checkingUpdate && <ActivityIndicator color="#fff" size="small" />}
          </TouchableOpacity>
        </View>

        {/* Versión */}
        <View style={styles.versionCard}>
          <LottieView
            source={require('../../assets/iso.json')}
            autoPlay
            loop={true}
            style={{ width: 50, height: 50 }}
            resizeMode="contain"
          />
          <View style={styles.versionInfo}>
            <Text style={styles.versionLabel}>Comagro App</Text>
            <Text style={styles.versionNumber}>v{appVersion} (build {versionCode})</Text>
          </View>
        </View>

        {/* Cerrar sesión */}
        <TouchableOpacity style={styles.logoutBtn} onPress={cerrarSesion} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  topTitle: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
  backBtn: { width: 60 },
  backText: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.green,
  },

  content: {
    padding: 24,
  },

  versionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    padding: 20,
    borderRadius: 14,
    marginBottom: 16,
    gap: 16,
  },
  versionInfo: { flex: 1 },
  versionLabel: {
    fontFamily: FONTS.heading,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.navy,
  },
  versionNumber: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    marginTop: 4,
  },

  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 28,
    gap: 10,
  },
  updateBtnText: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  emptyText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
    fontStyle: 'italic',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F7F8FA',
    borderRadius: 8,
    marginBottom: 6,
  },
  rankNum: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.green,
    width: 28,
  },
  rankInfo: { flex: 1 },
  rankModelo: {
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.navy,
  },
  rankMarca: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
  },
  rankCount: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    paddingLeft: 10,
  },

  logoutBtn: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    padding: 16,
    borderRadius: 14,
    gap: 16,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarLoader: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0, right: 0,
    backgroundColor: COLORS.green,
    width: 18, height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1, borderColor: '#fff',
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  profileEmail: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
    marginTop: 2,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontFamily: FONTS.body,
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  saveBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    padding: 16,
    borderRadius: 14,
    justifyContent: 'space-between',
  },
  configInfo: { flex: 1, marginRight: 10 },
  configLabel: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
  },
  configDesc: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
    marginTop: 2,
  },
  switch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DDD',
    padding: 2,
  },
  switchOn: {
    backgroundColor: COLORS.green,
  },
  switchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  switchDotOn: {
    alignSelf: 'flex-end',
  },
});
