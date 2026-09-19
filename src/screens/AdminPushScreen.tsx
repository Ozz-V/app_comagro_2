import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, ScrollView, Switch, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { COLORS, FONTS } from '../theme';
import RichTextEditorModal from '../components/RichTextEditorModal';
import CustomDateTimePicker from '../components/CustomDateTimePicker';
import { SvgXml } from 'react-native-svg';

const ANIMATION_ISO = require('../../assets/iso.json');
const CalendarIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

// Debe coincidir EXACTO con el enum public.tipo_comunicado en la base de datos.
const TIPOS_COMUNICADO = [
  'Nuevas actualizaciones!',
  'Aviso Importante',
  'Problemas Conocidos / Mejoras',
  'Saludos / Festividades (Otros)',
  'Imagen'
];

// El tipo "Nuevas actualizaciones!" siempre queda amarrado a la ultima
// version publicada en version_apk: no tiene selector, se calcula solo.
const TIPO_NUEVA_ACTUALIZACION = TIPOS_COMUNICADO[0];

type TargetScope = 'all' | 'latest' | 'previous';

interface LatestVersion {
  version_code: number;
  version_name: string | null;
}

type AdminPushRouteParams = {
  AdminPush: { targetUser?: { id: string; full_name: string } } | undefined;
};

