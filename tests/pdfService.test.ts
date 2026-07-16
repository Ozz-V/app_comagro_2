import { generarHtmlFicha, generateAndSharePdf } from '../src/utils/pdfService';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ParsedProduct } from '../src/types/models';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock/pdf/file.pdf' }),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-image', () => ({
  Image: {
    getCachePathAsync: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
  copyAsync: jest.fn(),
}));

describe('pdfService', () => {
  const mockProduct: ParsedProduct = {
      modelo: 'Bomba',
      marca: 'Amana',
      subcategoria: 'Bombas',
      imagen: '',
      imagenOriginal: '',
      specs: [['Power', '2hp'], ['Voltage', '220v']],
      sales_pitch: 'Description',
    };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generarHtmlFicha', () => {
    it('generates HTML string with 2 columns layout when specs > 0 and image is small', () => {
      // Force many specs to trigger double columns
      const manySpecs = Array.from({ length: 30 }, (_, i) => [`Spec${i}`, `Val${i}`]) as [string, string][];
      const html = generarHtmlFicha(manySpecs, 'base64Img', 'logoBase64', mockProduct);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('ESPECIFICACIONES TÉCNICAS');
      expect(html).toContain('Spec0');
      expect(html).toContain('Val0');
      expect(html).toContain('base64Img');
      expect(html).toContain('logoBase64');
      // Should have double columns colgroup
      expect(html).toContain('width:22%');
    });

    it('generates HTML string with 1 column layout when specs are few', () => {
      const html = generarHtmlFicha(mockProduct.specs || [], 'base64Img', 'logoBase64', mockProduct);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Power');
      expect(html).toContain('2hp');
      expect(html).toContain('width:34%'); // Single column colgroup
    });
  });

  describe('generateAndSharePdf', () => {
    it('uses cached base64 and shares PDF successfully', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true });
      
      const pdfCache = { prodBase64: 'cachedProd', logoBase64: 'cachedLogo' };
      
      await generateAndSharePdf(mockProduct, pdfCache, '1234');
      
      expect(Print.printToFileAsync).toHaveBeenCalled();
      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file:///mock/cache/AMANA_BOMBA.pdf');
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///mock/cache/AMANA_BOMBA.pdf');
      expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///mock/pdf/file.pdf', to: 'file:///mock/cache/AMANA_BOMBA.pdf' });
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///mock/cache/AMANA_BOMBA.pdf', expect.any(Object));
    });

    it('fetches images if not in cache (mocks fetchImageBase64 timeout)', async () => {
      // We will let the promise race timeout or mock fetch.
      // Since fetchImageBase64 is internal to the module and uses global.fetch, we can mock global.fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['a'], { type: 'image/jpeg' })
      });
      
      // Need a mock for FileReader to avoid errors, or just let it timeout.
      // The timeout logic handles rejects and returns ''.
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false });
      
      await generateAndSharePdf(mockProduct, {}, '1234');
      
      expect(Print.printToFileAsync).toHaveBeenCalled();
      expect(FileSystem.copyAsync).toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalled();
    });
  });
});
