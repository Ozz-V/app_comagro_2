import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import LottieView from 'lottie-react-native';
import { COLORS } from '../theme';

export default function LottieSplashScreen({ onFinish }) {
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // A los 3 segundos (3000ms), iniciar fade out
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400, // 400ms fade out suave
        useNativeDriver: true,
      }).start(() => {
        // Cuando termine el fade out, avisar a App.js
        onFinish();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LottieView
        source={require('../../assets/iso.json')}
        autoPlay
        loop={true}
        style={styles.lottie}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999, // Para asegurar que tape todo al inicio
  },
  lottie: {
    width: 250,
    height: 250,
  },
});
