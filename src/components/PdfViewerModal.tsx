import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, StatusBar, Linking,
} from 'react-native';
import Pdf from 'react-native-pdf';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import SvgIcon from './SvgIcon';
import { COLORS, FONTS } from '../theme';

/**
 * PdfViewerModal
 * Props:
 *   visible  {boolean}  — muestra u oculta el modal
 *   onClose  {function} — callback al cerrar
 *   url      {string}   — URL (remota o local `file://`)
 *   title    {string}   — nombre del documento
 */
interface PdfViewerModalProps {
  visible: boolean;
  url: string | null;
  title: string | null;
  onClose: () => void;
}

export default function PdfViewerModal({ visible, url, title, onClose }: PdfViewerModalProps) {
  const [loading, setLoading]       = useState(true);
  const { showAlert } = useCustomAlert();
  const [sharing, setSharing]       = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showAlreadyDownloaded, setShowAlreadyDownloaded] = useState(false);
  const [localViewUrl, setLocalViewUrl] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);

  React.useEffect(() => {
    let isMounted = true;
    async function prepareUrl() {
      if (!url) {
        if (isMounted) setLocalViewUrl(null);
        return;
      }
      if (url.startsWith('file://')) {
        if (isMounted) setLocalViewUrl(url);
      } else {
        if (isMounted) {
          setLoading(true);
          setDownloadError(false);
        }
        try {
          const safeUrl = url.replace(/ /g, '%20');
          const tempUri = `${FileSystem.cacheDirectory}temp_view_${Date.now()}.pdf`;
          
          // Implementamos un timeout inteligente (por si hay wifi pero no da internet)
          const downloadPromise = FileSystem.downloadAsync(safeUrl, tempUri);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000)); // 15s max para descargar
          
          const { uri } = await Promise.race([downloadPromise, timeoutPromise]) as { uri: string };
          
          if (isMounted) setLocalViewUrl(uri);
        } catch (e: any) {
          console.log('Error downloading temp pdf:', e);
          if (isMounted) {
            setDownloadError(true);
            setLoading(false);
          }
        }
      }
    }
    prepareUrl();
    return () => { isMounted = false; };
  }, [url]);

  // ── Compartir: descarga local + abre el modal nativo de compartir ──
  async function handleShare() {
    if (!url || sharing) return;
    setSharing(true);
    try {
      if (url.startsWith('file://')) {
        await Sharing.shareAsync(url, {
          mimeType: 'application/pdf',
          dialogTitle: title || 'Compartir PDF',
          UTI: 'com.adobe.pdf',
        });
        return;
      }

      const safeName = (title || 'documento').replace(/[^a-zA-Z0-9._\- ]/g, '_');
      const localUri = `${FileSystem.documentDirectory}${safeName}.pdf`;
      
      const downloadResumable = FileSystem.createDownloadResumable(url, localUri, {});
      const result = await downloadResumable.downloadAsync();
      
      if (!result || !result.uri) throw new Error('No se pudo descargar el archivo temporal.');

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showAlert('Compartir no disponible', 'No se puede compartir en este dispositivo');
        return;
      }
      await Sharing.shareAsync(result.uri);
    } catch (e: any) {
      console.log('Error sharing PDF:', e);
      showAlert('Error al compartir', e?.message || 'No se pudo compartir el archivo.');
    } finally {
      setSharing(false);
    }
  }

  // ── Descarga directa: abre el gestor de descargas de Android ──────
  async function handleDownload() {
    if (!url || downloading) return;
    if (url.startsWith('file://')) {
      setShowAlreadyDownloaded(true);
      return;
    }
    setDownloading(true);
    try {
      const safeName = (title || 'documento').replace(/[^a-zA-Z0-9._\- ]/g, '_');
      // Asegurar que la URL tenga el parámetro download correctamente
      const separator = url.includes('?') ? '&' : '?';
      const downloadUrl = `${url}${separator}download=${encodeURIComponent(safeName + '.pdf')}`;
      await Linking.openURL(downloadUrl);
    } catch (e: any) {
      console.log('Error download PDF:', e);
      showAlert('Error al descargar', e?.message || 'No se pudo iniciar la descarga.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>

        {/* Barra superior */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.volver}>‹ Volver</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || 'Documento'}
          </Text>

          {/* Botones: compartir + descarga directa */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.actionBtn}
              disabled={sharing}
              activeOpacity={0.7}
            >
              {sharing
                ? <ActivityIndicator size="small" color={COLORS.navy} />
                : <SvgIcon name="share" size={20} color={COLORS.navy} />
              }
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDownload}
              style={styles.actionBtn}
              disabled={downloading}
              activeOpacity={0.7}
            >
              {downloading
                ? <ActivityIndicator size="small" color={COLORS.navy} />
                : <SvgIcon name="descarga" size={20} color={COLORS.navy} />
              }
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.separator} />

        {/* Visor PDF */}
        {downloadError ? (
          <View style={styles.center}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFEBEB', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <SvgIcon name="config" size={32} color="#D32F2F" />
            </View>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 18, fontWeight: '700', color: COLORS.navy, marginBottom: 8 }}>Sin conexión real</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, textAlign: 'center', paddingHorizontal: 30 }}>
              No pudimos cargar el documento. Por favor, verificá que tu conexión a internet funcione correctamente.
            </Text>
          </View>
        ) : localViewUrl ? (
          <View style={{ flex: 1 }}>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.navy} />
                <Text style={styles.loadingText}>Cargando documento…</Text>
              </View>
            )}
            <Pdf
              source={{ uri: localViewUrl, cache: true }}
              onLoadComplete={(numberOfPages) => {
                setLoading(false);
              }}
              onError={(error) => {
                console.log(error);
                setDownloadError(true);
                setLoading(false);
              }}
              style={styles.webview}
            />
          </View>
        ) : (
          <View style={styles.center}>
            {loading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.navy} />
                <Text style={styles.loadingText}>Preparando documento…</Text>
              </View>
            ) : (
              <Text style={styles.errorText}>No se pudo cargar el documento</Text>
            )}
          </View>
        )}

      </View>
      {/* Custom Modal: Archivo ya descargado */}
      <Modal visible={showAlreadyDownloaded} animationType="fade" transparent onRequestClose={() => setShowAlreadyDownloaded(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 28, elevation: 5, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <SvgIcon name="cloud" size={32} color={COLORS.green} />
            </View>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700', color: COLORS.navy, marginBottom: 12, textAlign: 'center' }}>
              Archivo descargado
            </Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.gray4, textAlign: 'center', marginBottom: 30, lineHeight: 22 }}>
              Este PDF ya se encuentra guardado en tu teléfono para uso sin conexión. Usa el botón de compartir si deseas enviarlo o guardarlo en otra carpeta.
            </Text>
            <TouchableOpacity style={{ backgroundColor: COLORS.navy, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' }} onPress={() => setShowAlreadyDownloaded(false)}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.white }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
  },
  backBtn: {
    minWidth: 72,
    justifyContent: 'center',
  },
  volver: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.green,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.bodySemi,
    fontSize: 13,
    color: COLORS.navy,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minWidth: 72,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    padding: 4,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
  },
  loadingText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
  },
});
