import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';
import { useOfflineSync } from '../contexts/OfflineSyncContext';

export default function OfflineSyncModal({ visible, onClose, offlineGroups, setOfflineGroups, onDownload }) {
  const { isSyncing, isPaused, progress, startSync, pauseSync } = useOfflineSync();
  const isAnySelected = offlineGroups.catalogos || offlineGroups.fichas || offlineGroups.productos;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={st.offlineModalContent}>
          <View style={st.modalHeader}>
            <View style={st.offlineIconBgLarge}>
              <SvgIcon name="cloud" size={32} color={COLORS.navy} />
            </View>
            <Text style={st.modalTitle}>Acceso sin conexión</Text>
            <Text style={st.modalSubtitle}>Seleccioná los datos que querés descargar para usar la app sin internet.</Text>
          </View>

          {isSyncing || isPaused ? (
            <View style={st.syncingContainer}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: COLORS.navy, marginBottom: 8, textAlign: 'center' }}>
                Progreso: {Math.floor((progress.current / Math.max(progress.total, 1)) * 100)}%
              </Text>
              <View style={st.progressBarBg}>
                <View style={[st.progressBarFill, { width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }]} />
              </View>
              <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, textAlign: 'center', marginTop: 8 }} numberOfLines={1}>
                {progress.currentItem || 'Preparando...'} ({progress.current}/{progress.total})
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity style={[st.dlBtn, { flex: 1, backgroundColor: isSyncing ? COLORS.border : COLORS.navy }]} onPress={isSyncing ? pauseSync : () => startSync(offlineGroups)}>
                  <Text style={[st.dlBtnText, { color: isSyncing ? COLORS.navy : COLORS.white }]}>{isSyncing ? 'Pausar' : 'Reanudar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.dlBtn, { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border }]} onPress={onClose}>
                  <Text style={[st.dlBtnText, { color: COLORS.navy }]}>Ocultar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={st.optionsContainer}>
              <TouchableOpacity style={st.checkRow} onPress={() => setOfflineGroups(p => ({ ...p, catalogos: !p.catalogos }))} activeOpacity={0.7}>
                <View style={[st.checkbox, offlineGroups.catalogos && st.checkboxActive]}>
                  {offlineGroups.catalogos && <Text style={{color: '#fff', fontSize: 12}}>✓</Text>}
                </View>
                <Text style={st.checkText}>Catálogos Generales</Text>
              </TouchableOpacity>

              <TouchableOpacity style={st.checkRow} onPress={() => setOfflineGroups(p => ({ ...p, fichas: !p.fichas }))} activeOpacity={0.7}>
                <View style={[st.checkbox, offlineGroups.fichas && st.checkboxActive]}>
                  {offlineGroups.fichas && <Text style={{color: '#fff', fontSize: 12}}>✓</Text>}
                </View>
                <Text style={st.checkText}>Fichas Técnicas</Text>
              </TouchableOpacity>

              <TouchableOpacity style={st.checkRow} onPress={() => setOfflineGroups(p => ({ ...p, productos: !p.productos }))} activeOpacity={0.7}>
                <View style={[st.checkbox, offlineGroups.productos && st.checkboxActive]}>
                  {offlineGroups.productos && <Text style={{color: '#fff', fontSize: 12}}>✓</Text>}
                </View>
                <View>
                  <Text style={st.checkText}>Todos los Productos</Text>
                  <Text style={{fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4}}>Descarga imágenes optimizadas para offline</Text>
                </View>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <TouchableOpacity style={[st.dlBtn, { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border }]} onPress={onClose}>
                  <Text style={[st.dlBtnText, { color: COLORS.navy }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[st.dlBtn, { flex: 1, opacity: isAnySelected ? 1 : 0.5 }]} 
                  onPress={onDownload}
                  disabled={!isAnySelected}
                >
                  <Text style={st.dlBtnText}>Descargar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  offlineModalContent: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { alignItems: 'center', marginBottom: 24 },
  offlineIconBgLarge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: FONTS.heading, fontSize: 20, fontWeight: '700', color: COLORS.navy, marginBottom: 8 },
  modalSubtitle: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, textAlign: 'center', paddingHorizontal: 20 },
  optionsContainer: { width: '100%', gap: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  checkText: { fontFamily: FONTS.bodySemi, fontSize: 15, color: COLORS.navy },
  dlBtn: { backgroundColor: COLORS.navy, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  dlBtnText: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.white },
  syncingContainer: { width: '100%', paddingVertical: 10 },
  progressBarBg: { width: '100%', height: 12, backgroundColor: '#F0F4F8', borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.green, borderRadius: 6 },
});
