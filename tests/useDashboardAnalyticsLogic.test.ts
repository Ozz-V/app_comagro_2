import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../src/supabase';
import * as analyticsSync from '../src/utils/analyticsSync';
import * as database from '../src/utils/database';
import * as templateService from '../src/services/templateService';
import { useDashboardAnalyticsLogic, getTrend } from '../src/hooks/useDashboardAnalyticsLogic';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockGetSession = jest.fn();

// Chainable estilo Supabase: cada método encadenable devuelve el mismo
// objeto, y ese objeto es "thenable" para resolverse en el punto exacto
// donde el código real hace el await (sin importar dónde termine la cadena).
let fromResult: { data: unknown; error: unknown } = { data: [], error: null };
const chainable = (): any => {
  const obj: any = {};
  ['select', 'eq', 'order', 'limit', 'gte', 'insert'].forEach((m) => {
    obj[m] = jest.fn(() => obj);
  });
  obj.single = jest.fn().mockResolvedValue(fromResult);
  obj.then = (resolve: (v: unknown) => void) => resolve(fromResult);
  return obj;
};

jest.mock('../src/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: jest.fn(() => chainable()),
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

jest.mock('../src/utils/analyticsSync', () => ({
  syncAnalyticsQueue: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/database', () => ({
  getAllProducts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/hooks/useTemplate', () => ({
  useTemplate: jest.fn(() => ({ html: '<html>{{reportTitle}}</html>', version: '1' })),
}));

jest.mock('../src/services/templateService', () => ({
  renderTemplate: jest.fn((html: string) => html),
}));

jest.mock('../src/contexts/CustomAlertContext', () => ({
  useCustomAlert: () => ({ showToast: mockShowToast, showAlert: jest.fn() }),
}));

jest.mock('../src/contexts/OfflineSyncContext', () => ({
  useOfflineSync: () => ({ isOnline: mockIsOnline }),
}));

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

const mockShowToast = jest.fn();
let mockIsOnline = true;

const rowsFor = (overrides: any[]): any[] =>
  overrides.map((r) => ({
    modelo: 'SKU-1', marca: 'MarcaX', action: 'view',
    user_email: 'vendedor@comagro.com.py', created_at: new Date().toISOString(),
    ...r,
    sku: r.sku ?? r.modelo ?? 'SKU-1',
  }));

describe('useDashboardAnalyticsLogic', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockIsOnline = true;
    fromResult = { data: [], error: null };
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'vendedor@comagro.com.py' } } } });
  });

  // ── getTrend: función pura exportada ─────────────────────────────────
  describe('getTrend', () => {
    it('devuelve flecha arriba sin porcentaje si el período previo fue cero y ahora hay actividad', () => {
      expect(getTrend(5, 0)).toBe('↑');
    });

    it('devuelve vacío si ambos períodos son cero', () => {
      expect(getTrend(0, 0)).toBe('');
    });

    it('muestra el porcentaje de suba si crece más de 5%', () => {
      expect(getTrend(120, 100)).toBe('↑20%');
    });

    it('muestra el porcentaje de baja si cae más de 5%', () => {
      expect(getTrend(80, 100)).toBe('↓20%');
    });

    it('muestra flecha neutra si el cambio es de 5% o menos', () => {
      expect(getTrend(102, 100)).toBe('→');
      expect(getTrend(98, 100)).toBe('→');
    });
  });

  // ── loadImages ────────────────────────────────────────────────────
  describe('carga de imágenes de producto', () => {
    it('arma el mapa sku->imagen y sku->marca desde el catálogo local', async () => {
      (database.getAllProducts as jest.Mock).mockResolvedValue([
        { modelo: 'D-60', imagen: 'https://a.com/d60.jpg', marca: 'Comagro' },
        { modelo: 'X-1', imagen: null, imagenOriginal: 'https://a.com/x1.jpg', marca: 'OtraMarca' },
        { modelo: 'SIN-IMG', imagen: null, marca: 'Comagro' },
      ]);

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => {
        expect(result.current.imageMap['D-60']).toBe('https://a.com/d60.jpg');
      });
      expect(result.current.imageMap['X-1']).toBe('https://a.com/x1.jpg');
      expect(result.current.imageMap['SIN-IMG']).toBeUndefined();
      expect(result.current.productBrandMap['D-60']).toBe('Comagro');
    });

    it('reporta a Sentry si falla la carga del catálogo, sin romper el hook', async () => {
      (database.getAllProducts as jest.Mock).mockRejectedValue(new Error('db error'));

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => expect(Sentry.captureException).toHaveBeenCalled());
      expect(result.current.imageMap).toEqual({});
    });
  });

  // ── loadData: caché, admin, offline ─────────────────────────────────
  describe('loadData', () => {
    it('no consulta analíticas si está offline (aunque sí revisa sesión/rol), y apaga loading', async () => {
      mockIsOnline = false;

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => expect(result.current.loading).toBe(false));
      const tablesQueried = (supabase.from as jest.Mock).mock.calls.map(c => c[0]);
      expect(tablesQueried).not.toContain('producto_analytics');
    });

    it('detecta admin a partir del rol en "profiles" y trae datos globales', async () => {
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'profiles') {
          const o: any = { select: jest.fn(() => o), eq: jest.fn(() => o) };
          o.single = jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null });
          return o;
        }
        // producto_analytics (propio); lo global ahora sale por RPC agregada
        const o: any = {};
        ['select', 'eq', 'order', 'limit', 'gte'].forEach(m => { o[m] = jest.fn(() => o); });
        o.then = (resolve: any) => resolve({ data: rowsFor([{}, {}]), error: null });
        return o;
      });
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: rowsFor([{}, {}]), error: null });

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => expect(result.current.isAdmin).toBe(true));
      await waitFor(() => expect(result.current.globalData.views).toBeGreaterThan(0));
    });

    it('un usuario no-admin también recibe los datos globales agregados (vía RPC, no admin-gate)', async () => {
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'profiles') {
          const o: any = { select: jest.fn(() => o), eq: jest.fn(() => o) };
          o.single = jest.fn().mockResolvedValue({ data: { role: 'vendedor' }, error: null });
          return o;
        }
        const o: any = {};
        ['select', 'eq', 'order', 'limit', 'gte'].forEach(m => { o[m] = jest.fn(() => o); });
        o.then = (resolve: any) => resolve({ data: rowsFor([{}]), error: null });
        return o;
      });
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: rowsFor([{}, {}]), error: null });

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isAdmin).toBe(false);
      expect(supabase.rpc).toHaveBeenCalledWith('get_global_analytics_rows', expect.anything());
      expect(result.current.globalData.views).toBeGreaterThan(0);
    });

    it('muestra de inmediato los datos cacheados mientras espera la respuesta del servidor', async () => {
      await AsyncStorage.setItem('@analytics_my_all', JSON.stringify({ views: 42, shares: 3, topV: [], topSh: [] }));
      await AsyncStorage.setItem('@analytics_global_all', JSON.stringify({ views: 99, shares: 5, topV: [], topSh: [] }));
      // La sesión nunca resuelve en este test: así podemos observar el
      // estado "solo caché" antes de que llegue cualquier dato del servidor.
      mockGetSession.mockReturnValue(new Promise(() => {}));

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => expect(result.current.myData.views).toBe(42));
      expect(result.current.globalData.views).toBe(99);
    });

    it('reporta a Sentry si falla la consulta de analíticas, sin romper el hook', async () => {
      mockGetSession.mockRejectedValue(new Error('network'));

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('separa vistas y compartidos, y calcula el top de productos', async () => {
      const rows = [
        { modelo: 'A', action: 'view' },
        { modelo: 'A', action: 'view' },
        { modelo: 'B', action: 'view' },
        { modelo: 'A', action: 'share_pdf' },
        { modelo: 'A', action: 'share_image' },
      ];
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        const o: any = {};
        ['select', 'eq', 'order', 'limit', 'gte'].forEach(m => { o[m] = jest.fn(() => o); });
        o.then = (resolve: any) => resolve({ data: rowsFor(rows), error: null });
        return o;
      });

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());

      await waitFor(() => expect(result.current.myData.views).toBe(3));
      expect(result.current.myData.shares).toBe(2);
      expect(result.current.myData.topV[0]).toMatchObject({ modelo: 'A', count: 2 });
    });
  });

  // ── generatePdfReport ────────────────────────────────────────────────
  describe('generatePdfReport', () => {
    it('genera el PDF y lo comparte cuando compartir está disponible', async () => {
      (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: 'file:///reporte.pdf' });
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.generatePdfReport();
      });

      expect(templateService.renderTemplate).toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///reporte.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
      expect(result.current.isGeneratingPdf).toBe(false);
    });

    it('avisa por toast si no se puede compartir en el dispositivo', async () => {
      (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: 'file:///reporte.pdf' });
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.generatePdfReport();
      });

      expect(mockShowToast).toHaveBeenCalledWith('Compartir no disponible en este dispositivo.');
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });

    it('avisa por toast y reporta a Sentry si falla la generación del PDF', async () => {
      (Print.printToFileAsync as jest.Mock).mockRejectedValue(new Error('boom'));

      const { result } = await renderHook(() => useDashboardAnalyticsLogic());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.generatePdfReport();
      });

      expect(mockShowToast).toHaveBeenCalledWith('Error generando PDF.');
      expect(Sentry.captureException).toHaveBeenCalled();
      expect(result.current.isGeneratingPdf).toBe(false);
    });
  });

  // ── tab / setTab ─────────────────────────────────────────────────────
  describe('cambio de pestaña', () => {
    it('notifica el cambio de tab y colapsa la tarjeta expandida', async () => {
      const onTabChange = jest.fn();
      const { result } = await renderHook(() => useDashboardAnalyticsLogic(onTabChange));

      await act(async () => {
        result.current.setExpandedCard('views');
      });
      expect(result.current.expandedCard).toBe('views');

      await act(async () => {
        result.current.setTab('general');
      });

      expect(result.current.tab).toBe('general');
      expect(result.current.expandedCard).toBeNull();
      expect(onTabChange).toHaveBeenLastCalledWith('general');
    });
  });
});
