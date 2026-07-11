import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing } from 'react-native';
import LottieView from 'lottie-react-native';
import { COLORS } from '../theme';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'cancel' | 'default';
}

interface AlertConfig {
  title: string;
  message: string;
  buttons?: AlertButton[];
}

interface ToastConfig {
  message: string;
}

interface CustomAlertContextType {
  showAlert: (title: string, message: string, buttons?: AlertButton[]) => void;
  showToast: (message: string) => void;
}

const CustomAlertContext = createContext<CustomAlertContextType | undefined>(undefined);

export function useCustomAlert() {
  const ctx = useContext(CustomAlertContext);
  if (!ctx) throw new Error('useCustomAlert must be used within CustomAlertProvider');
  return ctx;
}

export function CustomAlertProvider({ children }: { children: React.ReactNode }) {
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [isAlertVisible, setIsAlertVisible] = useState(false);
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  
  const fadeAnimRef = useRef(new Animated.Value(0));
  const slideAnimRef = useRef(new Animated.Value(-50));
  const alertOpacityRef = useRef(new Animated.Value(0));
  const alertScaleRef = useRef(new Animated.Value(0.96));
  const pendingAlertActionRef = useRef<(() => void) | null>(null);

  // Manejador del Toast
  useEffect(() => {
    if (toastConfig) {
      Animated.parallel([
        Animated.timing(fadeAnimRef.current, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnimRef.current, { toValue: 50, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true })
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnimRef.current, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(slideAnimRef.current, { toValue: -50, duration: 250, easing: Easing.in(Easing.ease), useNativeDriver: true })
        ]).start(() => setToastConfig(null));
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [toastConfig]);

  const runPendingAlertAction = useCallback(() => {
    const pendingAction = pendingAlertActionRef.current;
    pendingAlertActionRef.current = null;
    if (pendingAction) pendingAction();
  }, []);

  const closeAlert = useCallback((afterClose?: () => void) => {
    pendingAlertActionRef.current = afterClose || null;

    Animated.parallel([
      Animated.timing(alertOpacityRef.current, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(alertScaleRef.current, {
        toValue: 0.98,
        duration: 120,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsAlertVisible(false);
      setAlertConfig(null);
      runPendingAlertAction();
    });
  }, [runPendingAlertAction]);

  const showAlert = useCallback((title: string, message: string, buttons: AlertButton[] = [{ text: 'OK' }]) => {
    pendingAlertActionRef.current = null;
    alertOpacityRef.current.setValue(0);
    alertScaleRef.current.setValue(0.96);
    setAlertConfig({ title, message, buttons });
    setIsAlertVisible(true);

    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(alertOpacityRef.current, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(alertScaleRef.current, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, []);

  const showToast = (message: string) => {
    setToastConfig({ message });
  };

  return (
    <CustomAlertContext.Provider value={{ showAlert, showToast }}>
      {children}
      
      {/* GLOBAL TOAST */}
      {toastConfig && (
        <Animated.View style={[
          styles.toastContainer,
          {
            opacity: fadeAnimRef.current,
            transform: [{ translateY: slideAnimRef.current }]
          }
        ]}>
          <Text style={styles.toastText}>{toastConfig.message}</Text>
        </Animated.View>
      )}

      {/* GLOBAL ALERT MODAL */}
      <Modal
        transparent={true}
        visible={isAlertVisible}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => closeAlert()}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: alertOpacityRef.current }]}>
          <Animated.View style={[styles.alertBox, { transform: [{ scale: alertScaleRef.current }] }]}>
            <LottieView
              source={require('../../assets/iso.json')}
              autoPlay
              loop={true}
              style={styles.lottieIcon}
              resizeMode="contain"
            />
            <Text style={styles.alertTitle}>{alertConfig?.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig?.message}</Text>
            
            <View style={styles.buttonsRow}>
              {alertConfig?.buttons?.map((btn: AlertButton, index: number) => {
                const isCancel = btn.style === 'cancel';
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      isCancel ? styles.buttonCancel : styles.buttonPrimary,
                      alertConfig.buttons?.length === 1 && { flex: 1 }
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      closeAlert(btn.onPress);
                    }}
                  >
                    <Text style={[styles.buttonText, isCancel && styles.buttonTextCancel]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </CustomAlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  // TOAST STYLES
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: '10%',
    width: '80%',
    backgroundColor: COLORS.navy || '#1F2F6B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    zIndex: 99999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    fontFamily: 'Barlow_500Medium',
    color: '#FFF',
    fontSize: 14,
    textAlign: 'center',
  },
  
  // ALERT STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99998,
  },
  alertBox: {
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  lottieIcon: {
    width: 90,
    height: 90,
    marginBottom: 10,
  },
  alertTitle: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 22,
    color: COLORS.navy || '#1F2F6B',
    marginBottom: 10,
    textAlign: 'center',
  },
  alertMessage: {
    fontFamily: 'Barlow_400Regular',
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#1c9f4b', // Verde de la app
  },
  buttonCancel: {
    backgroundColor: '#F0F0F0',
  },
  buttonText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  buttonTextCancel: {
    color: '#666666',
  },
});