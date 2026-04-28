import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando

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

    // Escucha URLs entrantes (Deep Linking de Magic Links)
    const sub = Linking.addEventListener('url', (event) => {
      if (event.url) {
        supabase.auth.getSessionFromUrl(event.url);
      }
    });

    // Procesa URL inicial si la app estaba cerrada
    Linking.getInitialURL().then((url) => {
      if (url) {
        supabase.auth.getSessionFromUrl(url);
      }
    });

    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  // Splash mientras cargan fuentes y sesión
  if (!fontsLoaded || session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const autenticado = !!(session && session.user?.email?.endsWith('@comagro.com.py'));

  return (
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
  );
}
