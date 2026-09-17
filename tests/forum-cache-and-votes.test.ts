import {
  getCachedTopics,
  saveCachedTopics,
  clearCachedTopics,
  fetchTopics,
  updateTopic,
  createComment,
  voteTopic,
  ForumTopic,
} from '../src/utils/forum';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mismo patrón de mock encadenable que Forum.test.ts: cada método de la
// cadena devuelve el mismo objeto, y ese objeto es "thenable" para
// resolverse en el punto donde el código real hace el await.
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };
let singleResult: { data: unknown; error: unknown } = { data: null, error: null };

const chainable = (): any => {
  const obj: any = {};
  ['select', 'eq', 'order', 'insert', 'update', 'delete'].forEach((method) => {
    obj[method] = jest.fn(() => obj);
  });
  obj.single = jest.fn(() => Promise.resolve(singleResult));
  obj.then = (resolve: (v: unknown) => void) => resolve(mockResult);
  return obj;
};

const mockGetUser = jest.fn();

jest.mock('../src/supabase', () => ({
  supabase: {
    from: jest.fn(() => chainable()),
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  },
}));

jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn(), readAsStringAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));

const topicA: ForumTopic = {
  id: 't1', user_id: 'u1', title: 'A', description: 'Desc', image_url: null, created_at: '2026-01-01',
};

describe('forum.ts — caché local', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockResult = { data: null, error: null };
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  describe('getCachedTopics / saveCachedTopics / clearCachedTopics', () => {
    it('guarda y recupera los temas cacheados para el usuario actual', async () => {
      await saveCachedTopics([topicA]);
      const result = await getCachedTopics();
      expect(result).toEqual([topicA]);
    });

    it('devuelve [] si no hay usuario autenticado (sin clave de caché)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await saveCachedTopics([topicA]); // no debe explotar, simplemente no guarda
      const result = await getCachedTopics();
      expect(result).toEqual([]);
    });

    it('devuelve [] si no hay nada cacheado todavía', async () => {
      const result = await getCachedTopics();
      expect(result).toEqual([]);
    });

    it('devuelve [] si el cache contiene JSON corrupto, sin lanzar error', async () => {
      // Escribimos directamente bajo la misma clave que usa el módulo
      // (mismo userId 'u1' del mock de auth).
      await AsyncStorage.setItem('@forum_topics_cache_v1_u1', '{esto-no-es-json');
      const result = await getCachedTopics();
      expect(result).toEqual([]);
    });

    it('devuelve [] si el cache contiene algo que no es un array', async () => {
      await AsyncStorage.setItem('@forum_topics_cache_v1_u1', JSON.stringify({ no: 'es-array' }));
      const result = await getCachedTopics();
      expect(result).toEqual([]);
    });

    it('clearCachedTopics borra la entrada cacheada', async () => {
      await saveCachedTopics([topicA]);
      await clearCachedTopics();
      const result = await getCachedTopics();
      expect(result).toEqual([]);
    });

    it('clearCachedTopics no falla si no hay usuario autenticado', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await expect(clearCachedTopics()).resolves.toBeUndefined();
    });
  });
});

describe('forum.ts — fetchTopics (agregación de votos)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('cuenta upvotes/downvotes y detecta el voto del usuario actual', async () => {
    mockResult = {
      data: [
        {
          ...topicA,
          forum_topic_votes: [
            { user_id: 'u1', vote_type: 1 },
            { user_id: 'u2', vote_type: 1 },
            { user_id: 'u3', vote_type: -1 },
          ],
        },
      ],
      error: null,
    };

    const result = await fetchTopics();

    expect(result[0].upvotes).toBe(2);
    expect(result[0].downvotes).toBe(1);
    expect(result[0].userVote).toBe(1);
  });

  it('deja userVote en null si el usuario actual no votó', async () => {
    mockResult = {
      data: [{ ...topicA, forum_topic_votes: [{ user_id: 'otro', vote_type: 1 }] }],
      error: null,
    };

    const result = await fetchTopics();

    expect(result[0].userVote).toBeNull();
  });

  it('devuelve el tema sin tocar si no trae forum_topic_votes', async () => {
    mockResult = { data: [{ ...topicA }], error: null };

    const result = await fetchTopics();

    expect(result[0]).toEqual(topicA);
  });

  it('lanza el error de Supabase si la consulta falla', async () => {
    mockResult = { data: null, error: { message: 'db down' } };
    await expect(fetchTopics()).rejects.toEqual({ message: 'db down' });
  });
});

describe('forum.ts — updateTopic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    singleResult = { data: { ...topicA, title: 'Nuevo' }, error: null };
  });

  it('actualiza sin re-subir la imagen si ya es una URL http existente', async () => {
    const result = await updateTopic('t1', 'Nuevo', 'Desc', 'https://cdn.com/ya-subida.jpg');
    expect(result).toEqual({ ...topicA, title: 'Nuevo' });
  });

  it('lanza error si Supabase rechaza la actualización', async () => {
    singleResult = { data: null, error: { message: 'no autorizado' } };
    await expect(updateTopic('t1', 'X', 'Y', null)).rejects.toEqual({ message: 'no autorizado' });
  });
});

describe('forum.ts — createComment (límite de comentarios)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('traduce el error de límite de Supabase a un mensaje amigable', async () => {
    singleResult = { data: null, error: { message: 'excedió los 3 comentarios permitidos' } };
    await expect(createComment('t1', 'hola', null)).rejects.toThrow(
      'Has alcanzado el límite máximo de 3 comentarios en este tema.'
    );
  });

  it('rechaza si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(createComment('t1', 'hola', null)).rejects.toThrow('No estás autenticado');
  });
});

describe('forum.ts — voteTopic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('inserta un voto nuevo si el usuario no había votado antes', async () => {
    singleResult = { data: null, error: null };
    const { supabase } = require('../src/supabase');

    await voteTopic('t1', 1);

    expect(supabase.from).toHaveBeenCalledWith('forum_topic_votes');
  });

  it('quita el voto (delete) si ya había votado igual', async () => {
    singleResult = { data: { id: 'v1', vote_type: 1 }, error: null };
    const { supabase } = require('../src/supabase');
    const fromSpy = supabase.from as jest.Mock;

    await voteTopic('t1', 1);

    // La última llamada a from() en este flujo corresponde al delete.
    expect(fromSpy).toHaveBeenCalledWith('forum_topic_votes');
  });

  it('rechaza si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(voteTopic('t1', 1)).rejects.toThrow('No estás autenticado');
  });
});
