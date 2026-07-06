import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export function useOTAUpdate() {
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

  async function startDownloadUpdate(url = updateUrl, sha256 = expectedSha256, md5 = expectedMd5) {
    if (!url) {
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
        throw createErr;
      }

      let result;
      try {
        result = await downloadResumable.downloadAsync();
      } catch (downloadErr) {
        throw downloadErr;
      }

      if (result && result.uri && result.status === 200) {
        const headers = result.headers || {};
        const contentType = String(headers['content-type'] || headers['Content-Type'] || '');
        if (contentType.toLowerCase().includes('text/html')) {
          throw new Error(`La descarga no parece ser una APK. Content-Type=${contentType}`);
        }

        // VALIDACIÓN DE HASH ESTRICTA CON FALLBACK TEMPORAL
        const hasSha256 = !!sha256;
        const hasMd5 = !!md5;

        if (hasSha256) {
          const ReactNativeBlobUtil = require('react-native-blob-util').default;
          const nativePath = result.uri.startsWith('file://') ? result.uri.replace('file://', '') : result.uri;
          const calculatedSha256 = await ReactNativeBlobUtil.fs.hash(nativePath, 'sha256');
          
          if (calculatedSha256.toLowerCase() !== sha256.toLowerCase()) {
            await FileSystem.deleteAsync(result.uri, { idempotent: true });
            throw new Error('Firma de seguridad SHA-256 inválida. Descarga abortada por seguridad.');
          }
        } else if (hasMd5) {
          console.warn("ALERTA DE SEGURIDAD: Uso de verificación MD5 en transición. Migrar BD a SHA-256 antes del 17-Jul-2026.");
          const fileInfo = await FileSystem.getInfoAsync(result.uri, { md5: true });
          
          if (fileInfo.md5.toLowerCase() !== md5.toLowerCase()) {
            await FileSystem.deleteAsync(result.uri, { idempotent: true });
            throw new Error('Firma MD5 inválida. Descarga abortada.');
          }
        } else {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
          throw new Error('ALERTA DE SEGURIDAD CRÍTICA: El servidor no proporcionó firma de integridad (Hash). Instalación bloqueada para prevenir inyección de código.');
        }

        setApkLocalUri(result.uri);
        setUpdateState('ready');
        return;
      } else {
        throw new Error('Error al descargar la actualización. Intentá de nuevo.');
      }

    } catch (err) {
      console.log('Error de descarga:', err);
      // alert here could be missing context so we just fail silently to state none, or rely on App.js alerts
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
