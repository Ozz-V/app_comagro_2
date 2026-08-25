// Build Trigger: Restauración versión estable 30-Abril
import React, { useEffect, useState } from 'react';
import { View, Text, DeviceEventEmitter } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef, StackActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { OfflineSyncProvider } from './src/contexts/OfflineSyncContext';
import { CustomAlertProvider, useCustomAlert } from './src/contexts/CustomAlertContext';
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
import { supabase, SUPABASE_STORAGE_KEY } from './src/supabase';
import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from './src/store/useAuthStore';
import * as Device from 'expo-device';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen    from './src/screens/LoginScreen';
import PortalScreen   from './src/screens/PortalScreen';
import CatalogosScreen from './src/screens/CatalogosScreen';
import FichasScreen   from './src/screens/FichasScreen';
import ProductosScreen from './src/screens/ProductosScreen';
import ConfigScreen   from './src/screens/ConfigScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProductViewerScreen from './src/screens/ProductViewerScreen';
import UpdatedProductsScreen from './src/screens/UpdatedProductsScreen';
import LottieSplashScreen from './src/screens/LottieSplashScreen';
import CompleteProfileScreen from './src/screens/CompleteProfileScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import EstadisticasScreen from './src/screens/EstadisticasScreen';
import { registerForPushNotificationsAsync } from './src/utils/pushNotifications';
import { ErrorBoundary } from './src/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

type RootStackParamList = {
  Login: undefined;
  CompleteProfile: undefined;
  Portal: undefined;
  Catalogos: undefined;
  Fichas: undefined;
  Productos: undefined;
  Config: undefined;
  ChatScreen: undefined;
  Notificaciones: undefined;
  Estadisticas: undefined;
  ProductViewer: { sku?: string; contextSkus?: string[]; notificationId?: number };
  ProductosActualizados: { skus?: string[]; notificationId?: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FFFFFF',
  },
};

export default Sentry.wrap(AppWrapper);

