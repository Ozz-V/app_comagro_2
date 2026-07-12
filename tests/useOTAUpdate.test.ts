import { renderHook, act } from '@testing-library/react-native';
import { useOTAUpdate } from '../src/hooks/useOTAUpdate';
import { supabase } from '../src/supabase';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { useCustomAlert } from '../src/contexts/CustomAlertContext';

jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../src/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../src/contexts/CustomAlertContext', () => ({ useCustomAlert: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn() }));
jest.mock('expo-application', () => ({ nativeBuildVersion: '10' }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { android: { versionCode: 10, package: 'com.comagro.catalogo' } } } }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  createDownloadResumable: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn(),
  getContentUriAsync: jest.fn(),
}));
jest.mock('react-native-blob-util', () => ({ default: { fs: { hash: jest.fn() } } }), { virtual: true });
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn().mockResolvedValue(undefined) }), { virtual: true });

function buildSupabaseChain(result: { data: any; error: any }) {
  const single = jest.fn().mockResolvedValue(result);
  const limit = jest.fn().mockReturnValue({ single });
  const order = jest.fn().mockReturnValue({ limit });
  const select = jest.fn().mockReturnValue({ order });
  return { select };
}

describe('useOTAUpdate hook', () => {
  const showAlert = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useCustomAlert as jest.Mock).mockReturnValue({ showAlert });
  });

  it('sets state to none when there is no network connection', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.checkUpdate();
    });
    expect(result.current.updateState).toBe('none');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sets state to none when no version row is returned', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
    (supabase.from as jest.Mock).mockReturnValue(buildSupabaseChain({ data: null, error: null }));
    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.checkUpdate();
    });
    expect(result.current.updateState).toBe('none');
  });

  it('sets state to none when the installed version is already up to date', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
    (supabase.from as jest.Mock).mockReturnValue(buildSupabaseChain({ data: { version_code: 5 }, error: null }));
    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.checkUpdate();
    });
    expect(result.current.updateState).toBe('none');
  });

  it('sets state to prompt with update details when a newer version exists', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
    (supabase.from as jest.Mock).mockReturnValue(buildSupabaseChain({
      data: { version_code: 20, release_notes: 'Mejoras varias', download_url: 'https://x.com/a.apk', sha256_hash: 'abc', md5_hash: 'def' },
      error: null,
    }));
    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.checkUpdate();
    });
    expect(result.current.updateState).toBe('prompt');
    expect(result.current.updateNotes).toBe('Mejoras varias');
  });

  it('sets state to none if the supabase query throws', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
    (supabase.from as jest.Mock).mockImplementation(() => { throw new Error('network error'); });
    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.checkUpdate();
    });
    expect(result.current.updateState).toBe('none');
  });

  it('shows a critical error and stops if no download URL can be found at all', async () => {
    (supabase.from as jest.Mock).mockReturnValue(buildSupabaseChain({ data: null, error: null }));
    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.startDownloadUpdate();
    });
    expect(showAlert).toHaveBeenCalledWith('Error Crítico', expect.stringContaining('No se encontró el link'));
    expect(result.current.updateState).toBe('none');
  });

  it('downloads successfully and verifies sha256, ending in ready state', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/comagro_update.apk', status: 200, headers: { 'content-type': 'application/vnd.android.package-archive' } }),
    });
    const ReactNativeBlobUtil = require('react-native-blob-util').default;
    ReactNativeBlobUtil.fs.hash.mockResolvedValue('ABC123');

    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.startDownloadUpdate('https://x.com/a.apk', 'abc123', null);
    });

    expect(result.current.updateState).toBe('ready');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('rejects and deletes the file when the sha256 does not match', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/comagro_update.apk', status: 200, headers: { 'content-type': 'application/vnd.android.package-archive' } }),
    });
    const ReactNativeBlobUtil = require('react-native-blob-util').default;
    ReactNativeBlobUtil.fs.hash.mockResolvedValue('WRONG_HASH');

    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.startDownloadUpdate('https://x.com/a.apk', 'abc123', null);
    });

    expect(FileSystem.deleteAsync).toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Error de Actualización', expect.stringContaining('Firma SHA-256 inválida'));
    expect(result.current.updateState).toBe('none');
  });

  it('rejects a download whose content-type is html (e.g. an error page instead of the APK)', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/comagro_update.apk', status: 200, headers: { 'content-type': 'text/html' } }),
    });

    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.startDownloadUpdate('https://x.com/a.apk', 'abc123', null);
    });

    expect(showAlert).toHaveBeenCalledWith('Error de Actualización', expect.stringContaining('no es una APK'));
    expect(result.current.updateState).toBe('none');
  });

  it('installUpdate does nothing if there is no downloaded APK yet', async () => {
    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.installUpdate();
    });
    const IntentLauncher = require('expo-intent-launcher');
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  });

  it('installUpdate launches the installer once an APK has been downloaded', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/comagro_update.apk', status: 200, headers: { 'content-type': 'application/vnd.android.package-archive' } }),
    });
    const ReactNativeBlobUtil = require('react-native-blob-util').default;
    ReactNativeBlobUtil.fs.hash.mockResolvedValue('ABC123');
    (FileSystem.getContentUriAsync as jest.Mock).mockResolvedValue('content://fake/uri');

    const { result } = await renderHook(() => useOTAUpdate());
    await act(async () => {
      await result.current.startDownloadUpdate('https://x.com/a.apk', 'abc123', null);
    });
    await act(async () => {
      await result.current.installUpdate();
    });

    const IntentLauncher = require('expo-intent-launcher');
    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', expect.objectContaining({ data: 'content://fake/uri' }));
  });
});
