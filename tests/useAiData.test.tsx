import { renderHook, act } from '@testing-library/react-native';
import { useAiData } from '../src/hooks/useAiData';

// Mock getAiHomeData
jest.mock('../src/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn().mockResolvedValue({ data: { message: 'Success' }, error: null })
    }
  }
}));

jest.mock('../src/services/catalogService', () => ({
  fetchAiPitch: jest.fn().mockResolvedValue({ pitch: 'Mocked Pitch' })
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('useAiData', () => {
  it('initializes and returns data', async () => {
    const rendered: any = renderHook(() => useAiData());
    const result = rendered.result || (await rendered).result;
    
    // Initially should not be loading
    expect(result.current.loadingAi).toBe(false);
    expect(result.current.aiData).toBeNull();

    // Trigger fetch
    await act(async () => {
      await result.current.fetchAiData('SKU123', null);
    });

    expect(result.current.loadingAi).toBe(false);
    expect(result.current.aiData).toBe('Mocked Pitch');
  });

  it('uses offline pitch if provided', async () => {
    const rendered: any = renderHook(() => useAiData());
    const result = rendered.result || (await rendered).result;

    await act(async () => {
      await result.current.fetchAiData('SKU123', 'Offline Pitch Text');
    });

    expect(result.current.aiData).toBe('Offline Pitch Text');
  });
});
