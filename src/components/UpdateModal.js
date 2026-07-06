import React from 'react';
import { View, Text, TouchableOpacity, Modal, BackHandler } from 'react-native';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';

export default function UpdateModal({ visible, onClose, updateData, isAvailable }) {
  const updateVersionLabel = updateData?.version_name || (updateData?.version_code ? `build ${updateData.version_code}` : 'nueva');
  const updateNotesText = updateData?.release_notes || 'Nuevas mejoras y correcciones generales.';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 28, elevation: 5, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: isAvailable ? '#E9F1FF' : '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <SvgIcon name="actualizar" size={32} color={isAvailable ? COLORS.navy : COLORS.green} />
          </View>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginBottom: 12, textAlign: 'center' }}>
            {isAvailable ? 'Nueva actualización disponible' : '¡Todo al día!'}
          </Text>
          <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4, textAlign: 'center', marginBottom: 30, lineHeight: 22 }}>
            {isAvailable
              ? `Versión ${updateVersionLabel} disponible.\n${updateNotesText}\n\nLa aplicación se cerrará automáticamente. Por favor, vuelve a abrirla para aplicar la actualización.`
              : 'Tenés instalada la versión más reciente de la aplicación.'}
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: COLORS.navy, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' }} 
            onPress={() => {
              if (isAvailable) {
                BackHandler.exitApp();
              } else {
                onClose();
              }
            }}
          >
            <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.white }}>
              {isAvailable ? 'Cerrar Aplicación' : 'Entendido'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
