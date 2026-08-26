import {
  fetchTopics,
  fetchComments,
  createTopic,
  createComment,
  deleteTopic,
  deleteComment,
  updateTopicTitle,
  uploadForumImage,
} from '../src/utils/forum';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

// forum.ts ahora usa AsyncStorage para cachear temas/comentarios localmente.
// Sin este mock, cualquier test que importe forum.ts falla con
// "NativeModule: AsyncStorage is null" (no hay implementación nativa real
// disponible en el entorno de Jest).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// --- Mock de supabase ---
// Cada método de la cadena (select/eq/order/insert/update/delete/single)
// devuelve el mismo objeto encadenable, y ese objeto también es "thenable"
// para poder resolverse en el punto donde el código real hace el await,
// sin importar en qué método termine la cadena.
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };

const chainable = (): any => {
  const obj: any = {};
  ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single'].forEach((method) => {
    obj[method] = jest.fn(() => obj);
  });
  obj.then = (resolve: (v: unknown) => void) => resolve(mockResult);
  return obj;
};

const mockGetUser = jest.fn();
const mockStorageUpload = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock('../src/supabase', () => ({
  supabase: {
    from: jest.fn(() => chainable()),
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    storage: {
      from: jest.fn(() => ({
        upload: (...args: unknown[]) => mockStorageUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
      })),
    },
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('base64-arraybuffer', () => ({
  decode: jest.fn(() => new ArrayBuffer(8)),
}));

describe('forum.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResult = { data: null, error: null };
  });

  describe('fetchTopics', () => {
    it('devuelve la lista de temas cuando no hay error', async () => {
      mockResult = { data: [{ id: '1', title: 'Tema A' }], error: null };
      const result = await fetchTopics();
      expect(result).toEqual([{ id: '1', title: 'Tema A' }]);
    });

    it('lanza error si supabase devuelve error', async () => {
      mockResult = { data: null, error: new Error('fallo de red') };
      await expect(fetchTopics()).rejects.toThrow('fallo de red');
    });
  });

  describe('fetchComments', () => {
    it('devuelve la lista de comentarios de un tema', async () => {
      mockResult = { data: [{ id: 'c1', content: 'Buen aporte' }], error: null };
      const result = await fetchComments('topic-1');
      expect(result).toEqual([{ id: 'c1', content: 'Buen aporte' }]);
    });

    it('lanza error si supabase devuelve error', async () => {
      mockResult = { data: null, error: new Error('fallo comentarios') };
      await expect(fetchComments('topic-1')).rejects.toThrow('fallo comentarios');
    });
  });

  describe('createTopic', () => {
    it('lanza error si el usuario no está autenticado', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await expect(createTopic('Título', 'Descripción')).rejects.toThrow('No estás autenticado');
    });

    it('crea un tema sin imagen', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockResult = { data: { id: 'topic-1', title: 'Título' }, error: null };
      const result = await createTopic('Título', 'Descripción');
      expect(result).toEqual({ id: 'topic-1', title: 'Título' });
    });

    it('convierte el error de límite en un mensaje amigable', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockResult = { data: null, error: { message: 'Ya tiene 5 temas creados' } };
      await expect(createTopic('Título', 'Descripción')).rejects.toThrow(
        'Has alcanzado el límite máximo de 5 temas creados.'
      );
    });

    it('propaga otros errores de supabase tal cual', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockResult = { data: null, error: { message: 'error inesperado' } };
      await expect(createTopic('Título', 'Descripción')).rejects.toEqual({ message: 'error inesperado' });
    });
  });

  describe('createComment', () => {
    it('lanza error si el usuario no está autenticado', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await expect(createComment('topic-1', 'contenido')).rejects.toThrow('No estás autenticado');
    });

    it('crea un comentario sin imagen', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockResult = { data: { id: 'comment-1', content: 'contenido' }, error: null };
      const result = await createComment('topic-1', 'contenido');
      expect(result).toEqual({ id: 'comment-1', content: 'contenido' });
    });

    it('lanza error si supabase falla al insertar', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockResult = { data: null, error: new Error('insert fallido') };
      await expect(createComment('topic-1', 'contenido')).rejects.toThrow('insert fallido');
    });
  });

  describe('deleteTopic / deleteComment / updateTopicTitle', () => {
    it('elimina un tema sin error', async () => {
      mockResult = { data: null, error: null };
      await expect(deleteTopic('topic-1')).resolves.toBeUndefined();
    });

    it('lanza error si falla al eliminar un tema', async () => {
      mockResult = { data: null, error: new Error('no se pudo borrar') };
      await expect(deleteTopic('topic-1')).rejects.toThrow('no se pudo borrar');
    });

    it('elimina un comentario sin error', async () => {
      mockResult = { data: null, error: null };
      await expect(deleteComment('comment-1')).resolves.toBeUndefined();
    });

    it('actualiza el título de un tema sin error', async () => {
      mockResult = { data: null, error: null };
      await expect(updateTopicTitle('topic-1', 'Nuevo título')).resolves.toBeUndefined();
    });

    it('lanza error si falla al actualizar el título', async () => {
      mockResult = { data: null, error: new Error('no se pudo actualizar') };
      await expect(updateTopicTitle('topic-1', 'Nuevo título')).rejects.toThrow('no se pudo actualizar');
    });
  });

  describe('uploadForumImage', () => {
    it('devuelve null si el archivo no existe', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      const result = await uploadForumImage('file:///no-existe.jpg');
      expect(result).toBeNull();
    });

    it('lanza error si la imagen excede los 2MB', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 3 * 1024 * 1024 });
      await expect(uploadForumImage('file:///grande.jpg')).rejects.toThrow(
        'La imagen excede los 2MB permitidos.'
      );
    });

    it('comprime y sube la imagen, devolviendo la URL pública', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 1024 });
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file:///comprimida.jpg' });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('base64data');
      mockStorageUpload.mockResolvedValue({ data: { path: 'foo.jpg' }, error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/foo.jpg' } });

      const result = await uploadForumImage('file:///original.jpg');
      expect(result).toBe('https://cdn.test/foo.jpg');
    });

    it('lanza error si falla la subida a Supabase Storage', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 1024 });
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file:///comprimida.jpg' });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('base64data');
      mockStorageUpload.mockResolvedValue({ data: null, error: new Error('storage caído') });

      await expect(uploadForumImage('file:///original.jpg')).rejects.toThrow('storage caído');
    });
  });
});