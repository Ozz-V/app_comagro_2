import { renderHook, act } from '@testing-library/react-native';
import { useProducts } from '../src/hooks/useProducts';
import { useOfflineSync } from '../src/contexts/OfflineSyncContext';
import { initDB, searchProducts, getUniqueBrands, getProductBySku } from '../src/utils/database';
import { syncCatalog } from '../src/services/catalogService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

jest.mock('../src/contexts/OfflineSyncContext', () => ({ useOfflineSync: jest.fn() }));
jest.mock('../src/utils/database');
jest.mock('../src/services/catalogService');
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() }
}));
jest.mock('expo-sqlite', () => ({}));
jest.mock('../src/supabase', () => ({ supabase: {}, EDGE_URL: 'mock' }));

describe('useProducts hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useOfflineSync as jest.Mock).mockReturnValue({ manifest: {}, isOnline: true });
    (initDB as jest.Mock).mockResolvedValue(undefined);
    (getUniqueBrands as jest.Mock).mockResolvedValue(['MarcaA', 'MarcaB']);
    (searchProducts as jest.Mock).mockResolvedValue([{ modelo: 'TestModel', marca: 'MarcaA' }]);
    (getProductBySku as jest.Mock).mockResolvedValue({ modelo: 'TestModel' });
    (syncCatalog as jest.Mock).mockResolvedValue({ totalSynced: 10, logoRefreshKey: 'new-key' });
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  const waitTick = async () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

  it('initializes correctly and fetches unique brands', async () => {
    const { result } = await renderHook(() => useProducts());
    expect(result.current.cargando).toBe(false);
    expect(getUniqueBrands).toHaveBeenCalled();
  });

  it('handles critical initDB failure', async () => {
    (initDB as jest.Mock).mockRejectedValue(new Error('Corrupt DB'));
    const { result } = await renderHook(() => useProducts());
    await waitTick();
    expect(result.current.error).toContain('Error crítico');
  });

  it('syncs in background if cache is expired and online', async () => {
    await AsyncStorage.setItem('comagro_productos_fecha_v3', '1000');
    const { result } = await renderHook(() => useProducts());
    await waitTick();
    expect(syncCatalog).toHaveBeenCalled();
  });

  it('fetchCatalog updates product list', async () => {
    const { result } = await renderHook(() => useProducts());
    await waitTick();
    await act(async () => {
      await result.current.fetchCatalog('Todas', 'Todas', '');
    });
    expect(searchProducts).toHaveBeenCalled();
  });

  it('onRefresh manual triggers sync', async () => {
    const { result } = await renderHook(() => useProducts());
    await waitTick();
    await act(async () => {
      await result.current.onRefresh();
    });
    expect(syncCatalog).toHaveBeenCalled();
  });

  it('getProductBySkuSafe handles errors safely', async () => {
    const { result } = await renderHook(() => useProducts());
    await waitTick();
    (getProductBySku as jest.Mock).mockRejectedValueOnce(new Error('not found'));
    let prod;
    await act(async () => {
      prod = await result.current.getProductBySkuSafe('BAD-SKU');
    });
    expect(prod).toBeNull();
  });
});
