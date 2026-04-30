import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Image, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import LottieView from 'lottie-react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';

const LOGO = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };

export default function LoginScreen() {
  const [email, setEmail]   = useState('');
  const [code, setCode]     = useState('');
  const [step, setStep]     = useState(1); // 1 = correo, 2 = código OTP, 3 = PIN super user
  const [status, setStatus] = useState({ msg: '', color: COLORS.navy });
  const [loading, setLoading] = useState(false);
  const [isSuperUser, setIsSuperUser] = useState(false);

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
    setStatus({ msg: 'Verificando acceso…', color: COLORS.navy });

    // Verificar si es super usuario (tiene PIN fijo)
    try {
      const { data: superData } = await supabase
        .from('super_users')
        .select('email')
        .eq('email', correo)
        .maybeSingle();

      if (superData) {
        // Es super user → pedir PIN fijo
        setIsSuperUser(true);
        setStep(3);
        setLoading(false);
        setStatus({ msg: 'Ingresá tu PIN de acceso.', color: COLORS.green });
        return;
      }
    } catch (e) {
      // Si la tabla no existe o falla, seguir con OTP normal
      console.log('super_users check:', e);
    }

    // No es super user → flujo OTP normal
    setIsSuperUser(false);
    setStatus({ msg: 'Enviando código…', color: COLORS.navy });

    const redirectUrl = Linking.createURL('/');

    const { error } = await supabase.auth.signInWithOtp({
      email: correo,
      options: { 
        shouldCreateUser: false,
        emailRedirectTo: redirectUrl,
      },
    });

    setLoading(false);

    if (error) {
      setStatus({ msg: 'No fue posible enviar el código. Intentá de nuevo.', color: 'red' });
      return;
    }

    setStep(2);
    setStatus({
      msg: 'Te enviamos un código de 6 dígitos al correo. Ingresalo abajo.',
      color: COLORS.green,
    });
  }

  async function verificar() {
    if (!code || code.length < 4) {
      setStatus({ msg: isSuperUser ? 'Ingresá tu PIN.' : 'Ingresá el código de 6 dígitos.', color: 'red' });
      return;
    }

    setLoading(true);
    setStatus({ msg: 'Verificando…', color: COLORS.navy });

    if (isSuperUser) {
      // Super user → login con contraseña (el PIN es la contraseña en Supabase Auth)
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: code.trim(),
      });

      setLoading(false);

      if (error) {
        setStatus({ msg: 'PIN incorrecto.', color: 'red' });
      }
      // Si no hay error, onAuthStateChange en App.js se encarga de la navegación
    } else {
      // Usuario normal → verificar OTP
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'email'
      });

      setLoading(false);

      if (error) {
        setStatus({ msg: 'Código incorrecto o expirado.', color: 'red' });
      }
    }
  }

  // Texto descriptivo según el paso
  const descTexto = step === 1
    ? <>Escribí tu correo <Text style={styles.bold}>@comagro.com.py</Text> y te enviaremos un código de acceso.</>
    : step === 3
      ? <>Ingresá el PIN de acceso para <Text style={styles.bold}>{email}</Text></>
      : <>Ingresá el código numérico de 6 dígitos que enviamos a <Text style={styles.bold}>{email}</Text></>;

  const botonTexto = step === 1 ? 'Continuar' : (isSuperUser ? 'Ingresar con PIN' : 'Verificar e Ingresar');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo Animado Lottie */}
        <LottieView
          source={require('../../assets/iso.json')}
          autoPlay
          loop={true}
          style={{ width: 160, height: 160, marginBottom: 10 }}
          resizeMode="contain"
        />

        {/* Título */}
        <Text style={styles.title}>Catálogos digitales{'\n'}Fichas técnicas</Text>
        <Text style={styles.subtitle}>
          Ingresá con tu correo corporativo para acceder.
        </Text>

        {/* Card login */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acceso</Text>
          <Text style={styles.cardDesc}>{descTexto}</Text>

          {step === 1 ? (
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
          ) : (
            <TextInput
              style={styles.inputCode}
              placeholder={isSuperUser ? '••••' : '000000'}
              placeholderTextColor={COLORS.gray4}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={isSuperUser ? 10 : 6}
              secureTextEntry={isSuperUser}
              editable={!loading}
              textAlign="center"
            />
          )}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={step === 1 ? enviar : verificar}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.btnText}>{botonTexto}</Text>
            }
          </TouchableOpacity>

          {(step === 2 || step === 3) && !loading && (
            <TouchableOpacity onPress={() => { setStep(1); setCode(''); setIsSuperUser(false); setStatus({msg:'', color: COLORS.navy}); }} style={{marginTop: 14}}>
              <Text style={{textAlign: 'center', color: COLORS.navy, textDecorationLine: 'underline', fontSize: 13, fontFamily: FONTS.body}}>
                Usar otro correo
              </Text>
            </TouchableOpacity>
          )}

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
  inputCode: {
    width: '100%',
    height: 54,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    fontFamily: FONTS.heading,
    fontSize: 24,
    letterSpacing: 4,
    color: COLORS.navy,
    marginBottom: 10,
    backgroundColor: COLORS.white,
    borderRadius: 8,
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
