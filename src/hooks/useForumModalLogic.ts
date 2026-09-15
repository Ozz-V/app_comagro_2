import { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { FlatList, InteractionManager } from 'react-native';
import { supabase } from '../supabase';
import { fetchTopics, fetchComments, createTopic, updateTopic, voteTopic, createComment, deleteTopic, deleteComment, getCachedTopics, saveCachedTopics, ForumTopic, ForumComment } from '../utils/forum';

interface Params {
  visible: boolean;
  openTopicId?: string | null;
  openCommentId?: string | null;
  notificationMode?: boolean;
  showAlert: (title: string, message: string, buttons?: any[]) => void;
}

export function useForumModalLogic({ visible, openTopicId, openCommentId, notificationMode = false, showAlert }: Params) {
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'topic' | 'create'>('list');
  const [selectedTopic, setSelectedTopic] = useState<ForumTopic | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [newTopicImg, setNewTopicImg] = useState<string | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [newCommentImg, setNewCommentImg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const commentsListRef = useRef<FlatList<ForumComment>>(null);
  const syncInProgressRef = useRef(false);
  const lastOpenedNotificationRef = useRef<string | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user)); }, []);

  const applyTopics = async (data: ForumTopic[]) => {
    setTopics(data);
    await saveCachedTopics(data);
  };

  const loadTopics = async (isBackground = false) => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;

    let hasCache = false;

    try {
      const cached = await getCachedTopics();

      if (cached.length > 0) {
        hasCache = true;
        setTopics(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      // Silent fetch
      const data = await fetchTopics();

      if (JSON.stringify(data) !== JSON.stringify(cached)) {
        await applyTopics(data);
      }
    } catch (e: any) {
      if (!hasCache) {
        showAlert('Error', 'No se pudieron cargar las sugerencias.');
      }
    } finally {
      syncInProgressRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!visible || view !== 'list') return;
    loadTopics();
  }, [visible, view]);

  useEffect(() => {
    if (!visible) return;

    let active = true;

    const syncFromRealtime = async () => {
      if (!active || syncInProgressRef.current) return;

      try {
        const data = await fetchTopics();

        if (!active) return;

        await applyTopics(data);

        if (selectedTopic && data.some(topic => topic.id === selectedTopic.id)) {
          const refreshed = data.find(topic => topic.id === selectedTopic.id);
          if (refreshed) setSelectedTopic(refreshed);
        } else if (selectedTopic) {
          setSelectedTopic(null);
          setView('list');
        }
      } catch {}
    };

    const channel = supabase.channel('forum-topics-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics' }, () => void syncFromRealtime())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topic_votes' }, () => void syncFromRealtime())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [visible, selectedTopic?.id]);

  useEffect(() => {
    if (!visible) {
      lastOpenedNotificationRef.current = null;
      return;
    }

    if (!openTopicId || view !== 'list' || loading) return;

    const key = `${openTopicId}:${openCommentId || ''}`;

    if (lastOpenedNotificationRef.current === key) return;

    const found = topics.find(t => t.id === openTopicId);

    if (!found) return;

    lastOpenedNotificationRef.current = key;
    openTopic(found);
  }, [visible, openTopicId, openCommentId, topics, view, loading]);

  const loadComments = async (topicId: string) => {
    setLoading(true);

    try {
      const data = await fetchComments(topicId);
      setComments(data);

      if (notificationMode && openCommentId) {
        const index = data.findIndex(comment => comment.id === openCommentId);

        if (index >= 0) {
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              commentsListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
            }, 100);
          });
        }
      }
    } catch (e: any) {
      showAlert('Error', 'No se pudieron cargar los comentarios.');
    } finally {
      setLoading(false);
    }
  };

  const openTopic = (topic: ForumTopic) => {
    setSelectedTopic(topic);
    setView('topic');
    void loadComments(topic.id);
  };

  useEffect(() => {
    if (!visible || view !== 'topic' || !selectedTopic) return;

    let active = true;

    const syncCommentsFromRealtime = async () => {
      if (!active) return;

      try {
        const data = await fetchComments(selectedTopic.id);
        if (active) setComments(data);
      } catch {
        // Si falla la sincronización silenciosa, dejamos los comentarios
        // que ya se estaban mostrando; el próximo cambio lo va a intentar de nuevo.
      }
    };

    const channel = supabase.channel(`forum-comments-live-${selectedTopic.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_comments', filter: `topic_id=eq.${selectedTopic.id}` }, () => void syncCommentsFromRealtime())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [visible, view, selectedTopic?.id]);

  const pickImage = async (setImg: (uri: string | null) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];

      let imgSize = asset.fileSize;
      if (!imgSize) {
        try { const fi = await FileSystem.getInfoAsync(asset.uri); if (fi.exists) imgSize = (fi as any).size; } catch(e) {}
      }
      if (imgSize && imgSize > 1048576) {
        showAlert('Imagen muy grande', 'La imagen debe pesar menos de 1 MB para subirla.');
        return;
      }

      setImg(asset.uri);
    }
  };

  const handleCreateOrUpdateTopic = async () => {
    if (!newTopicTitle.trim() || !newTopicDesc.trim()) {
      showAlert('Aviso', 'El título y descripción son requeridos.');
      return;
    }

    setLoading(true);

    try {
      if (editingTopicId) {
        await updateTopic(editingTopicId, newTopicTitle.trim(), newTopicDesc.trim(), newTopicImg);
      } else {
        await createTopic(newTopicTitle.trim(), newTopicDesc.trim(), newTopicImg);
      }

      const data = await fetchTopics();
      await applyTopics(data);

      resetForm();
      setView('list');
    } catch (e: any) {
      showAlert('Error', e.message || 'No se pudo guardar el tema.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTopic = (topic: ForumTopic) => {
    setEditingTopicId(topic.id);
    setNewTopicTitle(topic.title);
    setNewTopicDesc(topic.description);
    setNewTopicImg(topic.image_url);
    setView('create');
  };

  const resetForm = () => {
    setEditingTopicId(null);
    setNewTopicTitle('');
    setNewTopicDesc('');
    setNewTopicImg(null);
  };

  const handleCreateComment = async () => {
    if (!selectedTopic || (!newComment.trim() && !newCommentImg)) return;

    const contentToSend = newComment.trim();
    const imgToSend = newCommentImg;

    // 0 ms — inyección optimista inmediata
    const tempId = `temp_${Date.now()}`;
    setComments(prev => [...prev, {
      id: tempId,
      topic_id: selectedTopic.id,
      user_id: currentUser?.id || '',
      content: contentToSend,
      image_url: imgToSend,
      created_at: new Date().toISOString(),
      profiles: {
        full_name: currentUser?.user_metadata?.full_name || 'Yo',
        avatar_url: currentUser?.user_metadata?.avatar_url,
      },
    }]);
    setNewComment('');
    setNewCommentImg(null);
    setTimeout(() => { commentsListRef.current?.scrollToEnd({ animated: true }); }, 100);

    // Sync silencioso en segundo plano
    (async () => {
      try {
        const saved = await createComment(selectedTopic.id, contentToSend, imgToSend);
        setComments(prev => prev.map(c =>
          c.id === tempId ? { ...c, id: (saved as ForumComment).id } : c
        ));
      } catch {
        // Silencioso — el comentario optimista ya está visible
      }
    })();
  };

  const handleDeleteComment = (commentId: string) => {
    showAlert('Confirmar', '¿Borrar comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const previousComments = comments;
          setComments(prev => prev.filter(c => c.id !== commentId));

          try {
            await deleteComment(commentId);
          } catch {
            setComments(previousComments);
            showAlert('Error', 'No se pudo borrar el comentario.');
          }
        }
      }
    ]);
  };

  const handleDeleteTopic = (id: string) => {
    showAlert('Confirmar', '¿Borrar este tema?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const previousTopics = topics;
          const updatedTopics = topics.filter(topic => topic.id !== id);

          setTopics(updatedTopics);
          await saveCachedTopics(updatedTopics);

          try {
            await deleteTopic(id);

            if (selectedTopic?.id === id) setSelectedTopic(null);
            if (view === 'topic') setView('list');

            const data = await fetchTopics();
            await applyTopics(data);
          } catch (e: any) {
            setTopics(previousTopics);
            await saveCachedTopics(previousTopics);
            showAlert('Error', 'No tienes permisos para borrar este tema.');
          }
        }
      }
    ]);
  };

  const handleVote = async (topicId: string, vote: 1 | -1) => {
    // Optimista: actualizamos la UI al instante con el mismo cálculo que
    // hace el servidor (alternar/cambiar/agregar voto), y recién después
    // avisamos al servidor. Si falla, revertimos.
    const target = topics.find(t => t.id === topicId) || (selectedTopic?.id === topicId ? selectedTopic : null);
    if (!target) return;

    const prevVote = target.userVote ?? null;
    let newUpvotes = target.upvotes || 0;
    let newDownvotes = target.downvotes || 0;
    let newUserVote: number | null;

    if (prevVote === vote) {
      newUserVote = null;
      if (vote === 1) newUpvotes -= 1; else newDownvotes -= 1;
    } else if (prevVote) {
      newUserVote = vote;
      if (vote === 1) { newUpvotes += 1; newDownvotes -= 1; } else { newDownvotes += 1; newUpvotes -= 1; }
    } else {
      newUserVote = vote;
      if (vote === 1) newUpvotes += 1; else newDownvotes += 1;
    }

    const applyLocal = (list: ForumTopic[]) =>
      list.map(t => t.id === topicId ? { ...t, upvotes: newUpvotes, downvotes: newDownvotes, userVote: newUserVote } : t);

    const previousTopics = topics;
    const previousSelected = selectedTopic;
    const optimisticTopics = applyLocal(topics);

    setTopics(optimisticTopics);
    if (selectedTopic?.id === topicId) {
      setSelectedTopic(prev => prev ? { ...prev, upvotes: newUpvotes, downvotes: newDownvotes, userVote: newUserVote } : prev);
    }
    await saveCachedTopics(optimisticTopics);

    try {
      await voteTopic(topicId, vote);

      // Reconciliamos con el servidor en segundo plano, sin bloquear la UI
      // (por si otro usuario votó al mismo tiempo).
      void (async () => {
        try {
          const data = await fetchTopics();
          await applyTopics(data);
          if (selectedTopic?.id === topicId) {
            const refreshed = data.find(t => t.id === topicId);
            if (refreshed) setSelectedTopic(refreshed);
          }
        } catch {
          // Si falla la reconciliación silenciosa, el valor optimista queda
          // igual; no interrumpimos al usuario por esto.
        }
      })();
    } catch (e: any) {
      setTopics(previousTopics);
      await saveCachedTopics(previousTopics);
      if (previousSelected?.id === topicId) setSelectedTopic(previousSelected);
      showAlert('Error', 'No se pudo registrar tu voto.');
    }
  };

  const isAdmin = currentUser?.email === 'ovilla@comagro.com.py';

  return {
    topics, loading, refreshing, setRefreshing,
    view, setView,
    selectedTopic,
    comments,
    newTopicTitle, setNewTopicTitle,
    newTopicDesc, setNewTopicDesc,
    newTopicImg, setNewTopicImg,
    editingTopicId,
    newComment, setNewComment,
    newCommentImg, setNewCommentImg,
    currentUser, isAdmin,
    commentsListRef,
    loadTopics,
    openTopic,
    pickImage,
    handleCreateOrUpdateTopic,
    handleEditTopic,
    resetForm,
    handleCreateComment,
    handleDeleteComment,
    handleDeleteTopic,
    handleVote,
  };
}
