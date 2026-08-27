import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import LottieView from 'lottie-react-native';
import { COLORS } from '../theme';

const ANIMATION_ISO = require('../../assets/iso.json');

interface WhatsNewModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  versionLabel?: string;
  features: { title: string; description: string }[];
}

// Mismo lenguaje visual que el modal global de CustomAlertContext (el mismo
// Lottie girando arriba, la misma caja blanca redondeada, la misma
// tipografía) para que se sienta parte del mismo sistema de alertas y no
// como un componente aparte. A diferencia de ese modal, este no tiene fila
// de botones -- solo una lista de novedades y una "✕" arriba a la derecha
// para cerrarlo.
export default function WhatsNewModal({ visible, onClose, title = '¡Nuevas actualizaciones!', versionLabel, features }: WhatsNewModalProps) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <LottieView
            source={ANIMATION_ISO}
            autoPlay
            loop
            style={styles.lottieIcon}
            resizeMode="contain"
          />

          <Text style={styles.title}>{title}</Text>
          {!!versionLabel && <Text style={styles.versionLabel}>{versionLabel}</Text>}

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false} bounces={false}>
            {features.map((feature, index) => (
              <View key={index} style={styles.listRow}>
                <View style={styles.bullet}>
                  <Text style={styles.bulletText}>✓</Text>
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.listTitle}>{feature.title}</Text>
                  <Text style={styles.listDesc}>{feature.description}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99998,
  },
  box: {
    width: '85%',
    maxHeight: '85%',
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    paddingTop: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
  },
  closeBtnText: {
    fontSize: 20,
    color: COLORS.gray4,
    fontWeight: 'bold',
  },
  lottieIcon: {
    width: 90,
    height: 90,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 22,
    color: COLORS.navy || '#1F2F6B',
    marginBottom: 4,
    textAlign: 'center',
  },
  versionLabel: {
    fontFamily: 'Barlow_400Regular',
    fontSize: 13,
    color: '#8A8A8A',
    marginBottom: 18,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    flexGrow: 0,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  bullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  bulletText: {
    color: '#1c9f4b',
    fontSize: 13,
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
  },
  listTitle: {
    fontFamily: 'Barlow_600SemiBold',
    fontSize: 15,
    color: COLORS.navy || '#1F2F6B',
    marginBottom: 2,
  },
  listDesc: {
    fontFamily: 'Barlow_400Regular',
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
  },
});
