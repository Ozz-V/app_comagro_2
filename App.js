// Build Trigger: Restauración versión estable 30-Abril
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Animated, Easing } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  useFonts,
  BarlowCondensed_400Regular,
  BarlowCondensed_700Bold,
  BarlowCondensed_900Black,
} from '@expo-google-fonts/barlow-condensed';
import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
} from '@expo-google-fonts/barlow';

import { supabase } from './src/supabase';
import { COLORS } from './src/theme';
import * as Linking from 'expo-linking';
import LottieView from 'lottie-react-native';

import LoginScreen    from './src/screens/LoginScreen';
import PortalScreen   from './src/screens/PortalScreen';
import CatalogosScreen from './src/screens/CatalogosScreen';
import FichasScreen   from './src/screens/FichasScreen';
import ProductosScreen from './src/screens/ProductosScreen';
import ConfigScreen   from './src/screens/ConfigScreen';
import LottieSplashScreen from './src/screens/LottieSplashScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(undefined);
  const [showLottie, setShowLottie] = useState(true);

  // --- SISTEMA DE ACTUALIZACIÓN ---
  const [updateState, setUpdateState] = useState('idle'); // idle | checking | downloading | ready | none
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateNotes, setUpdateNotes] = useState('');
  const [apkLocalUri, setApkLocalUri] = useState(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const [fontsLoaded] = useFonts({
    BarlowCondensed_400Regular,
    BarlowCondensed_700Bold,
    BarlowCondensed_900Black,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
  });

  // Animación de spin para el logo
  useEffect(() => {
    if (updateState === 'checking' || updateState === 'downloading') {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [updateState]);

  useEffect(() => {
    // Carga sesión inicial
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    // Escucha cambios de sesión en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });

    async function procesarUrl(url) {
      if (!url) return;
      try {
        if (url.includes('access_token=') && url.includes('refresh_token=')) {
          const qs = url.split('#')[1] || url.split('?')[1];
          if (!qs) return;
          const params = qs.split('&').reduce((acc, curr) => {
            const [k, v] = curr.split('=');
            acc[k] = v;
            return acc;
          }, {});
          
          if (params.access_token && params.refresh_token) {
            Alert.alert("Link Recibido", "Iniciando sesión segura...", [
              {
                text: "Aceptar",
                onPress: async () => {
                  try {
                    await supabase.auth.setSession({
                      access_token: params.access_token,
                      refresh_token: params.refresh_token
                    });
                  } catch (err) {
                    Alert.alert("Error Supabase", err.message);
                  }
                }
              }
            ]);
          }
        } else if (url.includes('error=')) {
           Alert.alert("Error en el Link", "El enlace ya fue usado o expiró.");
        }
      } catch (e) {
        Alert.alert("Error URL", e.message);
      }
    }

    // Escucha URLs entrantes (Deep Linking de Magic Links)
    const sub = Linking.addEventListener('url', (event) => {
      setTimeout(() => {
        procesarUrl(event.url);
      }, 800);
    });

    // Procesa URL inicial si la app estaba cerrada
    Linking.getInitialURL().then((url) => {
      setTimeout(() => {
        procesarUrl(url);
      }, 800);
    });

    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  // --- COMPROBADOR DE ACTUALIZACIONES: solo después de autenticarse ---
  useEffect(() => {
    const authed = !!(session && session.user?.email?.endsWith('@comagro.com.py'));
    if (authed) {
      checkUpdate();
    } else {
      // Si no está autenticado, no hacer nada con updates
      setUpdateState('none');
    }
  }, [session]);

  async function checkUpdate() {
    setUpdateState('checking');
    try {
      const { data, error } = await supabase
        .from('version_apk')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data && data.version_code) {
        // Comparación NUMÉRICA: solo actualiza si Supabase tiene un código MAYOR
        const installedCode = Constants.expoConfig?.android?.versionCode || 1;
        if (data.version_code > installedCode) {
          setUpdateNotes(data.release_notes || 'Nueva versión disponible');
          // Iniciar descarga automática
          await downloadUpdate(data.download_url);
        } else {
          // Versión igual o inferior → entrar normal
          setUpdateState('none');
        }
      } else {
        setUpdateState('none');
      }
    } catch (err) {
      console.log('Error checkUpdate:', err);
      setUpdateState('none');
    }
  }

  async function downloadUpdate(url) {
    Alert.alert(
      '🆕 Actualización disponible',
      `${updateNotes || 'Nueva versión disponible'}\n\n¿Descargar e instalar ahora?`,
      [
        { text: 'Más tarde', style: 'cancel', onPress: () => setUpdateState('none') },
        {
          text: '⬇️ Descargar',
          onPress: async () => {
            setUpdateState('downloading');
            try {
              // Resolver la redirección de GitHub sin descargar el archivo a la memoria (OOM)
              const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
              const finalUrl = res.url || url;

              const fileUri = `${FileSystem.documentDirectory}comagro_update.apk`;
              const downloadResumable = FileSystem.createDownloadResumable(
                finalUrl,
                fileUri,
                {},
                (downloadProgress) => {
                  const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                  setDownloadProgress(progress);
                }
              );

              const { uri } = await downloadResumable.downloadAsync();
              setApkLocalUri(uri);
              setUpdateState('ready');
            } catch (err) {
              console.log('Error de descarga:', err);
              Alert.alert('Error', 'Fallo al descargar la actualización.');
              setUpdateState('none');
            }
          }
        }
      ]
    );
  }

  async function installUpdate() {
    if (!apkLocalUri) return;
    try {
      // Usar expo-intent-launcher para lanzar el instalador de Android directamente
      const contentUri = await FileSystem.getContentUriAsync(apkLocalUri);
      await require('expo-intent-launcher').startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
    } catch (err) {
      console.log('Error instalando:', err);
      // Fallback a Sharing si IntentLauncher falla por permisos en algún dispositivo muy viejo
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(apkLocalUri, {
            mimeType: 'application/vnd.android.package-archive',
            dialogTitle: 'Instalar actualización Comagro',
          });
        }
      } catch (err2) {
        Alert.alert('Error', 'No se pudo abrir el instalador. Intentá de nuevo.');
      }
    }
  }

  // Splash nativo si todavía ni siquiera carga React o las fuentes
  // IMPORTANTE: Retornar fondo blanco para evitar parpadeo gris/negro
  if (!fontsLoaded || session === undefined) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // --- YA NO hay pantalla de actualización separada ---
  // Todo se maneja dentro del LottieSplashScreen

  const autenticado = !!(session && session.user?.email?.endsWith('@comagro.com.py'));

  return (
    <>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#FFFFFF' } }}>
          {!autenticado ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Portal"    component={PortalScreen} />
              <Stack.Screen name="Catalogos" component={CatalogosScreen} />
              <Stack.Screen name="Fichas"    component={FichasScreen} />
              <Stack.Screen name="Productos" component={ProductosScreen} />
              <Stack.Screen name="Config"    component={ConfigScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      
      {/* Superposición del Lottie Splash — maneja checking, descarga e instalación */}
      {showLottie && (
        <LottieSplashScreen
          onFinish={() => setShowLottie(false)}
          updateState={updateState}
          downloadProgress={downloadProgress}
          onInstall={installUpdate}
        />
      )}
    </>
  );
}
