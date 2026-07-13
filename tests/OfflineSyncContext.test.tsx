import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { OfflineSyncProvider, useOfflineSync } from '../src/contexts/OfflineSyncContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../src/supabase';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/doc/dir/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../src/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    storage: {
      from: jest.fn(),
    },
  },
  EDGE_URL: 'https://mock-edge.url',
}));

jest.mock('../src/utils/database', () => ({
  initDB: jest.fn(),
  insertProductsBatch: jest.fn(),
}));

jest.mock('../src/services/catalogService', () => ({
  ensureCatalogSynced: jest.fn().mockResolvedValue(null),
}));

const TestComponent = ({ onRender }: { onRender: (ctx: any) => void }) => {
  const ctx = useOfflineSync();
  React.useEffect(() => {
    onRender(ctx);
  }, [ctx, onRender]);
  return null;
};

describe('OfflineSyncContext', () => {
  let latestCtx: any;
  const onRender = (ctx: any) => { latestCtx = ctx; };

  beforeEach(() => {
    jest.clearAllMocks();
    latestCtx = null;
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (NetInfo.addEventListener as jest.Mock).mockImplementation((cb) => {
      cb({ isConnected: true, isInternetReachable: true });
      return jest.fn();
    });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
    (supabase.storage.from as jest.Mock).mockReturnValue({
      list: jest.fn().mockResolvedValue({ data: [{ name: 'file1.pdf' }], error: null }),
      download: jest.fn().mockResolvedValue({ data: new Blob(['pdf content']), error: null }),
      createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://mock.url' }, error: null }),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true })
    });
  });

  afterEach(async () => {
    // Flush microtasks
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    jest.restoreAllMocks();
  });

  it('initializes and loads manifest', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify({ 'item1': 'hash1' }));
    
    await act(async () => {
      render(
        <OfflineSyncProvider>
          <TestComponent onRender={onRender} />
        </OfflineSyncProvider>
      );
    });
    
    await waitFor(() => {
      expect(latestCtx?.manifestReady).toBe(true);
    });
    
    expect(latestCtx.manifest).toEqual({ 'item1': 'hash1' });
    expect(latestCtx.isOnline).toBe(true);
  });

  it('fails startSync if no active session', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    
    await act(async () => {
      render(
        <OfflineSyncProvider>
          <TestComponent onRender={onRender} />
        </OfflineSyncProvider>
      );
    });
    
    await waitFor(() => {
      expect(latestCtx?.manifestReady).toBe(true);
    });
    
    await act(async () => {
      await latestCtx.startSync({ catalogos: true, fichas: false, productos: false });
    });
    
    await waitFor(() => {
      expect(latestCtx.isSyncing).toBe(false);
      expect(latestCtx.syncAlert?.title).toBe('Error de descarga');
      expect(latestCtx.syncAlert?.message).toContain('No hay sesión activa');
    });
  });

  it('pauses sync', async () => {
    await act(async () => {
      render(
        <OfflineSyncProvider>
          <TestComponent onRender={onRender} />
        </OfflineSyncProvider>
      );
    });
    
    await waitFor(() => {
      expect(latestCtx?.manifestReady).toBe(true);
    });
    
    await act(async () => {
      latestCtx.pauseSync();
    });
    
    expect(latestCtx.isPaused).toBe(true);
  });
});
