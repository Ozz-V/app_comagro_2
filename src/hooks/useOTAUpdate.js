import { useState } from 'react';
import { supabase } from '../supabase';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { useCustomAlert } from '../contexts/CustomAlertContext';

export function useOTAUpdate() {
  const { showAlert } = useCustomAlert();
  const [updateState, setUpdateState] = useState('idle'); // idle | checking | prompt | downloading | ready | none
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateNotes, setUpdateNotes] = useState('');
  const [updateUrl, setUpdateUrl] = useState(null);
  const [expectedSha256, setExpectedSha256] = useState(null);
  const [expectedMd5, setExpectedMd5] = useState(null);
  const [apkLocalUri, setApkLocalUri] = useState(null);

  async function checkUpdate(autoStartDownload = false) {
    setUpdateState('checking');
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        setUpdateState('none');
        return;
      }

      const { data, error } = await supabase
        .from('version_apk')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data && data.version_code) {
        const installedCode = Application.nativeBuildVersion
          ? parseInt(Application.nativeBuildVersion, 10)
          : (Constants.expoConfig?.android?.versionCode || 1);
        if (data.version_code > installedCode) {
          setUpdateNotes(data.release_notes || 'Nueva versión disponible');
          setUpdateUrl(data.download_url);
          setExpectedSha256(data.sha256_hash || null);
          setExpectedMd5(data.md5_hash || null);
          
          if (autoStartDownload) {
            startDownloadUpdate(data.download_url, data.sha256_hash, data.md5_hash);
          } else {
            setUpdateState('prompt');
          }
        } else {
          setUpdateState('none');
        }
      } else {
        setUpdateState('none');
      }
    } catch (e) {
      console.log('Error checkUpdate:', e);
      setUpdateState('none');
    }
  }

  async function startDownloadUpdate(urlOrEvent, sha256Override, md5Override) {
    let url = typeof urlOrEvent === 'string' ? urlOrEvent : updateUrl;
    let sha256 = typeof sha256Override === 'string' ? sha256Override : expectedSha256;
    let md5 = typeof md5Override === 'string' ? md5Override : expectedMd5;

    // Fallback de ultra-seguridad: si la URL se perdió en el closure de React, forzar lectura de DB
    if (!url) {
      try {
        const { data } = await supabase.from('version_apk').select('*').order('created_at', { ascending: false }).limit(1).single();
        if (data && data.download_url) {
          url = data.download_url;
          sha256 = data.sha256_hash || null;
          md5 = data.md5_hash || null;
        }
      } catch (e) {
        console.log("Error en fallback:", e);
      }
    }

    if (!url) {
      showAlert("Error Crítico", "No se encontró el link de descarga. Por favor, intenta de nuevo más tarde.");
      setUpdateState('none');
      return;
    }

    setUpdateState('downloading');
    setDownloadProgress(0);
    setApkLocalUri(null);

    try {
      const fileUri = `${FileSystem.documentDirectory}comagro_update.apk`;
      const downloadOptions = {
        headers: {
          'User-Agent': 'ComagroApp/1.0 (Android)',
          'Accept': 'application/octet-stream, */*',
        },
      };

      let downloadResumable;
      try {
        downloadResumable = FileSystem.createDownloadResumable(
          url,
          fileUri,
          downloadOptions,
          (dp) => {
            const written = dp.totalBytesWritten ?? 0;
            const expected = dp.totalBytesExpectedToWrite ?? 0;
            const progress = expected > 0 ? written / expected : 0;
            setDownloadProgress(progress);
          }
        );
      } catch (createErr) {
        throw new Error("Error iniciando gestor de descarga: " + (createErr?.message || String(createErr)));
      }

      let result;
      try {
        result = await downloadResumable.downloadAsync();
      } catch (downloadErr) {
        throw new Error("Error descargando archivo: " + (downloadErr?.message || String(downloadErr)));
      }

      if (result && result.uri && result.status === 200) {
        const headers = result.headers || {};
        const contentType = String(headers['content-type'] || headers['Content-Type'] || '');
        if (contentType.toLowerCase().includes('text/html')) {
          throw new Error(`El archivo descargado no es una APK (Recibido: ${contentType}). Verifica el link en Supabase.`);
        }

        const hasSha256 = !!sha256;
        const hasMd5 = !!md5;

        if (hasSha256) {
          const ReactNativeBlobUtil = require('react-native-blob-util').default;
          const nativePath = result.uri.startsWith('file://') ? result.uri.replace('file://', '') : result.uri;
          let calculatedSha256;
          try {
            calculatedSha256 = await ReactNativeBlobUtil.fs.hash(nativePath, 'sha256');
          } catch (hashErr) {
            throw new Error("Fallo al calcular SHA-256 local: " + (hashErr?.message || String(hashErr)));
          }
          
          if (calculatedSha256.toLowerCase() !== sha256.toLowerCase()) {
            await FileSystem.deleteAsync(result.uri, { idempotent: true });
            throw new Error('Firma SHA-256 inválida. Posible archivo corrupto.');
          }
        } else if (hasMd5) {
          const fileInfo = await FileSystem.getInfoAsync(result.uri, { md5: true });
          if (fileInfo.md5.toLowerCase() !== md5.toLowerCase()) {
            await FileSystem.deleteAsync(result.uri, { idempotent: true });
            throw new Error('Firma MD5 inválida. Archivo corrupto.');
          }
        } else {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
          throw new Error('ALERTA: Sin hash de seguridad en BD. Abortado.');
        }

        setApkLocalUri(result.uri);
        setUpdateState('ready');
        return;
      } else {
        throw new Error(`HTTP Error ${result?.status || 'desconocido'} al descargar.`);
      }

    } catch (err) {
      console.log('Error de descarga OTA:', err);
      showAlert(
        'Error de Actualización',
        `No se pudo completar la actualización.\n\nDetalle: ${err?.message || 'Error desconocido'}`
      );
      setUpdateState('none');
    }
  }

  async function installUpdate() {
    if (!apkLocalUri) return;
    try {
      let contentUri;
      try {
        contentUri = await FileSystem.getContentUriAsync(apkLocalUri);
      } catch (uriErr) {
        const pkg = Constants.expoConfig?.android?.package || 'com.comagro.catalogo';
        contentUri = `content://${pkg}.FileSystemFileProvider/expo_files/comagro_update.apk`;
      }

      await require('expo-intent-launcher').startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
    } catch (err) {
      console.log('[OTA] Error instalando:', err?.message, err);
      throw err;
    }
  }

  return {
    updateState,
    downloadProgress,
    updateNotes,
    setUpdateState,
    checkUpdate,
    startDownloadUpdate,
    installUpdate
  };
}
