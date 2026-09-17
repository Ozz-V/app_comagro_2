import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sentry from '@sentry/react-native';
import { captureRef } from 'react-native-view-shot';
import { supabase } from '../src/supabase';
import * as pdfService from '../src/utils/pdfService';
import * as productLogic from '../src/utils/productLogic';
import { useProductDetailLogic } from '../src/hooks/useProductDetailLogic';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockGetUser = jest.fn();

jest.mock('../src/supabase', () => ({
  supabase: { auth: { getUser: (...args: unknown[]) => mockGetUser(...args) } },
}));

jest.mock('../src/utils/pdfService', () => ({
  fetchImageBase64: jest.fn(),
  generateAndSharePdf: jest.fn(),
  generateFichaPdfUri: jest.fn(),
  generateAndShareCurvaPdf: jest.fn(),
}));

jest.mock('../src/utils/productLogic', () => ({
  findSimilarProducts: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
  copyAsync: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

const showAlert = jest.fn();
const baseProps = {
  visible: true,
  activeSliderList: null,
  pdfCache: {},
  logoRefreshKey: 'k1',
  showAlert,
  screenWidth: 400,
  LOGO_BASE: 'https://logos.example.com/',
};

const buildProd = (overrides: any = {}) => ({
  modelo: 'D-60',
  marca: 'Comagro',
  subcategoria: 'BOMBA DE AGUA',
  specs: [],
  imagen: null,
  imagenes: [],
  ...overrides,
});

describe('useProductDetailLogic', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockGetUser.mockResolvedValue({ data: { user: { email: 'vendedor@comagro.com.py' } } });
    (productLogic.findSimilarProducts as jest.Mock).mockResolvedValue({ similares: [], mismaMarca: [] });
  });

  // ── productImages: parseo de URLs ───────────────────────────────────
  describe('productImages', () => {
    it('combina "imagen" e "imagenes" y descarta valores no-URL', async () => {
      const prod = buildProd({ imagen: 'https://a.com/1.jpg', imagenes: ['no-es-url', 'https://a.com/2.jpg'] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      expect(result.current.productImages).toEqual(['https://a.com/1.jpg', 'https://a.com/2.jpg']);
    });

    it('deduplica URLs repetidas', async () => {
      const prod = buildProd({ imagen: 'https://a.com/1.jpg', imagenes: ['https://a.com/1.jpg'] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      expect(result.current.productImages).toEqual(['https://a.com/1.jpg']);
    });

    it('expande un string JSON de array en URLs individuales', async () => {
      const prod = buildProd({ imagen: null, imagenes: ['["https://a.com/1.jpg","https://a.com/2.jpg"]'] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      expect(result.current.productImages).toEqual(['https://a.com/1.jpg', 'https://a.com/2.jpg']);
    });

    it('separa una lista de URLs unidas por coma (sin query strings)', async () => {
      const prod = buildProd({ imagen: null, imagenes: ['https://a.com/1.jpg,https://a.com/2.jpg'] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      expect(result.current.productImages).toEqual(['https://a.com/1.jpg', 'https://a.com/2.jpg']);
    });

    it('no separa por coma si alguna URL tiene query string (evita cortar mal)', async () => {
      const prod = buildProd({ imagen: null, imagenes: ['https://a.com/1.jpg?x=1,2'] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      expect(result.current.productImages).toEqual(['https://a.com/1.jpg?x=1,2']);
    });

    it('descarta URLs demasiado cortas o sin protocolo válido', async () => {
      const prod = buildProd({ imagen: 'ftp://a.com/x.jpg', imagenes: ['http', ''] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      expect(result.current.productImages).toEqual([]);
    });

    it('devuelve vacío si no hay producto', async () => {
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: null }));
      expect(result.current.productImages).toEqual([]);
    });
  });

  // ── curveData: cálculo de curva de rendimiento ──────────────────────
  describe('curveData', () => {
    it('es null si no hay producto', async () => {
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: null }));
      expect(result.current.curveData).toBeNull();
    });

    it('es null para una subcategoría que no es de bombas', async () => {
      const prod = buildProd({ subcategoria: 'GENERADOR', specs: [['CAUDAL', '10 M3/H'], ['ALTURA', '20 M']] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));
      expect(result.current.curveData).toBeNull();
    });

    it('es null para bombas explícitamente excluidas (ej. repuestos)', async () => {
      const prod = buildProd({ subcategoria: 'REPUESTO PARA BOMBA', specs: [['CAUDAL', '10 M3/H'], ['ALTURA', '20 M']] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));
      expect(result.current.curveData).toBeNull();
    });

    it('calcula maxQ/maxH para una bomba con caudal en M3/H y altura en M', async () => {
      const prod = buildProd({ specs: [['CAUDAL MAX', '12 M3/H'], ['ALTURA MAX', '25 M']] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      // 12 m3/h -> 200 L/min -> finalQ = 200*60/1000 = 12
      expect(result.current.curveData?.maxQ).toBeCloseTo(12, 5);
      expect(result.current.curveData?.maxH).toBe(25);
    });

    it('convierte presión en BAR a metros de columna de agua si no hay altura directa', async () => {
      const prod = buildProd({ specs: [['CAUDAL', '6 M3/H'], ['PRESIÓN', '2 BAR']] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      expect(result.current.curveData?.maxH).toBeCloseTo(2 * 10.197, 3);
    });

    it('es null si falta caudal o altura', async () => {
      const prod = buildProd({ specs: [['ALTURA', '20 M']] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));
      expect(result.current.curveData).toBeNull();
    });
  });

  // ── reset de estado al cambiar de producto ──────────────────────────
  describe('cambio de producto (prevModelo)', () => {
    it('vuelve a la pestaña FICHA y resetea el carrusel al cambiar de modelo', async () => {
      const prodA = buildProd({ modelo: 'A-1' });
      const { result, rerender } = await renderHook(
        (props: any) => useProductDetailLogic(props),
        { initialProps: { ...baseProps, modalProd: prodA } }
      );

      await act(async () => {
        result.current.setActiveTab('SIMILARES');
        result.current.setActiveImgIndex(2);
      });
      expect(result.current.activeTab).toBe('SIMILARES');

      const prodB = buildProd({ modelo: 'B-2' });
      await act(async () => {
        rerender({ ...baseProps, modalProd: prodB });
      });

      expect(result.current.activeTab).toBe('FICHA');
      expect(result.current.activeImgIndex).toBe(0);
    });
  });

  // ── logProductAction (a través de compartirPdf) ─────────────────────
  describe('registro de analítica (logProductAction)', () => {
    it('no encola nada para el usuario anónimo', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { email: 'anon@comagro.com.py' } } });
      (pdfService.generateAndSharePdf as jest.Mock).mockResolvedValue(undefined);
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirPdf();
      });

      expect(await AsyncStorage.getItem('@analytics_queue')).toBeNull();
    });

    it('usa el email cacheado si supabase no devuelve uno', async () => {
      mockGetUser.mockResolvedValue({ data: { user: {} } });
      await AsyncStorage.setItem('@user_profile_cache', JSON.stringify({ email: 'cacheado@comagro.com.py' }));
      (pdfService.generateAndSharePdf as jest.Mock).mockResolvedValue(undefined);
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirPdf();
      });

      const queue = JSON.parse((await AsyncStorage.getItem('@analytics_queue')) as string);
      const shareEntry = queue.find((q: any) => q.action === 'share_pdf');
      expect(shareEntry).toMatchObject({ modelo: 'D-60', action: 'share_pdf', user_email: 'cacheado@comagro.com.py' });
    });
  });

  // ── compartirPdf / triggerCompartirPdf ──────────────────────────────
  describe('compartirPdf', () => {
    it('marca generandoPdf mientras genera y lo apaga al terminar', async () => {
      let resolveGenerar: () => void = () => {};
      (pdfService.generateAndSharePdf as jest.Mock).mockReturnValue(new Promise<void>(res => { resolveGenerar = res; }));
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      let pending: Promise<void>;
      await act(async () => {
        pending = result.current.compartirPdf();
        await Promise.resolve();
      });
      expect(result.current.generandoPdf).toBe(true);

      await act(async () => {
        resolveGenerar();
        await pending;
      });
      expect(result.current.generandoPdf).toBe(false);
    });

    it('muestra alerta y reporta a Sentry si falla la generación', async () => {
      (pdfService.generateAndSharePdf as jest.Mock).mockRejectedValue(new Error('boom'));
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirPdf();
      });

      expect(Sentry.captureException).toHaveBeenCalled();
      expect(showAlert).toHaveBeenCalledWith('Error', 'No se pudo generar el PDF corporativo.');
      expect(result.current.generandoPdf).toBe(false);
    });
  });

  // ── compartirImagen / triggerCompartirImagen ────────────────────────
  describe('compartirImagen', () => {
    it('avisa si compartir no está disponible en el dispositivo', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirImagen();
      });

      expect(showAlert).toHaveBeenCalledWith('Error', 'Compartir no está disponible en este dispositivo');
      expect(result.current.compartiendo).toBe(false);
      expect(pdfService.generateFichaPdfUri).not.toHaveBeenCalled();
    });

    it('genera la URI del PDF para previsualizar la imagen si está disponible', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (pdfService.generateFichaPdfUri as jest.Mock).mockResolvedValue('file:///ficha.pdf');
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirImagen();
      });

      expect(result.current.pdfUriForImage).toBe('file:///ficha.pdf');
    });

    it('avisa y apaga compartiendo si falla la preparación de la ficha', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (pdfService.generateFichaPdfUri as jest.Mock).mockRejectedValue(new Error('boom'));
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirImagen();
      });

      expect(showAlert).toHaveBeenCalledWith('Error', 'No se pudo preparar la ficha. Intentá de nuevo.');
      expect(result.current.compartiendo).toBe(false);
    });
  });

  // ── capturarPdfOculto ────────────────────────────────────────────────
  describe('capturarPdfOculto', () => {
    beforeEach(() => {
      jest.useFakeTimers({ legacyFakeTimers: false });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('captura, renombra el archivo y comparte la imagen', async () => {
      (captureRef as jest.Mock).mockResolvedValue('file:///tmp/capture.jpg');
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      const prod = buildProd({ marca: 'Comagro', modelo: 'D-60' });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      const pending = act(async () => {
        const p = result.current.capturarPdfOculto();
        await jest.advanceTimersByTimeAsync(1000);
        await p;
      });
      await pending;

      expect(FileSystem.copyAsync).toHaveBeenCalledWith({
        from: 'file:///tmp/capture.jpg',
        to: 'file:///cache/COMAGRO_D_60.jpg',
      });
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/COMAGRO_D_60.jpg', expect.objectContaining({
        mimeType: 'image/jpeg',
      }));
    });

    it('avisa y reporta a Sentry si falla la captura', async () => {
      (captureRef as jest.Mock).mockRejectedValue(new Error('capture failed'));
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      const pending = act(async () => {
        const p = result.current.capturarPdfOculto();
        await jest.advanceTimersByTimeAsync(1000);
        await p;
      });
      await pending;

      expect(Sentry.captureException).toHaveBeenCalled();
      expect(showAlert).toHaveBeenCalledWith('Error', 'Fallo al capturar la imagen en alta calidad.');
    });
  });

  // ── compartirCurvaPdf ────────────────────────────────────────────────
  describe('compartirCurvaPdf', () => {
    it('no hace nada si no hay curva de rendimiento calculable', async () => {
      const prod = buildProd({ subcategoria: 'GENERADOR' });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirCurvaPdf();
      });

      expect(pdfService.generateAndShareCurvaPdf).not.toHaveBeenCalled();
    });

    it('genera y comparte el PDF de curva usando el logo cacheado', async () => {
      (pdfService.generateAndShareCurvaPdf as jest.Mock).mockResolvedValue(undefined);
      const prod = buildProd({ specs: [['CAUDAL', '10 M3/H'], ['ALTURA', '15 M']] });
      const { result } = await renderHook(() =>
        useProductDetailLogic({ ...baseProps, modalProd: prod, pdfCache: { logoBase64: 'BASE64LOGO' } })
      );

      await act(async () => {
        await result.current.compartirCurvaPdf();
      });

      expect(pdfService.fetchImageBase64).not.toHaveBeenCalled();
      expect(pdfService.generateAndShareCurvaPdf).toHaveBeenCalledWith(
        expect.any(Object), prod, 'BASE64LOGO'
      );
    });

    it('busca el logo remoto si no está en caché, y sigue aunque falle', async () => {
      (pdfService.fetchImageBase64 as jest.Mock).mockRejectedValue(new Error('sin logo'));
      (pdfService.generateAndShareCurvaPdf as jest.Mock).mockResolvedValue(undefined);
      const prod = buildProd({ specs: [['CAUDAL', '10 M3/H'], ['ALTURA', '15 M']] });
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod }));

      await act(async () => {
        await result.current.compartirCurvaPdf();
      });

      expect(pdfService.fetchImageBase64).toHaveBeenCalled();
      expect(pdfService.generateAndShareCurvaPdf).toHaveBeenCalledWith(expect.any(Object), prod, '');
    });

    it('avisa y reporta a Sentry si falla la generación del PDF de curva', async () => {
      (pdfService.generateAndShareCurvaPdf as jest.Mock).mockRejectedValue(new Error('boom'));
      const prod = buildProd({ specs: [['CAUDAL', '10 M3/H'], ['ALTURA', '15 M']], pdfCache: {} });
      const { result } = await renderHook(() =>
        useProductDetailLogic({ ...baseProps, modalProd: prod, pdfCache: { logoBase64: 'X' } })
      );

      await act(async () => {
        await result.current.compartirCurvaPdf();
      });

      expect(Sentry.captureException).toHaveBeenCalled();
      expect(showAlert).toHaveBeenCalledWith('Error', 'No se pudo generar el PDF de la curva.');
    });
  });

  // ── handleProbeLayout ────────────────────────────────────────────────
  describe('handleProbeLayout', () => {
    it('marca contentReady cuando el layout medido coincide con el ancho de pantalla', async () => {
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod, screenWidth: 400 }));

      await act(async () => {
        result.current.handleProbeLayout({ nativeEvent: { layout: { width: 399 } } });
      });

      expect(result.current.contentReady).toBe(true);
    });

    it('no marca contentReady si el layout medido difiere mucho del ancho de pantalla', async () => {
      const prod = buildProd();
      const { result } = await renderHook(() => useProductDetailLogic({ ...baseProps, modalProd: prod, screenWidth: 400 }));

      await act(async () => {
        result.current.handleProbeLayout({ nativeEvent: { layout: { width: 200 } } });
      });

      expect(result.current.contentReady).toBe(false);
    });
  });
});
