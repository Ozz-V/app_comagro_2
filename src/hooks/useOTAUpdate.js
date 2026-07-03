import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

export function useOTAUpdate() {
  const [updateState, setUpdateState] = useState('idle'); // idle | checking | prompt | downloading | ready | none
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateNotes, setUpdateNotes] = useState('');
  const [updateUrl, setUpdateUrl] = useState(null);
  const [expectedSha256, setExpectedSha256] = useState(null);
  const [expectedMd5, setExpectedMd5] = useState(null);
  const [apkLocalUri, setApkLocalUri] = useState(null);

  // --- COMPROBADOR DE ACTUALIZACIONES: Inicia automáticamente ---
  useEffect(() => {
    checkUpdate();
  }, []);

  async function checkUpdate() {
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
          setUpdateState('prompt');
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

  async function startDownloadUpdate() {
    if (!updateUrl) {
      setUpdateState('none');
      return;
    }
    setUpdateState('downloading');
    setDownloadProgress(0);

    const destPath = FileSystem.documentDirectory + 'comagro_update.apk';
    const downloadResumable = FileSystem.createDownloadResumable(
      updateUrl,
      destPath,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        setDownloadProgress(progress);
      }
    );

    try {
      const { uri } = await downloadResumable.downloadAsync();
      
      let isValid = true;
      if (expectedMd5 || expectedSha256) {
        try {
          const ReactNativeBlobUtil = require('react-native-blob-util').default;
          const fsPath = uri.replace('file://', '');
          const calculatedMd5 = await ReactNativeBlobUtil.fs.hash(fsPath, 'md5');
          const calculatedSha256 = await ReactNativeBlobUtil.fs.hash(fsPath, 'sha256');
          
          if (expectedMd5 && calculatedMd5 !== expectedMd5) isValid = false;
          if (expectedSha256 && calculatedSha256 !== expectedSha256) isValid = false;
        } catch(e) {
          console.log('[OTA] Error calculando hash:', e);
        }
      }

      if (!isValid) {
        console.log('[OTA] Error de integridad de hash. Se cancela instalación.');
        setUpdateState('none');
        return;
      }

      setApkLocalUri(uri);
      setUpdateState('ready');
    } catch (e) {
      console.error(e);
      setUpdateState('none');
    }
  }

  async function installUpdate() {
    if (!apkLocalUri) return;
    try {
      let contentUri = apkLocalUri;
      if (Platform.OS === 'android') {
        contentUri = await FileSystem.getContentUriAsync(apkLocalUri);
      }
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: 'application/vnd.android.package-archive',
      });
    } catch (err) {
      console.log('[OTA] Error instalando:', err?.message, err);
      // Retornar error para que lo maneje la UI
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
