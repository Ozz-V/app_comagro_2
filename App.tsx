// Build Trigger: Restauración versión estable 30-Abril
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { OfflineSyncProvider } from './src/contexts/OfflineSyncContext';
import { CustomAlertProvider } from './src/contexts/CustomAlertContext';
import { useOTAUpdate } from './src/hooks/useOTAUpdate';
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

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/queryClient';
import { supabase } from './src/supabase';
import { useAuthStore } from './src/store/useAuthStore';
import { COLORS } from './src/theme';
import * as Linking from 'expo-linking';
import LottieView from 'lottie-react-native';
import * as Device from 'expo-device';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen    from './src/screens/LoginScreen';
import PortalScreen   from './src/screens/PortalScreen';
import CatalogosScreen from './src/screens/CatalogosScreen';
import FichasScreen   from './src/screens/FichasScreen';
import ProductosScreen from './src/screens/ProductosScreen';
import ConfigScreen   from './src/screens/ConfigScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProductViewerScreen from './src/screens/ProductViewerScreen';
import LottieSplashScreen from './src/screens/LottieSplashScreen';
import CompleteProfileScreen from './src/screens/CompleteProfileScreen';
import { registerForPushNotificationsAsync } from './src/utils/pushNotifications';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import CalculadoraModal from './src/components/CalculadoraModal';

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
    async function checkRoot() {
      try {
        const rooted = await Device.isRootedExperimentalAsync();
        if (rooted) {
          setIsRooted(true);
        }
      } catch (e) {
        // Ignorar error si Device.isRooted falla
      }
    }
    checkRoot();
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
    <QueryClientProvider client={queryClient}>
      <CustomAlertProvider>
        <App />
      </CustomAlertProvider>
    </QueryClientProvider>
  );
}

function App() {
  const { session, isAuthenticated, isInitialized, setAuth, clearAuth } = useAuthStore();
  const [showLottie, setShowLottie] = useState(true);
  const [profileComplete, setProfileComplete] = useState(true); // Inicialmente true para no bloquear la pantalla inicial
  
  // --- SISTEMA DE ACTUALIZACIÓN ---
  const { updateState, downloadProgress, updateNotes, setUpdateState, startDownloadUpdate, installUpdate, checkUpdate } = useOTAUpdate();

  // --- COMPROBADOR DE ACTUALIZACIONES: Inicia automáticamente sin importar el Login ---
  useEffect(() => {
    checkUpdate();
  }, []);

  const [fontsLoaded] = useFonts({
    BarlowCondensed_400Regular,
    BarlowCondensed_700Bold,
    BarlowCondensed_900Black,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
  });

  const { showAlert } = require('./src/contexts/CustomAlertContext').useCustomAlert();

  useEffect(() => {
    const defaultErrorHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
    if ((global as any).ErrorUtils) {
      (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
        console.log('Error Global (Crash):', error);
        showAlert(
          'Fallo del Sistema',
          `Ocurrió un error inesperado${isFatal ? ' fatal' : ''}.\n\nDetalle: ${error?.message || 'Desconocido'}\n\nEl sistema bloqueó el cierre forzoso, pero recomendamos reiniciar la app.`
        );
      });
    }
    return () => {
      if ((global as any).ErrorUtils && defaultErrorHandler) {
        (global as any).ErrorUtils.setGlobalHandler(defaultErrorHandler);
      }
    };
  }, [showAlert]);

  useEffect(() => {
    async function registerAndSaveToken(userId: string) {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await supabase.from('profiles').upsert({ id: userId, expo_push_token: token }, { onConflict: 'id' });
        }
      } catch(e) {
        console.log('Error registerAndSaveToken', e);
      }
    }

    async function checkProfile(userId: string) {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const cached = await AsyncStorage.getItem('@user_profile_cache');
        if (cached) {
          const data = JSON.parse(cached);
          if (data.full_name && data.full_name !== 'EMPTY' && data.telefono && data.telefono !== '+595' && data.telefono.length > 5) {
            setProfileComplete(true);
            return;
          }
        }
        const { data } = await supabase.from('profiles').select('full_name, telefono').eq('id', userId).single();
        if (data && data.full_name && data.full_name !== 'EMPTY' && data.telefono && data.telefono !== '+595' && data.telefono.length > 5) {
          setProfileComplete(true);
        } else {
          setProfileComplete(false);
        }
      } catch(e) {
        // Si falla (ej. sin internet), no podemos bloquear el acceso offline. Lo dejamos pasar.
        setProfileComplete(true);
      }
    }

    // Carga sesión inicial
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuth(data.session);
        registerAndSaveToken(data.session.user.id);
        checkProfile(data.session.user.id);
      } else {
        clearAuth();
        setProfileComplete(true);
        queryClient.clear();
      }
    });

    // Escucha cambios de sesión en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, sess: any) => {
      if (sess) {
        setAuth(sess);
        registerAndSaveToken(sess.user.id);
        checkProfile(sess.user.id);
      } else {
        clearAuth();
        setProfileComplete(true);
        queryClient.clear();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    const subProfile = DeviceEventEmitter.addListener('PROFILE_COMPLETED', () => {
      setProfileComplete(true);
    });
    const subOta = DeviceEventEmitter.addListener('TRIGGER_OTA_UPDATE', (payload: any) => {
      setShowLottie(true);
      checkUpdate(payload?.directDownload);
    });
    return () => {
      subProfile.remove();
      subOta.remove();
    };
  }, []);
  if (!fontsLoaded || !isInitialized) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />; // Evita parpadeo negro en lugar de return null
  }

  const autenticado = !!(isAuthenticated && (session?.user?.email?.endsWith('@comagro.com.py')));
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <OfflineSyncProvider>
        <ErrorBoundary>
          <NavigationContainer theme={navTheme}>
            <Stack.Navigator 
              screenOptions={{ 
                headerShown: false, 
                animation: 'slide_from_right', 
                contentStyle: { backgroundColor: '#FFFFFF' } 
              }}
              // @ts-ignore
              detachInactiveScreens={false}
            >
              {!autenticado ? (
                <Stack.Screen name="Login" component={LoginScreen} />
              ) : !profileComplete ? (
                <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
              ) : (
                <>
                  <Stack.Screen name="Portal"    component={PortalScreen} />
                  <Stack.Screen name="Catalogos" component={CatalogosScreen} />
                  <Stack.Screen name="Fichas"    component={FichasScreen} />
                  <Stack.Screen name="Productos" component={ProductosScreen} />
                  <Stack.Screen name="Config"    component={ConfigScreen} />
                  <Stack.Screen name="ChatScreen" component={ChatScreen} />
                  <Stack.Screen 
                    name="ProductViewer" 
                    component={ProductViewerScreen} 
                    options={{ 
                      presentation: 'transparentModal', 
                      animation: 'none',
                      contentStyle: { backgroundColor: 'transparent' }
                    }} 
                  />
                  <Stack.Screen 
                    name="Calculadora" 
                    component={CalculadoraModal} 
                    options={{ 
                      presentation: 'transparentModal', 
                      animation: 'none',
                      contentStyle: { backgroundColor: 'transparent' }
                    }} 
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </ErrorBoundary>
        
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

