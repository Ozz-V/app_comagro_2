import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Image, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';

const LOGO = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };

export default function LoginScreen() {
  const [email, setEmail]   = useState('');
  const [status, setStatus] = useState({ msg: '', color: COLORS.navy });
  const [loading, setLoading] = useState(false);

  function validarCorreo(c) {
    return /^[a-zA-Z0-9._%+-]+@comagro\.com\.py$/i.test(c.trim());
  }

  async function enviar() {
    const correo = email.trim().toLowerCase();

    if (!correo) {
      setStatus({ msg: 'Ingresá tu correo corporativo.', color: 'red' });
      return;
    }
    if (!validarCorreo(correo)) {
      setStatus({ msg: 'Solo se permiten correos @comagro.com.py', color: 'red' });
      return;
    }

    setLoading(true);
    setStatus({ msg: 'Enviando enlace…', color: COLORS.navy });

    const { error } = await supabase.auth.signInWithOtp({
      email: correo,
      options: { shouldCreateUser: false },
    });

    setLoading(false);

    if (error) {
      setStatus({ msg: 'No fue posible enviar el enlace. Intentá de nuevo.', color: 'red' });
      return;
    }

    setStatus({
      msg: 'Revisá tu correo corporativo y abrí el enlace de acceso.',
      color: COLORS.green,
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />

        {/* Título */}
        <Text style={styles.title}>Catálogos digitales{'\n'}Fichas técnicas</Text>
        <Text style={styles.subtitle}>
          Ingresá con tu correo corporativo para recibir un enlace de acceso.
        </Text>

        {/* Card login */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acceso</Text>
          <Text style={styles.cardDesc}>
            Escribí tu correo{' '}
            <Text style={styles.bold}>@comagro.com.py</Text>
            {' '}y te enviaremos un enlace para ingresar.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="correo@comagro.com.py"
            placeholderTextColor={COLORS.gray4}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={enviar}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.btnText}>Enviar enlace de acceso</Text>
            }
          </TouchableOpacity>

          {status.msg ? (
            <Text style={[styles.statusMsg, { color: status.color }]}>
              {status.msg}
            </Text>
          ) : null}

          <Text style={styles.note}>
            En este dispositivo, una vez que ingreses, la sesión quedará guardada.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.white },

  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: COLORS.white,
  },

  logo: {
    width: 160,
    height: 60,
    marginBottom: 24,
  },

  title: {
    fontFamily: FONTS.heading,
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.navy,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 10,
  },

  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },

  card: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    backgroundColor: COLORS.white,
  },

  cardTitle: {
    fontFamily: FONTS.heading,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: 10,
  },

  cardDesc: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },

  bold: { fontFamily: FONTS.bodySemi, color: COLORS.gray1 },

  input: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.navy,
    marginBottom: 10,
    backgroundColor: COLORS.white,
  },

  btn: {
    width: '100%',
    height: 44,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '700',
  },

  statusMsg: {
    fontFamily: FONTS.body,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },

  note: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
});