export default function AdminPushScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<AdminPushRouteParams, 'AdminPush'>>();
  const { showAlert } = useCustomAlert();
  const targetUser = route.params?.targetUser;

  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tipo, setTipo] = useState(TIPOS_COMUNICADO[0]);
  const [imagenUrl, setImagenUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [fechaEnvio, setFechaEnvio] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [richEditorVisible, setRichEditorVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [latestVersion, setLatestVersion] = useState<LatestVersion | null>(null);
  const [targetScope, setTargetScope] = useState<TargetScope>('all');

  const esNuevaActualizacion = tipo === TIPO_NUEVA_ACTUALIZACION;

  // Trae la ultima version publicada en version_apk para poder:
  //  1. Amarrar "Nuevas actualizaciones!" a ella automaticamente.
  //  2. Mostrarle al admin el numero de version en el selector de segmentacion.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('version_apk')
        .select('version_code, version_name')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data && data.version_code) setLatestVersion(data);
    })();
  }, []);

  // "Nuevas actualizaciones!" siempre va segmentado a 'latest' sin que el
  // admin tenga que elegir nada. Al cambiar a cualquier otro tipo, el
  // selector vuelve a su default ('Todos') para no arrastrar el forzado.
  useEffect(() => {
    if (esNuevaActualizacion) {
      setTargetScope('latest');
    } else {
      setTargetScope('all');
    }
  }, [esNuevaActualizacion]);

  // Validacion reactiva para habilitar/deshabilitar el boton
  const isFormValid = titulo.trim().length > 0 && 
                      mensaje.trim().length > 0 && 
                      (isActive || fechaEnvio !== null) && 
                      (tipo !== 'Imagen' || imagenUrl.trim().length > 0);

  const formatFecha = (d: Date | null) => {
    if (!d) return 'Seleccionar fecha y hora...';
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const enviar = async () => {
    if (!isFormValid) return;

    const confirmMsg = targetUser
      ? `Enviar este comunicado solo a ${targetUser.full_name}?`
      : 'Enviar este comunicado a todos los usuarios?';

    showAlert(
      'Confirmar',
      confirmMsg,
      [
        { text: 'NO', style: 'cancel' },
        {
          text: 'Si',
          onPress: async () => {
            setLoading(true);
            try {
              // Un comunicado personalizado (targetUser) le llega a esa persona
              // sin importar su version instalada, asi que ignora por completo
              // la segmentacion por version_apk.
              const scopeFinal: TargetScope = (!targetUser && latestVersion) ? targetScope : 'all';
              const bodyInsert = {
                tipo,
                titulo: titulo.trim(),
                contenido: mensaje.trim(),
                imagen_url: tipo === 'Imagen' ? imagenUrl.trim() : null,
                is_active: true,
                created_at: isActive ? new Date().toISOString() : fechaEnvio?.toISOString(),
                target_scope: scopeFinal,
                target_version_code: (!targetUser && scopeFinal !== 'all') ? latestVersion?.version_code : null,
                target_user_ids: targetUser ? [targetUser.id] : null
              };

              const { error } = await supabase.from('app_comunicados').insert([bodyInsert]);
              if (error) throw error;

              showAlert('Exito', 'Comunicado creado correctamente.');
              navigation.goBack();
            } catch (err: unknown) {
              const errorMessage = err instanceof Error ? err.message : 'No se pudo crear el comunicado.';
              showAlert('Error', errorMessage);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView
          source={ANIMATION_ISO}
          autoPlay
          loop
          style={styles.logoAnimado}
          resizeMode="contain"
        />
      </View>
      <View style={styles.topBorder} />
      <Text style={styles.titulo}>{targetUser ? 'Comunicado Personalizado' : 'Nuevo Comunicado'}</Text>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.card}>
          {targetUser && (
            <View style={styles.targetUserBox}>
              <Text style={styles.targetUserTexto}>
                Destinatario: <Text style={styles.targetUserNombre}>{targetUser.full_name}</Text> (solo esta persona lo vera, sin importar su version).
              </Text>
            </View>
          )}

          <Text style={styles.label}>Tipo de Comunicado</Text>
          <View style={styles.tipoContainer}>
            {TIPOS_COMUNICADO.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tipoBadge, tipo === t && styles.tipoBadgeActivo]}
                onPress={() => setTipo(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tipoTexto, tipo === t && styles.tipoTextoActivo]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {targetUser ? null : esNuevaActualizacion ? (
            <View style={styles.segmentInfoBox}>
              <Text style={styles.segmentInfoTexto}>
                {latestVersion
                  ? `Se enviara solo a usuarios en la ultima version instalada (V${latestVersion.version_name || latestVersion.version_code}).`
                  : 'Aun no hay ninguna version registrada en version_apk: por ahora se enviara a todos.'}
              </Text>
            </View>
          ) : (
            <View style={styles.segmentContainer}>
              <Text style={styles.label}>Enviar a</Text>
              <View style={styles.tipoContainer}>
                <TouchableOpacity
                  style={[styles.tipoBadge, targetScope === 'all' && styles.tipoBadgeActivo]}
                  onPress={() => setTargetScope('all')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tipoTexto, targetScope === 'all' && styles.tipoTextoActivo]}>Todos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoBadge, targetScope === 'latest' && styles.tipoBadgeActivo, !latestVersion && { opacity: 0.5 }]}
                  onPress={() => latestVersion && setTargetScope('latest')}
                  activeOpacity={0.7}
                  disabled={!latestVersion}
                >
                  <Text style={[styles.tipoTexto, targetScope === 'latest' && styles.tipoTextoActivo]}>
                    Ultima version{latestVersion ? ` (V${latestVersion.version_name || latestVersion.version_code})` : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoBadge, targetScope === 'previous' && styles.tipoBadgeActivo, !latestVersion && { opacity: 0.5 }]}
                  onPress={() => latestVersion && setTargetScope('previous')}
                  activeOpacity={0.7}
                  disabled={!latestVersion}
                >
                  <Text style={[styles.tipoTexto, targetScope === 'previous' && styles.tipoTextoActivo]}>
                    Versiones anteriores{latestVersion ? ` (< V${latestVersion.version_name || latestVersion.version_code})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {tipo === 'Imagen' && (
            <View style={styles.imagenUrlContainer}>
              <Text style={styles.label}>Enlace de la Imagen (URL)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://ejemplo.com/flyer.jpg"
                value={imagenUrl}
                onChangeText={setImagenUrl}
                placeholderTextColor={COLORS.gray4}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          )}

          <Text style={styles.label}>Titulo principal</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Nueva version 2.0.1"
            value={titulo}
            onChangeText={setTitulo}
            placeholderTextColor={COLORS.gray4}
          />

          <Text style={styles.label}>Cuerpo del mensaje</Text>
          <TouchableOpacity
            style={styles.mensajePreview}
            onPress={() => setRichEditorVisible(true)}
            activeOpacity={0.7}
          >
            {mensaje ? (
              <Text style={styles.mensajeTexto} numberOfLines={4}>{mensaje}</Text>
            ) : (
              <Text style={styles.mensajePlaceholder}>Toca para escribir el mensaje...</Text>
            )}
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.labelSwitch}>Publicar inmediatamente</Text>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: COLORS.border, true: COLORS.green + '80' }}
              thumbColor={isActive ? COLORS.green : COLORS.gray4}
            />
          </View>

          {!isActive && (
            <View style={styles.dateContainer}>
              <Text style={styles.label}>Fecha programada</Text>
              <TouchableOpacity style={styles.datePickerBtn} onPress={() => setDatePickerVisible(true)}>
                <View style={styles.datePickerIcon}><SvgXml xml={CalendarIcon} /></View>
                <Text style={[styles.datePickerText, !fechaEnvio && { color: COLORS.gray4 }]}>
                  {formatFecha(fechaEnvio)}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btnAction, (!isFormValid || loading) && { opacity: 0.5, backgroundColor: COLORS.gray4 }]}
            onPress={enviar}
            disabled={!isFormValid || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnActionText}>Enviar Comunicado</Text>
            }
          </TouchableOpacity>
        </View>

      </ScrollView>

      <RichTextEditorModal
        visible={richEditorVisible}
        initialValue={mensaje}
        placeholder="Escribe el mensaje aqui... Selecciona texto y usa la toolbar para aplicar formato."
        onConfirm={(text) => {
          setMensaje(text);
          setRichEditorVisible(false);
        }}
        onCancel={() => setRichEditorVisible(false)}
      />

      <CustomDateTimePicker
        visible={datePickerVisible}
        onClose={() => setDatePickerVisible(false)}
        onConfirm={(date) => {
          setFechaEnvio(date);
          setDatePickerVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  titulo: { fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, textAlign: 'center', marginTop: 20, marginBottom: 4 },

  content: { padding: 20, paddingBottom: 60 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 20,
  },
  label: { fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.navy, marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.navy,
  },
  targetUserBox: {
    backgroundColor: '#FFF7ED',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F59E0B40',
  },
  targetUserTexto: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.navy,
    lineHeight: 18,
  },
  targetUserNombre: {
    fontFamily: FONTS.bodySemi,
  },
  segmentInfoBox: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.navy + '30',
  },
  segmentInfoTexto: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.navy,
    lineHeight: 18,
  },
  segmentContainer: { marginTop: 4 },
  imagenUrlContainer: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.green + '40',
  },
  mensajePreview: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 100,
    justifyContent: 'flex-start',
  },
  mensajeTexto: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.navy,
    lineHeight: 22,
  },
  mensajePlaceholder: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
  },
  tipoContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  tipoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tipoBadgeActivo: {
    backgroundColor: COLORS.green + '18',
    borderColor: COLORS.green,
  },
  tipoTexto: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.gray4 },
  tipoTextoActivo: { color: COLORS.green },
  
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.bg },
  labelSwitch: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy },
  
  dateContainer: { marginTop: 8 },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datePickerIcon: { marginRight: 10 },
  datePickerText: { fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.navy },

  btnAction: {
    backgroundColor: COLORS.green,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  btnActionText: { fontFamily: FONTS.headingBold, fontSize: 16, color: COLORS.white, letterSpacing: 0.5 },
});