function AppWrapper() {
  const [isRooted, setIsRooted] = useState(false);

  useEffect(() => {
    async function checkRoot() {
      try {
        const rooted = await Device.isRootedExperimentalAsync();
        if (rooted) {
          setIsRooted(true);
        }
      } catch (e) {
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
  const [profileComplete, setProfileComplete] = useState(true);

  const { updateState, downloadProgress, updateNotes, setUpdateState, startDownloadUpdate, installUpdate, checkUpdate } = useOTAUpdate();

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

  const { showAlert } = useCustomAlert();

  useEffect(() => {
    type ErrorHandler = (error: unknown, isFatal: boolean) => void;
    interface GlobalWithErrorUtils {
      ErrorUtils?: {
        getGlobalHandler?: () => ErrorHandler;
        setGlobalHandler: (handler: ErrorHandler) => void;
      };
    }
    const globalWithEU = global as unknown as GlobalWithErrorUtils;
    const defaultErrorHandler = globalWithEU.ErrorUtils?.getGlobalHandler?.();
    if (globalWithEU.ErrorUtils) {
      globalWithEU.ErrorUtils.setGlobalHandler((error: unknown, isFatal: boolean) => {
        showAlert(
          'Fallo del Sistema',
          `Ocurrió un error inesperado${isFatal ? ' fatal' : ''}.\n\nDetalle: ${(error as Error)?.message || 'Desconocido'}\n\nEl sistema bloqueó el cierre forzoso, pero recomendamos reiniciar la app.`
        );
      });
    }
    return () => {
      if (globalWithEU.ErrorUtils && defaultErrorHandler) {
        globalWithEU.ErrorUtils.setGlobalHandler(defaultErrorHandler);
      }
    };
  }, [showAlert]);

  // --- OYENTE DE NOTIFICACIONES PUSH ---
  // Dos problemas reales que este bloque soluciona:
  //  1) Android a veces vuelve a entregar el MISMO toque de notificación
  //     cuando la app vuelve a primer plano (p.ej. después de apretar
  //     "atrás"). Sin descartar duplicados, eso hacía que la app procesara
  //     el mismo toque de nuevo y navegara otra vez sola.
  //  2) navigationRef.navigate('Portal') podía, en ciertos casos, no
  //     colapsar del todo la pila si había pantallas duplicadas encima
  //     (ver fix en PortalScreen/NotificationsScreen contra doble-toque).
  //     Usar popToTop() es más robusto: sin importar cuántas pantallas haya
  //     apiladas, siempre vuelve a la única instancia de Portal.
  const handledNotificationIds = React.useRef(new Set<string>());

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleNotificationTap(data: any, notifId?: string | null) {
      if (!data) return;

      // Descarta re-entregas de un toque que ya procesamos.
      if (notifId) {
        if (handledNotificationIds.current.has(notifId)) return;
        handledNotificationIds.current.add(notifId);
        // Evita que este Set crezca sin límite en una sesión muy larga.
        if (handledNotificationIds.current.size > 50) {
          const first = handledNotificationIds.current.values().next().value;
          if (first) handledNotificationIds.current.delete(first);
        }
      }

      const tryNavigate = (callback: () => void, retries = 0) => {
        if (navigationRef.isReady()) {
          callback();
        } else if (retries < 10) {
          setTimeout(() => tryNavigate(callback, retries + 1), 300);
        }
      };

      if (
        data.type === 'forum_topic' ||
        data.type === 'forum_comment' ||
        data.type === 'new_products' ||
        data.type === 'plytix'
      ) {
        tryNavigate(() => {
          navigationRef.navigate('Notificaciones');
        });
      }

      // Marca la notificación como "ya consumida" del lado nativo — evita
      // que Android/expo-notifications la vuelvan a entregar más adelante
      // (p.ej. si la persona sale de la app con el botón atrás y regresa).
      Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    }

    // Caso: la app estaba CERRADA y se abrió tocando la notificación.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleNotificationTap(response.notification.request.content.data, response.notification.request.identifier);
    }).catch(() => {});

    // Caso: la app ya estaba abierta (foreground o background).
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationTap(response.notification.request.content.data, response.notification.request.identifier);
    });

    return () => {
      responseListener.remove();
    };
  }, []);

  useEffect(() => {
    async function registerAndSaveToken(userId: string) {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await supabase.from('profiles').upsert({ id: userId, expo_push_token: token }, { onConflict: 'id' });
        }
      } catch(e) {
        Sentry.captureException(e, { tags: { context: 'registerAndSaveToken' } });
      }
    }

    async function checkProfile(userId: string) {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const cached = await AsyncStorage.getItem('@user_profile_cache');
        if (cached) {
          const data = JSON.parse(cached);
          if (data.full_name && data.full_name.trim() !== '' && data.telefono && data.telefono.trim() !== '') {
            setProfileComplete(true);
            return;
          }
        }
        const { data, error } = await supabase.from('profiles').select('full_name, telefono').eq('id', userId).single();
        if (error) {
          setProfileComplete(true);
          return;
        }
        if (data && data.full_name && data.full_name.trim() !== '' && data.telefono && data.telefono.trim() !== '') {
          await AsyncStorage.setItem('@user_profile_cache', JSON.stringify(data));
          setProfileComplete(true);
        } else {
          setProfileComplete(false);
        }
      } catch(e) {
        setProfileComplete(true);
      }
    }

    async function rescueSessionFromCache(): Promise<boolean> {
      try {
        const cached = await SecureStore.getItemAsync(SUPABASE_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.user) {
            setAuth(parsed);
            checkProfile(parsed.user.id);
            return true;
          }
        }
      } catch (e) {
        Sentry.captureException(e);
      }
      return false;
    }

    async function loadInitialSession() {
      const rescued = await rescueSessionFromCache();
      if (rescued) {
        supabase.auth.getSession().catch(() => {});
        return;
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data.session) {
          setAuth(data.session);
          registerAndSaveToken(data.session.user.id);
          checkProfile(data.session.user.id);
        } else {
          clearAuth();
          setProfileComplete(true);
          queryClient.clear();
        }
      } catch {
        clearAuth();
        setProfileComplete(true);
        queryClient.clear();
      }
    }

    loadInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, sess: unknown) => {
      const session = sess as Session | null;
      if (session) {
        setAuth(session);
        if (session.user) {
          registerAndSaveToken(session.user.id);
          checkProfile(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        clearAuth();
        setProfileComplete(true);
        queryClient.clear();
      } else {
        rescueSessionFromCache().then((rescued) => {
          if (rescued) return;
          clearAuth();
          setProfileComplete(true);
          queryClient.clear();
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const subProfile = DeviceEventEmitter.addListener('PROFILE_COMPLETED', () => {
      setProfileComplete(true);
    });
    const subOta = DeviceEventEmitter.addListener('TRIGGER_OTA_UPDATE', (payload: { directDownload?: boolean } | undefined) => {
      setShowLottie(true);
      checkUpdate(payload?.directDownload);
    });
    return () => {
      subProfile.remove();
      subOta.remove();
    };
  }, []);
  
  if (!fontsLoaded || !isInitialized) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }

  const autenticado = !!isAuthenticated;
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <OfflineSyncProvider>
        <ErrorBoundary>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <Stack.Navigator 
              screenOptions={{ 
                headerShown: false, 
                animation: 'slide_from_right', 
                contentStyle: { backgroundColor: '#FFFFFF' } 
              }}
              {...( { detachInactiveScreens: false } as unknown as React.ComponentProps<typeof Stack.Navigator> )}
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
                  <Stack.Screen name="Notificaciones" component={NotificationsScreen} />
                  <Stack.Screen name="Estadisticas" component={EstadisticasScreen} />
                  <Stack.Screen name="ProductosActualizados" component={UpdatedProductsScreen} />
                  <Stack.Screen 
                    name="ProductViewer" 
                    component={ProductViewerScreen} 
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
