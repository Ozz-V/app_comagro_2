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

  const isFlyer = comunicado.tipo === 'Imagen';
  const versionApp = Constants.expoConfig?.version || '1.0.0';

  if (isFlyer) {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <SafeAreaView style={styles.safeAreaLight}>
          <TouchableOpacity 
            style={styles.closeFloatBtn} 
            onPress={onClose} 
            activeOpacity={0.8}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <Text style={styles.closeFloatText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.flyerContainer}>
            {comunicado.imagen_url ? (
              <Image
                source={{ uri: comunicado.imagen_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                transition={300}
              />
            ) : (
              <Text style={{ color: COLORS.gray1, fontFamily: FONTS.body }}>No hay imagen disponible.</Text>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // MODO CAJA BLANCA (Normal)
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, { maxHeight: height * 0.85 }]}>
            
            {/* Header / Tipo */}
            <View style={styles.header}>
              <View style={{ flex: 1 }} />
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
              {comunicado.contenido ? (
                <Text style={styles.body}>{comunicado.contenido}</Text>
              ) : null}
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
  safeAreaLight: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  flyerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20, // Esto asegura que la imagen no toque los bordes laterales del celular
  },
  closeFloatBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  closeFloatText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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