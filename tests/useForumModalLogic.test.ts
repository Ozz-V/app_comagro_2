import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useForumModalLogic } from '../src/hooks/useForumModalLogic';
import * as forum from '../src/utils/forum';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
const mockChannel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() };

jest.mock('../src/supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}));

jest.mock('../src/utils/forum', () => ({
  fetchTopics: jest.fn(),
  fetchComments: jest.fn(),
  createTopic: jest.fn(),
  updateTopic: jest.fn(),
  voteTopic: jest.fn(),
  createComment: jest.fn(),
  deleteTopic: jest.fn(),
  deleteComment: jest.fn(),
  getCachedTopics: jest.fn(),
  saveCachedTopics: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

const topicA = {
  id: 't1', user_id: 'u1', title: 'Tema A', description: 'Desc A',
  image_url: null, created_at: '2026-01-01', upvotes: 2, downvotes: 0, userVote: null,
};
const topicB = {
  id: 't2', user_id: 'u2', title: 'Tema B', description: 'Desc B',
  image_url: null, created_at: '2026-01-02', upvotes: 0, downvotes: 0, userVote: null,
};

const showAlert = jest.fn();

describe('useForumModalLogic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    (forum.getCachedTopics as jest.Mock).mockResolvedValue([]);
    (forum.fetchTopics as jest.Mock).mockResolvedValue([]);
    (forum.saveCachedTopics as jest.Mock).mockResolvedValue(undefined);
  });

  // ── loadTopics ─────────────────────────────────────────────────────
  describe('loadTopics (vía visible + view=list)', () => {
    it('usa la caché primero y luego reemplaza si el fetch trae datos distintos', async () => {
      (forum.getCachedTopics as jest.Mock).mockResolvedValue([topicA]);
      (forum.fetchTopics as jest.Mock).mockResolvedValue([topicA, topicB]);

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await waitFor(() => expect(result.current.topics).toEqual([topicA, topicB]));
      expect(forum.saveCachedTopics).toHaveBeenCalledWith([topicA, topicB]);
    });

    it('no vuelve a guardar en caché si el fetch trae lo mismo que ya estaba cacheado', async () => {
      (forum.getCachedTopics as jest.Mock).mockResolvedValue([topicA]);
      (forum.fetchTopics as jest.Mock).mockResolvedValue([topicA]);

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await waitFor(() => expect(result.current.topics).toEqual([topicA]));
      expect(forum.saveCachedTopics).not.toHaveBeenCalled();
    });

    it('muestra alerta de error solo si no había caché', async () => {
      (forum.getCachedTopics as jest.Mock).mockResolvedValue([]);
      (forum.fetchTopics as jest.Mock).mockRejectedValue(new Error('red caída'));

      renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await waitFor(() => expect(showAlert).toHaveBeenCalledWith('Error', 'No se pudieron cargar las sugerencias.'));
    });

    it('NO muestra alerta si el fetch falla pero ya había caché mostrada', async () => {
      (forum.getCachedTopics as jest.Mock).mockResolvedValue([topicA]);
      (forum.fetchTopics as jest.Mock).mockRejectedValue(new Error('red caída'));

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await waitFor(() => expect(result.current.topics).toEqual([topicA]));
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('no dispara loadTopics si visible es false', async () => {
      renderHook(() => useForumModalLogic({ visible: false, showAlert }));
      await Promise.resolve();
      expect(forum.getCachedTopics).not.toHaveBeenCalled();
    });
  });

  // ── openTopic / loadComments ────────────────────────────────────────
  describe('openTopic', () => {
    it('cambia a vista "topic" y carga comentarios del tema', async () => {
      (forum.fetchComments as jest.Mock).mockResolvedValue([]);
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        result.current.openTopic(topicA);
      });

      expect(result.current.view).toBe('topic');
      expect(result.current.selectedTopic).toEqual(topicA);
      expect(forum.fetchComments).toHaveBeenCalledWith('t1');
    });

    it('muestra alerta si falla la carga de comentarios', async () => {
      (forum.fetchComments as jest.Mock).mockRejectedValue(new Error('fail'));
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        result.current.openTopic(topicA);
      });

      expect(showAlert).toHaveBeenCalledWith('Error', 'No se pudieron cargar los comentarios.');
    });
  });

  // ── handleCreateOrUpdateTopic ───────────────────────────────────────
  describe('handleCreateOrUpdateTopic', () => {
    it('avisa si falta título o descripción y no llama a createTopic', async () => {
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        await result.current.handleCreateOrUpdateTopic();
      });

      expect(showAlert).toHaveBeenCalledWith('Aviso', 'El título y descripción son requeridos.');
      expect(forum.createTopic).not.toHaveBeenCalled();
    });

    it('crea un tema nuevo, refresca la lista y vuelve a la vista "list"', async () => {
      (forum.createTopic as jest.Mock).mockResolvedValue(undefined);
      (forum.fetchTopics as jest.Mock).mockResolvedValue([topicA]);

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(() => {
        result.current.setNewTopicTitle('Nuevo tema');
        result.current.setNewTopicDesc('Una descripción');
      });

      await act(async () => {
        await result.current.handleCreateOrUpdateTopic();
      });

      expect(forum.createTopic).toHaveBeenCalledWith('Nuevo tema', 'Una descripción', null);
      expect(result.current.view).toBe('list');
      expect(result.current.newTopicTitle).toBe('');
    });

    it('actualiza un tema existente cuando hay editingTopicId', async () => {
      (forum.updateTopic as jest.Mock).mockResolvedValue(undefined);
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(() => {
        result.current.handleEditTopic(topicA);
      });
      expect(result.current.editingTopicId).toBe('t1');
      expect(result.current.view).toBe('create');

      await act(async () => {
        await result.current.handleCreateOrUpdateTopic();
      });

      expect(forum.updateTopic).toHaveBeenCalledWith('t1', 'Tema A', 'Desc A', null);
      expect(forum.createTopic).not.toHaveBeenCalled();
    });

    it('muestra el mensaje de error del backend si falla el guardado', async () => {
      (forum.createTopic as jest.Mock).mockRejectedValue(new Error('permiso denegado'));
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(() => {
        result.current.setNewTopicTitle('X');
        result.current.setNewTopicDesc('Y');
      });

      await act(async () => {
        await result.current.handleCreateOrUpdateTopic();
      });

      expect(showAlert).toHaveBeenCalledWith('Error', 'permiso denegado');
    });
  });

  // ── handleCreateComment (optimista) ──────────────────────────────────
  describe('handleCreateComment', () => {
    it('no hace nada si no hay tema seleccionado o el comentario está vacío', async () => {
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        await result.current.handleCreateComment();
      });

      expect(forum.createComment).not.toHaveBeenCalled();
      expect(result.current.comments).toEqual([]);
    });

    it('agrega el comentario de forma optimista y luego lo confirma con el id real', async () => {
      (forum.fetchComments as jest.Mock).mockResolvedValue([]);
      (forum.createComment as jest.Mock).mockResolvedValue({ id: 'real-id' });

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        result.current.openTopic(topicA);
      });

      await act(() => {
        result.current.setNewComment('Hola foro');
      });

      await act(async () => {
        await result.current.handleCreateComment();
      });

      // El input se limpia de inmediato
      expect(result.current.newComment).toBe('');
      await waitFor(() => {
        expect(result.current.comments.some(c => c.id === 'real-id')).toBe(true);
      });
      expect(result.current.comments.some(c => c.content === 'Hola foro')).toBe(true);
    });
  });

  // ── handleDeleteTopic / handleDeleteComment (confirmación) ───────────
  describe('handleDeleteTopic', () => {
    it('pide confirmación antes de borrar, y borra al confirmar', async () => {
      (forum.deleteTopic as jest.Mock).mockResolvedValue(undefined);
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(() => {
        result.current.handleDeleteTopic('t1');
      });

      expect(showAlert).toHaveBeenCalledWith('Confirmar', '¿Borrar este tema?', expect.any(Array));
      const buttons = showAlert.mock.calls[0][2];
      const confirmar = buttons.find((b: any) => b.text === 'Borrar');

      await act(async () => {
        await confirmar.onPress();
      });

      expect(forum.deleteTopic).toHaveBeenCalledWith('t1');
    });

    it('revierte y avisa si el borrado falla (sin permisos)', async () => {
      (forum.getCachedTopics as jest.Mock).mockResolvedValue([topicA, topicB]);
      (forum.fetchTopics as jest.Mock).mockResolvedValue([topicA, topicB]);
      (forum.deleteTopic as jest.Mock).mockRejectedValue(new Error('sin permiso'));

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));
      await waitFor(() => expect(result.current.topics).toEqual([topicA, topicB]));

      await act(() => {
        result.current.handleDeleteTopic('t1');
      });
      const buttons = showAlert.mock.calls.find(c => c[1] === '¿Borrar este tema?')![2];
      const confirmar = buttons.find((b: any) => b.text === 'Borrar');

      await act(async () => {
        await confirmar.onPress();
      });

      expect(result.current.topics).toEqual([topicA, topicB]);
      expect(showAlert).toHaveBeenCalledWith('Error', 'No tienes permisos para borrar este tema.');
    });
  });

  // ── handleVote (optimista con reversión) ─────────────────────────────
  describe('handleVote', () => {
    it('suma el voto de forma optimista y lo confirma con el servidor', async () => {
      (forum.getCachedTopics as jest.Mock).mockResolvedValue([topicA]);
      (forum.fetchTopics as jest.Mock).mockResolvedValue([topicA]);
      (forum.voteTopic as jest.Mock).mockResolvedValue(undefined);

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));
      await waitFor(() => expect(result.current.topics).toEqual([topicA]));

      // A partir de acá, la reconciliación en segundo plano (fetchTopics)
      // debe reflejar el voto ya aplicado en el servidor; si devolviera el
      // topic viejo, pisaría el valor optimista, que es un caso real que
      // el hook acepta (últim dato del servidor manda).
      (forum.fetchTopics as jest.Mock).mockResolvedValue([{ ...topicA, upvotes: 3, userVote: 1 }]);

      await act(async () => {
        await result.current.handleVote('t1', 1);
      });

      expect(result.current.topics[0].upvotes).toBe(3);
      expect(result.current.topics[0].userVote).toBe(1);
      expect(forum.voteTopic).toHaveBeenCalledWith('t1', 1);
    });

    it('revierte el voto optimista si el servidor rechaza el voto', async () => {
      (forum.getCachedTopics as jest.Mock).mockResolvedValue([topicA]);
      (forum.fetchTopics as jest.Mock).mockResolvedValue([topicA]);
      (forum.voteTopic as jest.Mock).mockRejectedValue(new Error('rechazado'));

      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));
      await waitFor(() => expect(result.current.topics).toEqual([topicA]));

      await act(async () => {
        await result.current.handleVote('t1', 1);
      });

      expect(result.current.topics[0].upvotes).toBe(2);
      expect(result.current.topics[0].userVote).toBeNull();
      expect(showAlert).toHaveBeenCalledWith('Error', 'No se pudo registrar tu voto.');
    });

    it('no hace nada si el tema no existe en la lista actual', async () => {
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        await result.current.handleVote('inexistente', 1);
      });

      expect(forum.voteTopic).not.toHaveBeenCalled();
    });
  });

  // ── pickImage ─────────────────────────────────────────────────────
  describe('pickImage', () => {
    it('no hace nada si el usuario cancela el selector', async () => {
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true });
      const setImg = jest.fn();
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        await result.current.pickImage(setImg);
      });

      expect(setImg).not.toHaveBeenCalled();
    });

    it('setea la imagen si el tamaño es aceptable', async () => {
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://foto.jpg', fileSize: 500000 }],
      });
      const setImg = jest.fn();
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        await result.current.pickImage(setImg);
      });

      expect(setImg).toHaveBeenCalledWith('file://foto.jpg');
    });

    it('avisa y no setea la imagen si pesa más de 1 MB', async () => {
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://foto.jpg', fileSize: 2 * 1048576 }],
      });
      const setImg = jest.fn();
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        await result.current.pickImage(setImg);
      });

      expect(showAlert).toHaveBeenCalledWith('Imagen muy grande', 'La imagen debe pesar menos de 1 MB para subirla.');
      expect(setImg).not.toHaveBeenCalled();
    });

    it('si fileSize no viene, lo busca con FileSystem.getInfoAsync', async () => {
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://foto.jpg', fileSize: undefined }],
      });
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 300000 });
      const setImg = jest.fn();
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await act(async () => {
        await result.current.pickImage(setImg);
      });

      expect(setImg).toHaveBeenCalledWith('file://foto.jpg');
    });
  });

  // ── isAdmin ─────────────────────────────────────────────────────────
  describe('isAdmin', () => {
    it('es true solo para el email de administrador', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ovilla@comagro.com.py' } } });
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await waitFor(() => expect(result.current.currentUser?.email).toBe('ovilla@comagro.com.py'));
      expect(result.current.isAdmin).toBe(true);
    });

    it('es false para cualquier otro usuario', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'vendedor@comagro.com.py' } } });
      const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

      await waitFor(() => expect(result.current.currentUser?.email).toBe('vendedor@comagro.com.py'));
      expect(result.current.isAdmin).toBe(false);
    });
  });

  // ── resetForm ─────────────────────────────────────────────────────
  it('resetForm limpia todos los campos del formulario de tema', async () => {
    const { result } = await renderHook(() => useForumModalLogic({ visible: true, showAlert }));

    await act(() => {
      result.current.handleEditTopic(topicA);
    });
    expect(result.current.newTopicTitle).toBe('Tema A');

    await act(() => {
      result.current.resetForm();
    });

    expect(result.current.editingTopicId).toBeNull();
    expect(result.current.newTopicTitle).toBe('');
    expect(result.current.newTopicDesc).toBe('');
    expect(result.current.newTopicImg).toBeNull();
  });
});
