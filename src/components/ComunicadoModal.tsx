import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, useWindowDimensions, SafeAreaView } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { COLORS, FONTS } from '../theme';
import { Comunicado } from '../hooks/useComunicados';

interface ComunicadoModalProps {
  visible: boolean;
  comunicado: Comunicado | null;
  onClose: () => void;
  readOnly?: boolean;
}

export default function ComunicadoModal({ visible, comunicado, onClose, readOnly = false }: ComunicadoModalProps) {
  const { height, width } = useWindowDimensions();

  if (!comunicado) return null;

  const versionApp = Constants.expoConfig?.version || '1.0.0';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, { maxHeight: height * 0.85 }]}>
            
            {/* Header / Tipo */}
            <View style={styles.header}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{comunicado.tipo}</Text>
              </View>
              {/* Solo mostrar versión si es una novedad técnica, opcional */}
              {comunicado.tipo.includes('actualizaciones') && (
                <Text style={styles.versionText}>Versión {versionApp}</Text>
              )}
            </View>

            <ScrollView bounces={false} contentContainerStyle={styles.scrollContent}>
              {/* Título */}
              <Text style={styles.title}>{comunicado.titulo}</Text>

              {/* Flyer (Si existe) */}
              {comunicado.imagen_url ? (
                <Image
                  source={{ uri: comunicado.imagen_url }}
                  style={[styles.flyer, { width: width - 80, height: (width - 80) * 1.77 }]} // 9:16 aspect ratio base
                  contentFit="contain"
                  transition={300}
                />
              ) : null}

              {/* Contenido / Texto */}
              <Text style={styles.body}>{comunicado.contenido}</Text>
            </ScrollView>

            {/* Footer / Botón */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.button} onPress={onClose}>
                <Text style={styles.buttonText}>{readOnly ? 'Cerrar' : 'Entendido'}</Text>
              </TouchableOpacity>
            </View>
            
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  badge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: COLORS.green,
    fontFamily: FONTS.bodySemi,
    fontSize: 12,
  },
  versionText: {
    color: COLORS.gray4,
    fontFamily: FONTS.bodySemi,
    fontSize: 13,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: 22,
    color: COLORS.navy,
    marginBottom: 15,
  },
  flyer: {
    alignSelf: 'center',
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#f0f0f0',
  },
  body: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.gray1,
    lineHeight: 24,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: COLORS.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.white,
    fontFamily: FONTS.heading,
    fontSize: 16,
  },
});
