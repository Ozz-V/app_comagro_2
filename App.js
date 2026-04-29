import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
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

import LoginScreen    from './src/screens/LoginScreen';
import PortalScreen   from './src/screens/PortalScreen';
import CatalogosScreen from './src/screens/CatalogosScreen';
import FichasScreen   from './src/screens/FichasScreen';
import ProductosScreen from './src/screens/ProductosScreen';
import LottieSplashScreen from './src/screens/LottieSplashScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando
  const [showLottie, setShowLottie] = useState(true);

  const [fontsLoaded] = useFonts({
    BarlowCondensed_400Regular,
    BarlowCondensed_700Bold,
    BarlowCondensed_900Black,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
  });

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
            // Alert para depuración y frenar la ejecución instantánea que puede crashear
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
      // Pequeño delay para que Android termine de traer la app al frente
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

    // --- COMPROBADOR DE ACTUALIZACIONES (OTA APK) ---
    async function checkUpdate() {
      try {
        const { data, error } = await supabase
          .from('version_apk')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data && data.version_name) {
          const currentVersion = Constants.expoConfig?.version || '1.0.0';
          if (data.version_name !== currentVersion) {
            Alert.alert(
              'Actualización Disponible',
              data.release_notes || 'Hay una nueva versión de Comagro Catálogo. Por favor actualizá para continuar.',
              [
                { 
                  text: 'Descargar Actualización', 
                  onPress: () => {
                    Linking.openURL(data.download_url);
                  } 
                }
              ],
              { cancelable: !data.is_mandatory }
            );
          }
        }
      } catch (err) {
        console.log('Error checkUpdate:', err);
      }
    }
    checkUpdate();

    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  // Splash nativo si todavía ni siquiera carga React o las fuentes básicas
  if (!fontsLoaded || session === undefined) {
    return null; // El SplashScreen nativo se encarga
  }

  const autenticado = !!(session && session.user?.email?.endsWith('@comagro.com.py'));

  return (
    <>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {!autenticado ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Portal"    component={PortalScreen} />
              <Stack.Screen name="Catalogos" component={CatalogosScreen} />
              <Stack.Screen name="Fichas"    component={FichasScreen} />
              <Stack.Screen name="Productos" component={ProductosScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      
      {/* Superposición del Lottie Splash durante 3 seg */}
      {showLottie && <LottieSplashScreen onFinish={() => setShowLottie(false)} />}
    </>
  );
}
// Trigger build
