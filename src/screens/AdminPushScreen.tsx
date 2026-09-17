import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, StatusBar, ScrollView, Switch, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { COLORS, FONTS } from '../theme';

const ANIMATION_ISO = require('../../assets/iso.json');

// Debe coincidir EXACTO con el enum public.tipo_comunicado en la base de datos.
const TIPOS_COMUNICADO = [
  '¡Nuevas actualizaciones!',
  'Aviso Importante',
  'Problemas Conocidos / Mejoras',
  'Saludos / Festividades (Otros)'
];

export default function AdminPushScreen() {
  const navigation = useNavigation();
  const { showAlert } = useCustomAlert();

  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tipo, setTipo] = useState(TIPOS_COMUNICADO[0]);
  const [isActive, setIsActive] = useState(true);
  const [fechaEnvio, setFechaEnvio] = useState('');
  
  const [loading, setLoading] = useState(false);

  const enviar = async () => {
    if (!titulo.trim() || !mensaje.trim()) {
      showAlert('Error', 'El título y mensaje son obligatorios.');
      return;
    }

    if (!isActive && !fechaEnvio) {
      showAlert('Error', 'Para programar un comunicado debes indicar una fecha y hora.');
      return;
    }

    showAlert(
      'Confirmar',
      `¿Enviar este comunicado a todos los usuarios?`,
      [
        { text: 'NO', style: 'cancel' },
        { 
          text: 'SÍ',
          onPress: async () => {
            setLoading(true);
            try {
              // La tabla real es "app_comunicados" (no "comunicados"), y sus columnas
              // son tipo/titulo/contenido/imagen_url/is_active/created_at.
              // No existe una columna de "fecha programada": usamos created_at como
              // fecha efectiva de publicación (hoy si es inmediato, o la fecha elegida
              // si se programó), y app_comunicados solo se marca visible cuando esa
              // fecha ya se cumplió (ver useComunicados.ts).
              const bodyInsert = {
                tipo,
                titulo: titulo.trim(),
                contenido: mensaje.trim(),
                is_active: true,
                created_at: isActive ? new Date().toISOString() : fechaEnvio
              };

              const { error } = await supabase.from('app_comunicados').insert([bodyInsert]);
              if (error) throw error;
              
              showAlert('Éxito', 'Comunicado creado correctamente.');
              navigation.goBack();
            } catch (err: any) {
              showAlert('Error', err.message || 'No se pudo crear el comunicado.');
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
      <Text style={styles.titulo}>Nuevo Comunicado</Text>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        <View style={styles.card}>
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

          <Text style={styles.label}>Título principal</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Nueva versión 2.0.1"
            value={titulo}
            onChangeText={setTitulo}
            placeholderTextColor={COLORS.gray4}
          />

          <Text style={styles.label}>Cuerpo del mensaje</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            placeholder="Escribe el mensaje aquí..."
            value={mensaje}
            onChangeText={setMensaje}
            multiline
            placeholderTextColor={COLORS.gray4}
          />

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
            <>
              <Text style={styles.label}>Programar para (ISO 8601)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-10-15T14:30:00Z"
                value={fechaEnvio}
                onChangeText={setFechaEnvio}
                placeholderTextColor={COLORS.gray4}
              />
            </>
          )}

          <TouchableOpacity style={[styles.btnAction, loading && { opacity: 0.7 }]} onPress={enviar} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnActionText}>Enviar Comunicado</Text>}
          </TouchableOpacity>
        </View>

      </ScrollView>
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
  
  btnAction: {
    backgroundColor: COLORS.green,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  btnActionText: { fontFamily: FONTS.headingBold, fontSize: 16, color: COLORS.white, letterSpacing: 0.5 },
});
