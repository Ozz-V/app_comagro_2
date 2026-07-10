import { fetchAiPitch } from '../src/services/catalogService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock de supabase para que no intente conectar en tests
jest.mock('../src/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      refreshSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  EDGE_URL: 'https://mock.supabase.co/functions/v1',
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../src/utils/database', () => ({
  insertProductsBatch: jest.fn().mockResolvedValue(undefined),
}));

describe('fetchAiPitch', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('devuelve el pitch desde caché local si existe', async () => {
    await AsyncStorage.setItem('@ai_cache_all', JSON.stringify({ 'SKU123': 'Texto cacheado' }));

    const result = await fetchAiPitch('SKU123');

    expect(result.pitch).toBe('Texto cacheado');
    expect(result.fromCache).toBe(true);
  });

  it('devuelve fromCache=false cuando el SKU no está en caché', async () => {
    // Sin nada en caché — intentará Supabase (mockeado a null) y retornará null pitch
    const result = await fetchAiPitch('SKU_NO_EXISTE');

    expect(result.fromCache).toBe(false);
    expect(result.pitch).toBeNull();
  });
});
