import React, { useEffect, useState, useCallback } from 'react';
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

export default function ConfigScreen({ navigation }) {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const versionCode = Constants.expoConfig?.android?.versionCode || 1;
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Profile state
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [fullName, setFullName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Activity summary
  const [activitySummary, setActivitySummary] = useState({
    totalViews: 0,
    totalShares: 0,
    totalSearches: 0,
    topViewed: null,
    topShared: null,
    topSearched: null,
  });

  useEffect(() => {
    loadProfile();
    loadActivitySummary();
  }, []);

  async function loadProfile() {
    setProfileLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || '');
      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setFullName(data.full_name || '');
        setAvatarUrl(data.avatar_url || null);
      }
    } catch (e) {
      console.log('Error cargando perfil:', e);
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadActivitySummary() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all user analytics
      const { data: views } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku')
        .eq('user_email', user.email)
        .eq('action', 'view');

      const { data: shares } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku')
        .eq('user_email', user.email)
        .in('action', ['share_pdf', 'share_image']);

      const { data: searches } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku')
        .eq('user_email', user.email)
        .eq('action', 'search');

      const getTop = (items) => {
        if (!items || items.length === 0) return null;
        const counts = {};
        items.forEach(i => {
          const key = i.sku || i.modelo;
          if (!counts[key]) counts[key] = { modelo: i.modelo, marca: i.marca, count: 0 };
          counts[key].count++;
        });
        return Object.values(counts).sort((a, b) => b.count - a.count)[0] || null;
      };

      setActivitySummary({
        totalViews: views?.length || 0,
        totalShares: shares?.length || 0,
        totalSearches: searches?.length || 0,
        topViewed: getTop(views),
        topShared: getTop(shares),
        topSearched: getTop(searches),
      });
    } catch (e) {
      console.log('Error cargando actividad:', e);
    }
  }

  async function pickPhoto() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar la foto.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        await uploadPhoto(asset.uri);
      }
    } catch (e) {
      console.log('Error seleccionando foto:', e);
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  }

  async function uploadPhoto(localUri) {
    try {
      setProfileSaving(true);
      if (!userId) return;

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileName = `${userId}_avatar.jpg`;
      const filePath = `${fileName}`;

      // Decode base64 to ArrayBuffer
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Upload to Supabase Storage bucket "avatars"
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes.buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.log('Storage upload error:', uploadError.message);
        // Fallback: save local URI
        setAvatarUrl(localUri);
        await saveProfile(localUri);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const photoUrl = urlData?.publicUrl || localUri;
      setAvatarUrl(photoUrl);
      await saveProfile(photoUrl);
    } catch (e) {
      console.log('Error subiendo foto:', e);
      setAvatarUrl(localUri);
      await saveProfile(localUri);
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveProfile(newAvatarUrl) {
    try {
      setProfileSaving(true);
      if (!userId) return;

      const profileData = {
        id: userId,
        full_name: fullName,
        avatar_url: newAvatarUrl !== undefined ? newAvatarUrl : avatarUrl,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' });

      if (error) {
        console.log('Error guardando perfil:', error);
        Alert.alert('Error', 'No se pudo guardar el perfil. Verificá la conexión.');
      } else {
        setIsEditing(false);
      }
    } catch (e) {
      console.log('Error guardando perfil:', e);
      Alert.alert('Error', 'No se pudo guardar el perfil.');
    } finally {
      setProfileSaving(false);
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
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <TouchableOpacity onPress={pickPhoto} style={styles.avatarWrap} activeOpacity={0.7}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <SvgIcon name="agenteIA" size={36} color={COLORS.gray5} />
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarBadgeText}>📷</Text>
            </View>
            {profileSaving && (
              <View style={styles.avatarLoading}>
                <ActivityIndicator size="small" color={COLORS.white} />
              </View>
            )}
          </TouchableOpacity>

          {profileLoading ? (
            <ActivityIndicator size="small" color={COLORS.navy} style={{ marginTop: 12 }} />
          ) : isEditing ? (
            <View style={styles.profileForm}>
              <TextInput
                style={styles.profileInput}
                placeholder="Nombre completo"
                placeholderTextColor={COLORS.gray4}
                value={fullName}
                onChangeText={setFullName}
              />
              <View style={styles.profileFormActions}>
                <TouchableOpacity
                  style={styles.profileSaveBtn}
                  onPress={() => saveProfile()}
                  disabled={profileSaving}
                  activeOpacity={0.7}
                >
                  <Text style={styles.profileSaveBtnText}>
                    {profileSaving ? 'Guardando...' : 'Guardar'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileCancelBtn}
                  onPress={() => setIsEditing(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.profileCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {fullName || 'Sin nombre'}
              </Text>
              <Text style={styles.profileEmail}>{userEmail}</Text>
              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.editProfileBtnText}>Editar perfil</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Activity Summary */}
        <View style={styles.activitySection}>
          <Text style={styles.activityTitle}>Resumen de actividad</Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{activitySummary.totalViews}</Text>
              <Text style={styles.statLabel}>Vistas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{activitySummary.totalShares}</Text>
              <Text style={styles.statLabel}>Compartidos</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{activitySummary.totalSearches}</Text>
              <Text style={styles.statLabel}>Búsquedas</Text>
            </View>
          </View>

          {activitySummary.topViewed && (
            <View style={styles.topItemRow}>
              <Text style={styles.topItemLabel}>Más visto</Text>
              <View style={styles.topItemInfo}>
                <Text style={styles.topItemModelo} numberOfLines={1}>{activitySummary.topViewed.modelo}</Text>
                <Text style={styles.topItemMarca}>{activitySummary.topViewed.marca} · {activitySummary.topViewed.count} veces</Text>
              </View>
            </View>
          )}

          {activitySummary.topShared && (
            <View style={styles.topItemRow}>
              <Text style={styles.topItemLabel}>Más compartido</Text>
              <View style={styles.topItemInfo}>
                <Text style={styles.topItemModelo} numberOfLines={1}>{activitySummary.topShared.modelo}</Text>
                <Text style={styles.topItemMarca}>{activitySummary.topShared.marca} · {activitySummary.topShared.count} veces</Text>
              </View>
            </View>
          )}

          {activitySummary.topSearched && (
            <View style={styles.topItemRow}>
              <Text style={styles.topItemLabel}>Más buscado</Text>
              <View style={styles.topItemInfo}>
                <Text style={styles.topItemModelo} numberOfLines={1}>{activitySummary.topSearched.modelo}</Text>
                <Text style={styles.topItemMarca}>{activitySummary.topSearched.marca} · {activitySummary.topSearched.count} veces</Text>
              </View>
            </View>
          )}
        </View>

        {/* Versión */}
        <View style={styles.versionCard}>
          <LottieView
            source={require('../../assets/iso.json')}
            autoPlay
            loop={true}
            style={{ width: 60, height: 60 }}
            resizeMode="contain"
          />
          <View style={styles.versionInfo}>
            <Text style={styles.versionLabel}>Comagro App</Text>
            <Text style={styles.versionNumber}>v{appVersion} (build {versionCode})</Text>
          </View>
        </View>

        {/* Buscar actualización */}
        <TouchableOpacity 
          style={styles.updateBtn} 
          onPress={buscarActualizacion}
          disabled={checkingUpdate}
          activeOpacity={0.7}
        >
          <SvgIcon name="actualizar" size={22} color="#fff" />
          <Text style={styles.updateBtnText}>
            {checkingUpdate ? 'Verificando...' : 'Buscar actualización'}
          </Text>
          {checkingUpdate && <ActivityIndicator color="#fff" size="small" />}
        </TouchableOpacity>

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

  // Profile section
  profileSection: {
    alignItems: 'center',
    marginBottom: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarImg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: COLORS.navy,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F0F4F8',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    backgroundColor: COLORS.white,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  avatarBadgeText: {
    fontSize: 14,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    alignItems: 'center',
  },
  profileName: {
    fontFamily: FONTS.heading,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 4,
  },
  profileEmail: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
    marginBottom: 12,
  },
  editProfileBtn: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: COLORS.navy,
    borderRadius: 20,
  },
  editProfileBtnText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 13,
    color: COLORS.navy,
  },

  // Profile form
  profileForm: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.navy,
    backgroundColor: '#F7F8FA',
  },
  profileFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  profileSaveBtn: {
    flex: 1,
    backgroundColor: COLORS.navy,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  profileSaveBtnText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  profileCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  profileCancelBtnText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
  },

  // Activity summary
  activitySection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  activityTitle: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F0F4F8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.navy,
  },
  statLabel: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
    marginTop: 2,
  },
  topItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F7F8FA',
    borderRadius: 8,
    marginBottom: 6,
  },
  topItemLabel: {
    fontFamily: FONTS.bodySemi,
    fontSize: 11,
    color: COLORS.green,
    fontWeight: '700',
    width: 90,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  topItemInfo: { flex: 1 },
  topItemModelo: {
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.navy,
  },
  topItemMarca: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
  },

  // Version
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
});
