import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import LottieView from 'lottie-react-native';
import { COLORS } from '../theme';
import Constants from 'expo-constants';

export default function LottieSplashScreen({ onFinish, updateState, downloadProgress, onInstall }) {
  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // Animar la barra de progreso
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: downloadProgress || 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [downloadProgress]);

  useEffect(() => {
    // Solo hacer fade out si NO hay actualización pendiente
    if (updateState === 'downloading' || updateState === 'ready') return;

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [updateState]);

  // Texto según estado
  let statusText = '';
  if (updateState === 'checking') statusText = 'Buscando actualizaciones...';
  else if (updateState === 'downloading') statusText = 'Descargando actualización...';
  else if (updateState === 'ready') statusText = '¡Actualización lista!';

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LottieView
        source={require('../../assets/iso.json')}
        autoPlay
        loop={true}
        style={styles.lottie}
        resizeMode="contain"
      />

      <View style={styles.bottom}>
        {/* Barra de progreso (solo durante descarga) */}
        {updateState === 'downloading' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBg}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressText}>{Math.round((downloadProgress || 0) * 100)}%</Text>
          </View>
        )}

        {/* Botón instalar (solo cuando está listo) */}
        {updateState === 'ready' && (
          <TouchableOpacity style={styles.installBtn} onPress={onInstall} activeOpacity={0.7}>
            <Text style={styles.installText}>Instalar actualización</Text>
          </TouchableOpacity>
        )}

        {statusText ? (
          <Text style={styles.statusText}>{statusText}</Text>
        ) : null}

        <Text style={styles.versionText}>v{appVersion}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  lottie: {
    width: 250,
    height: 250,
  },
  bottom: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
    width: '80%',
  },
  statusText: {
    fontFamily: 'Barlow_400Regular',
    fontSize: 13,
    color: '#C0C0C0',
    marginBottom: 6,
  },
  versionText: {
    fontFamily: 'Barlow_400Regular',
    fontSize: 12,
    color: '#D0D0D0',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#E8E8E8',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1c9f4b',
    borderRadius: 3,
  },
  progressText: {
    fontFamily: 'Barlow_500Medium',
    fontSize: 13,
    color: '#1c9f4b',
  },
  installBtn: {
    backgroundColor: '#1c9f4b',
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 10,
    marginBottom: 14,
  },
  installText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
