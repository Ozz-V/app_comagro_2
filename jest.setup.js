/* eslint-env jest */
// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Mock de src/supabase.ts: el módulo real explota si no hay variables de
// entorno (SUPABASE_URL/KEY/EDGE_URL), que en el entorno de test no existen.
// Sin este mock, cualquier test que importe (directa o indirectamente) un
// servicio que use supabase falla al cargar el módulo, no por su lógica.
jest.mock('./src/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  },
  SUPABASE_URL: 'http://mock.supabase.local',
  SUPABASE_KEY: 'mock-anon-key',
  EDGE_URL: 'http://mock.edge.local',
  SUPABASE_STORAGE_KEY: 'mock-storage-key',
}));
