// Build Trigger: Restauración versión estable 30-Abril
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Animated, Easing } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { OfflineSyncProvider } from './src/contexts/OfflineSyncContext';
import { CustomAlertProvider } from './src/contexts/CustomAlertContext';
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
import JailMonkey from 'jail-monkey';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen    from './src/screens/LoginScreen';
import PortalScreen   from './src/screens/PortalScreen';
import CatalogosScreen from './src/screens/CatalogosScreen';
import FichasScreen   from './src/screens/FichasScreen';
import ProductosScreen from './src/screens/ProductosScreen';
import ConfigScreen   from './src/screens/ConfigScreen';
import ChatScreen from './src/screens/ChatScreen';
import LottieSplashScreen from './src/screens/LottieSplashScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FFFFFF',
  },
};

export default function AppWrapper() {
  const [isRooted, setIsRooted] = useState(false);

  useEffect(() => {
    if (JailMonkey.isJailBroken()) {
      setIsRooted(true);
    }
  }, []);

  if (isRooted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#D32F2F', marginBottom: 12, textAlign: 'center' }}>
          Seguridad Comprometida
        </Text>
        <Text style={{ fontSize: 16, color: '#333333', textAlign: 'center' }}>
          Esta aplicación no puede ejecutarse en dispositivos rooteados o modificados (Jailbreak). Por favor, utilice un dispositivo seguro.
        </Text>
      </View>
    );
  }

  return (
    <CustomAlertProvider>
      <App />
    </CustomAlertProvider>
  );
}

