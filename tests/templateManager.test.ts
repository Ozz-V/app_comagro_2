import * as FileSystem from 'expo-file-system/legacy';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../src/supabase';
import { TemplateManager } from '../src/services/templateManager';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

jest.mock('../src/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const TEMPLATE_DIR = 'file:///docs/templates/';

describe('TemplateManager.syncTemplates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('crea el directorio de templates si no existe', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    await TemplateManager.syncTemplates();

    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(TEMPLATE_DIR, { intermediates: true });
  });

  it('no crea el directorio si ya existe', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    await TemplateManager.syncTemplates();

    expect(FileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
  });

  it('escribe cada template recibido de Supabase a un archivo local', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data: [
          { name: 'ficha', html_content: '<html>ficha</html>' },
          { name: 'curva', html_content: '<html>curva</html>' },
        ],
        error: null,
      }),
    });

    await TemplateManager.syncTemplates();

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      `${TEMPLATE_DIR}ficha.html`, '<html>ficha</html>', { encoding: 'utf8' }
    );
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      `${TEMPLATE_DIR}curva.html`, '<html>curva</html>', { encoding: 'utf8' }
    );
  });

  it('no escribe nada si Supabase responde con error, y falla en silencio', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: null, error: { message: 'sin conexión' } }),
    });

    await TemplateManager.syncTemplates();

    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('reporta a Sentry y no lanza si falla el acceso al filesystem (ej. sin conexión)', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('fs error'));

    await expect(TemplateManager.syncTemplates()).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('TemplateManager.getTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('devuelve el contenido cacheado si el archivo existe localmente', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('<html>cacheado</html>');

    const result = await TemplateManager.getTemplate('ficha', '<html>fallback</html>');

    expect(result).toBe('<html>cacheado</html>');
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(`${TEMPLATE_DIR}ficha.html`, { encoding: 'utf8' });
  });

  it('devuelve el fallback si el archivo no existe en cache', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    const result = await TemplateManager.getTemplate('ficha', '<html>fallback</html>');

    expect(result).toBe('<html>fallback</html>');
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  it('devuelve el fallback y reporta a Sentry si falla la lectura del archivo', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('fs error'));

    const result = await TemplateManager.getTemplate('ficha', '<html>fallback</html>');

    expect(result).toBe('<html>fallback</html>');
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
