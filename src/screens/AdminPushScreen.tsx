import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, StatusBar, ScrollView, Switch, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabase';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { COLORS, FONTS } from '../theme';

const TIPOS_COMUNICADO = [
  '¡Nuevas actualizaciones!',
  'Aviso Importante',
  'Problemas Conocidos / Mejoras',
  'Saludos / Festividades (Otros)',
  'Imagen'
];

export default function AdminPushScreen() {
  const navigation = useNavigation();
  const { showAlert } = useCustomAlert();

  const [tipo, setTipo] = useState(TIPOS_COMUNICADO[1]);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  // Fecha programada como string — sin deps externas. Ej: "2026-09-20T10:00"
  const [scheduledDateStr, setScheduledDateStr] = useState('');
  const [loading, setLoading] = useState(false);

  const saveComunicado = () => {
    if (!titulo.trim() || !contenido.trim()) {
      showAlert('Campos requeridos', 'El título y el contenido son obligatorios para publicar un comunicado.');
      return;
    }

    if (!isActive && !scheduledDateStr.trim()) {
      showAlert('Fecha requerida', 'Ingresá la fecha y hora de publicación. Ejemplo: 2026-09-25T09:00');
      return;
    }

    const scheduledLabel = isActive
      ? 'Se publicará de inmediato.'
      : `Programado para: ${scheduledDateStr}`;

    showAlert(
      'Confirmar publicación',
      `¿Guardar este comunicado global?\n\n${scheduledLabel}`,
      [
        { text: 'Cancelar' },
        {
          text: 'Publicar',
          onPress: async () => {
            setLoading(true);
            let parsedDate: string | null = null;
            if (!isActive && scheduledDateStr.trim()) {
              const d = new Date(scheduledDateStr.trim());
              parsedDate = isNaN(d.getTime()) ? null : d.toISOString();
            }

            const { error } = await supabase.from('app_comunicados').insert([{
              tipo_comunicado: tipo,
              titulo: titulo.trim(),
              contenido: contenido.trim(),
              imagen_url: imagenUrl.trim() || null,
              is_active: isActive,
              scheduled_at: parsedDate,
            }]);
            setLoading(false);
            if (error) {
              showAlert('Error al publicar', error.message);
            } else {
              showAlert('¡Publicado!', 'El comunicado fue guardado correctamente en la plataforma.');
              setTitulo('');
              setContenido('');
              setImagenUrl('');
              setIsActive(true);
              setScheduledDateStr('');
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
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Cerrar</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Nuevo Comunicado</Text>
        <View style={{ width: 80 }} />
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.helper}>
          Inserta un aviso global en la plataforma. Los usuarios lo verán al abrir la app.
        </Text>

        <Text style={styles.label}>Tipo de Comunicado</Text>
        <View style={styles.pills}>
          {TIPOS_COMUNICADO.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.pill, tipo === t && styles.pillActive]}
              onPress={() => setTipo(t)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, tipo === t && styles.pillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Nueva lista de precios disponible..."
          placeholderTextColor={COLORS.gray4}
          value={titulo}
          onChangeText={setTitulo}
        />

        <Text style={styles.label}>Contenido / Mensaje</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Escribe el cuerpo del comunicado..."
          placeholderTextColor={COLORS.gray4}
          value={contenido}
          onChangeText={setContenido}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>URL de Imagen (Opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="https://ejemplo.com/imagen.jpg"
          placeholderTextColor={COLORS.gray4}
          value={imagenUrl}
          onChangeText={setImagenUrl}
          autoCapitalize="none"
          keyboardType="url"
        />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Publicar inmediatamente</Text>
            <Text style={styles.switchDesc}>
              {isActive ? 'Activo y visible al instante.' : 'Se programará para una fecha específica.'}
            </Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: COLORS.navy, false: COLORS.gray5 }}
            thumbColor={COLORS.white}
          />
        </View>

        {/* Campo de fecha — solo visible cuando NO es inmediato */}
        {!isActive && (
          <View style={styles.dateSection}>
            <Text style={styles.label}>Fecha y Hora Programada</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DDTHH:MM  (ej: 2026-09-25T09:00)"
              placeholderTextColor={COLORS.gray4}
              value={scheduledDateStr}
              onChangeText={setScheduledDateStr}
              keyboardType="default"
              autoCapitalize="none"
            />
            <Text style={styles.dateHint}>
              Formato ISO: Año-Mes-DíaTHora:Minutos. Ejemplo: 2026-09-25T09:00
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.sendBtn} onPress={saveComunicado} disabled={loading} activeOpacity={0.8}>
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.sendBtnText}>Guardar y Publicar</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  topTitle: { fontFamily: FONTS.headingBold, fontSize: 22, color: COLORS.navy, textTransform: 'uppercase' },
  backBtn: { width: 80 },
  backBtnText: { fontFamily: FONTS.bodySemi, fontSize: 16, color: COLORS.green },
  content: { padding: 16, paddingBottom: 48 },
  helper: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, marginBottom: 20 },
  label: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.gray3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: FONTS.body,
    color: COLORS.gray1,
    backgroundColor: COLORS.white,
    marginBottom: 16,
  },
  textArea: { height: 110, marginBottom: 16 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  pillActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  pillText: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.gray3 },
  pillTextActive: { color: COLORS.white },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginBottom: 8,
  },
  switchDesc: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginTop: 2 },
  dateSection: { marginBottom: 16 },
  dateHint: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4, marginTop: -10, marginBottom: 16 },
  sendBtn: {
    backgroundColor: COLORS.navy,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  sendBtnText: { fontFamily: FONTS.bodySemi, fontSize: 15, color: COLORS.white, textTransform: 'uppercase', letterSpacing: 1 },
});