function App() {
  const [session, setSession] = useState(undefined);
  const [isOfflineLoggedIn, setIsOfflineLoggedIn] = useState(false);
  const [offlineAuthChecked, setOfflineAuthChecked] = useState(false);
  const [showLottie, setShowLottie] = useState(true);

  // --- SISTEMA DE ACTUALIZACIÓN ---
  const [updateState, setUpdateState] = useState('idle'); // idle | checking | prompt | downloading | ready | none
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateNotes, setUpdateNotes] = useState('');
  const [updateUrl, setUpdateUrl] = useState(null);
  const [expectedHash, setExpectedHash] = useState(null);
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

  const { showAlert } = require('./src/contexts/CustomAlertContext').useCustomAlert();

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
    // Verificar login local (para modo offline) — esto es rápido (ms)
    import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
      AsyncStorage.getItem('@is_logged_in').then(val => {
        if (val === 'true') setIsOfflineLoggedIn(true);
        setOfflineAuthChecked(true); // ya sabemos el estado local, no esperamos más a Supabase
      });
    });

    // Carga sesión inicial
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session) {
        import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
          AsyncStorage.setItem('@is_logged_in', 'true');
        });
      }
    });

    // Escucha cambios de sesión en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess ?? null);
      if (sess) {
        import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
          AsyncStorage.setItem('@is_logged_in', 'true');
          setIsOfflineLoggedIn(true);
        });
      }
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
            showAlert("Link Recibido", "Iniciando sesión segura...", [
              {
                text: "Aceptar",
                onPress: async () => {
                  try {
                    await supabase.auth.setSession({
                      access_token: params.access_token,
                      refresh_token: params.refresh_token
                    });
                  } catch (err) {
                    showAlert("Error", err.message);
                  }
                }
              }
            ]);
          }
        } else if (url.includes('error=')) {
           showAlert("Error en el Link", "El enlace ya fue usado o expiró.");
        }
      } catch (e) {
        showAlert("Error URL", e.message);
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

  // --- COMPROBADOR DE ACTUALIZACIONES: Inicia automáticamente sin importar el Login ---
  useEffect(() => {
    checkUpdate();
  }, []);



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
        // ✅ FIX: usar expo-application para leer el versionCode real de la APK instalada.
        // Constants.expoConfig.android.versionCode es undefined en APKs compiladas con EAS.
        const installedCode = Application.nativeBuildVersion
          ? parseInt(Application.nativeBuildVersion, 10)
          : (Constants.expoConfig?.android?.versionCode || 1);
        if (data.version_code > installedCode) {
          setUpdateNotes(data.release_notes || 'Nueva versión disponible');
          setUpdateUrl(data.download_url);
          setExpectedHash(data.md5_hash || data.sha256_hash || null);
          setUpdateState('prompt');
        } else {
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

  async function startDownloadUpdate() {
    setUpdateState('downloading');
    setDownloadProgress(0);
    setApkLocalUri(null);

    try {
      const fileUri = `${FileSystem.documentDirectory}comagro_update.apk`;

      const downloadOptions = {
        headers: {
          'User-Agent': 'ComagroApp/1.0 (Android)',
          'Accept': 'application/octet-stream, */*',
        },
      };

      let downloadResumable;
      try {
        downloadResumable = FileSystem.createDownloadResumable(
          updateUrl,
          fileUri,
          downloadOptions,
          (dp) => {
            const written = dp.totalBytesWritten ?? 0;
            const expected = dp.totalBytesExpectedToWrite ?? 0;
            const progress = expected > 0 ? written / expected : 0;
            setDownloadProgress(progress);
          }
        );
      } catch (createErr) {
        throw createErr;
      }

      let result;
      try {
        result = await downloadResumable.downloadAsync();
      } catch (downloadErr) {
        throw downloadErr;
      }

      if (result && result.uri && result.status === 200) {
        const headers = result.headers || {};
        const contentType = String(headers['content-type'] || headers['Content-Type'] || '');
        if (contentType.toLowerCase().includes('text/html')) {
          throw new Error(`La descarga no parece ser una APK. Content-Type=${contentType}`);
        }

        // VALIDACIÓN DE HASH ESTRICTA CON FALLBACK TEMPORAL
        const hasSha256 = !!updateNotes.sha256_hash;
        const hasMd5 = !!updateNotes.md5_hash;

        if (hasSha256) {
          // 1. Verificación Fuerte SHA-256
          const ReactNativeBlobUtil = require('react-native-blob-util').default;
          const nativePath = result.uri.startsWith('file://') ? result.uri.replace('file://', '') : result.uri;
          const calculatedSha256 = await ReactNativeBlobUtil.fs.hash(nativePath, 'sha256');
          
          if (calculatedSha256.toLowerCase() !== updateNotes.sha256_hash.toLowerCase()) {
            await FileSystem.deleteAsync(result.uri, { idempotent: true });
            throw new Error('Firma de seguridad SHA-256 inválida. Descarga abortada por seguridad.');
          }
        } else if (hasMd5) {
          // 2. Transición Legacy MD5 (DEPRECACIÓN: 17 Julio 2026)
          console.warn("ALERTA DE SEGURIDAD: Uso de verificación MD5 en transición. Migrar BD a SHA-256 antes del 17-Jul-2026.");
          const fileInfo = await FileSystem.getInfoAsync(result.uri, { md5: true });
          
          if (fileInfo.md5.toLowerCase() !== updateNotes.md5_hash.toLowerCase()) {
            await FileSystem.deleteAsync(result.uri, { idempotent: true });
            throw new Error('Firma MD5 inválida. Descarga abortada.');
          }
        } else {
          // 3. Bloqueo Incondicional (NO HASH)
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
          throw new Error('ALERTA DE SEGURIDAD CRÍTICA: El servidor no proporcionó firma de integridad (Hash). Instalación bloqueada para prevenir inyección de código.');
        }

        setApkLocalUri(result.uri);
        setUpdateState('ready');
        return;
      } else {
        throw new Error('Error al descargar la actualización. Intentá de nuevo.');
      }

    } catch (err) {

      showAlert(
        'Error de descarga',
        `Fallo al descargar la actualización.\n\nDetalle: ${err?.message || 'Error desconocido'}\n\nRevisá los logs de Logcat para más información.`
      );
      setUpdateState('none');
    }
  }

  async function installUpdate() {
    if (!apkLocalUri) return;
    try {
      console.log('[OTA] install apkLocalUri:', apkLocalUri);

      let contentUri;
      try {
        contentUri = await FileSystem.getContentUriAsync(apkLocalUri);
        console.log('[OTA] getContentUriAsync OK:', contentUri);
      } catch (uriErr) {
        const pkg = Constants.expoConfig?.android?.package || 'com.comagro.catalogo';
        contentUri = `content://${pkg}.FileSystemFileProvider/expo_files/comagro_update.apk`;
        console.log('[OTA] getContentUriAsync falló, usando URI manual:', contentUri, uriErr?.message);
      }

      await require('expo-intent-launcher').startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
    } catch (err) {
      console.log('[OTA] Error instalando:', err?.message, err);
      showAlert(
        'No se pudo instalar',
        'El instalador no pudo abrirse automáticamente.\n\nTip: buscá el archivo "comagro_update.apk" en el almacenamiento del dispositivo e instalalo manualmente.',
        [{ text: 'OK' }]
      );
    }
  }

  if (!fontsLoaded || (!offlineAuthChecked && session === undefined)) {
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

  const autenticado = !!((session || isOfflineLoggedIn) && (session?.user?.email?.endsWith('@comagro.com.py') || isOfflineLoggedIn));

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <OfflineSyncProvider>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator 
            screenOptions={{ 
              headerShown: false, 
              animation: 'slide_from_right', 
              contentStyle: { backgroundColor: '#FFFFFF' } 
            }}
            detachInactiveScreens={false}
          >
            {!autenticado ? (
              <Stack.Screen name="Login" component={LoginScreen} />
            ) : (
              <>
                <Stack.Screen name="Portal"    component={PortalScreen} />
                <Stack.Screen name="Catalogos" component={CatalogosScreen} />
                <Stack.Screen name="Fichas"    component={FichasScreen} />
                <Stack.Screen name="Productos" component={ProductosScreen} />
                <Stack.Screen name="Config"    component={ConfigScreen} />
                <Stack.Screen name="ChatScreen" component={ChatScreen} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
        
        {showLottie && (
          <LottieSplashScreen
            onFinish={() => setShowLottie(false)}
            updateState={updateState}
            updateNotes={updateNotes}
            downloadProgress={downloadProgress}
            onAccept={startDownloadUpdate}
            onDecline={() => setUpdateState('none')}
            onInstall={installUpdate}
          />
        )}
      </OfflineSyncProvider>
    </SafeAreaProvider>
  );
}

