import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, InteractionManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';
import { supabase } from '../supabase';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { fetchTopics, fetchComments, createTopic, updateTopic, voteTopic, createComment, deleteTopic, deleteComment, getCachedTopics, saveCachedTopics, ForumTopic, ForumComment } from '../utils/forum';

interface ForumModalProps { visible: boolean; onClose: () => void; openTopicId?: string | null; openCommentId?: string | null; notificationMode?: boolean; }

export default function ForumModal({ visible, onClose, openTopicId, openCommentId, notificationMode = false }: ForumModalProps) {
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
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
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

      if (asset.fileSize && asset.fileSize > 2097152) {
        showAlert('Error', 'La imagen excede los 2MB permitidos.');
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

    // Limpiamos el input al toque, como cualquier chat: se siente instantáneo
    // aunque el envío real todavía esté en curso.
    setNewComment('');
    setNewCommentImg(null);
    setLoading(true);

    try {
      const saved = await createComment(selectedTopic.id, contentToSend, imgToSend);

      // El insert ya nos devuelve la fila real (con id definitivo). En vez
      // de volver a pedir TODOS los comentarios del tema, simplemente lo
      // agregamos a la lista que ya tenemos.
      setComments(prev => [
        ...prev,
        { ...(saved as ForumComment), profiles: { full_name: currentUser?.user_metadata?.full_name || 'Tú' } },
      ]);

      // Reconciliación silenciosa en segundo plano (para corregir el nombre
      // de perfil real si difiere, sin bloquear ni recargar visualmente).
      void (async () => {
        try {
          const data = await fetchComments(selectedTopic.id);
          setComments(data);
        } catch {
          // Si falla, dejamos el comentario optimista tal cual está.
        }
      })();
    } catch (e: any) {
      // Si falló el envío, devolvemos el texto al input para que no se pierda.
      setNewComment(contentToSend);
      setNewCommentImg(imgToSend);
      showAlert('Error', e.message || 'No se pudo enviar el comentario.');
    } finally {
      setLoading(false);
    }
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

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(\*.*?\*)/g);

    return (
      <Text style={styles.msgText}>
        {parts.map((part, index) => (part.startsWith('*') && part.endsWith('*') && part.length > 2) ? (
          <Text key={index} style={{ fontWeight: 'bold' }}>{part.substring(1, part.length - 1)}</Text>
        ) : (<Text key={index}>{part}</Text>))}
      </Text>
    );
  };

  const isAdmin = currentUser?.email === 'ovilla@comagro.com.py';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => {
      if (notificationMode) {
        setView('list');
        resetForm();
        onClose();
        return;
      }
      if (view === 'topic' || view === 'create') {
        setView('list');
        resetForm();
      } else {
        onClose();
      }
    }}>
      <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            if (notificationMode) {
              setView('list');
              resetForm();
              onClose();
              return;
            }

            if (view === 'topic' || view === 'create') {
              setView('list');
              resetForm();
            } else {
              onClose();
            }
          }}>
            <SvgIcon name="arrow-left" size={24} color={COLORS.navy} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{view === 'list' ? 'Sugerencias' : view === 'create' ? editingTopicId ? 'Editar Tema' : 'Crear Tema' : 'Hilo'}</Text>

          {view === 'list' ? (
            <TouchableOpacity onPress={() => {
              const myTopicsCount = topics.filter(t => t.user_id === currentUser?.id).length;
              if (myTopicsCount >= 2 && !isAdmin) {
                showAlert('Límite Alcanzado', 'Llegaste al límite de 2 temas. Si querés publicar algo nuevo, por favor borrá uno anterior.');
              } else {
                resetForm();
                setView('create');
              }
            }} style={styles.headerActionBtn}>
              <SvgIcon name="plus" size={24} color={topics.filter(t => t.user_id === currentUser?.id).length >= 2 && !isAdmin ? COLORS.gray3 : COLORS.navy} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {view === 'list' && (
          <FlatList
            data={topics}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            refreshing={refreshing}
            onRefresh={() => loadTopics(true)}
            ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No hay sugerencias aún. ¡Crea la primera!</Text> : <ActivityIndicator size="large" color={COLORS.green} style={{ marginTop: 40 }} />}
            renderItem={({ item }) => {
              const isOwner = currentUser?.id === item.user_id;

              return (
                <TouchableOpacity style={styles.topicCard} onPress={() => openTopic(item)}>
                  <View style={styles.topicHeader}>
                    <View style={styles.authorRow}>
                      <View style={styles.avatar}><Text style={styles.avatarText}>{item.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}</Text></View>
                      <Text style={styles.authorName}>{item.profiles?.full_name || 'Usuario'}</Text>
                    </View>

                    <View style={styles.topicActions}>
                      {isOwner && (
                        <TouchableOpacity style={{ padding: 5 }} onPress={() => handleEditTopic(item)}>
                          <SvgIcon name="edit" size={16} color={COLORS.navy} />
                        </TouchableOpacity>
                      )}

                      {(isOwner || isAdmin) && (
                        <TouchableOpacity style={{ padding: 5 }} onPress={() => handleDeleteTopic(item.id)}>
                          <SvgIcon name="trash" size={16} color={COLORS.gray3} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <Text style={styles.topicTitle}>{item.title}</Text>
                  <Text style={styles.topicDesc} numberOfLines={2}>{item.description}</Text>
                  {item.image_url && <Text style={styles.hasAttachmentText}>📎 Contiene imagen</Text>}

                  <View style={styles.votesRow}>
                    <TouchableOpacity onPress={() => handleVote(item.id, 1)} style={styles.voteBtn}>
                      <SvgIcon name="thumbs-up" size={16} color={item.userVote === 1 ? COLORS.green : COLORS.navy} />
                      <Text style={[styles.voteText, item.userVote === 1 && styles.voteActive]}>{item.upvotes || 0}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => handleVote(item.id, -1)} style={styles.voteBtn}>
                      <SvgIcon name="thumbs-down" size={16} color={item.userVote === -1 ? '#D32F2F' : COLORS.navy} />
                      <Text style={[styles.voteText, item.userVote === -1 && styles.voteActive]}>{item.downvotes || 0}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {view === 'create' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.createContainer}>
              <Text style={styles.label}>Título del Tema</Text>
              <TextInput style={styles.input} value={newTopicTitle} onChangeText={setNewTopicTitle} placeholder="Ej. Mejorar el filtro de calculadoras" placeholderTextColor={COLORS.gray1} maxLength={100} />

              <Text style={styles.label}>Descripción (máx 450 caracteres)</Text>
              <TextInput style={[styles.input, styles.textArea]} value={newTopicDesc} onChangeText={setNewTopicDesc} placeholder="Explica tu sugerencia... (usa *texto* para negrita)" placeholderTextColor={COLORS.gray1} multiline maxLength={450} textAlignVertical="top" />

              <View style={styles.imgPickerRow}>
                <TouchableOpacity style={styles.imgPickerBtn} onPress={() => pickImage(setNewTopicImg)}>
                  <SvgIcon name="camera" size={20} color={COLORS.navy} />
                  <Text style={styles.imgPickerTxt}>{newTopicImg ? 'Cambiar Foto' : 'Adjuntar Foto'}</Text>
                </TouchableOpacity>

                {newTopicImg && (
                  <View style={styles.imgPreviewCont}>
                    <Image source={{ uri: newTopicImg }} style={styles.imgPreview} />
                    <TouchableOpacity style={styles.imgRemoveBtn} onPress={() => setNewTopicImg(null)}>
                      <Text style={styles.imgRemoveTxt}>X</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateOrUpdateTopic} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnTxt}>{editingTopicId ? 'Guardar Cambios' : 'Publicar Sugerencia'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {view === 'topic' && selectedTopic && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <FlatList
              ref={commentsListRef}
              data={comments}
              keyExtractor={item => item.id}
              onScrollToIndexFailed={info => {
                setTimeout(() => {
                  commentsListRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: true });
                }, 250);
              }}
              contentContainerStyle={styles.threadContainer}
              ListHeaderComponent={
                <View style={styles.opCard}>
                  <View style={styles.topicHeader}>
                    <View style={styles.authorRow}>
                      <View style={styles.avatar}><Text style={styles.avatarText}>{selectedTopic.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}</Text></View>
                      <Text style={styles.authorName}>{selectedTopic.profiles?.full_name || 'Usuario'}</Text>
                    </View>

                    <View style={styles.topicActions}>
                      {currentUser?.id === selectedTopic.user_id && (
                        <TouchableOpacity style={{ padding: 5 }} onPress={() => handleEditTopic(selectedTopic)}>
                          <SvgIcon name="edit" size={16} color={COLORS.navy} />
                        </TouchableOpacity>
                      )}

                      {(currentUser?.id === selectedTopic.user_id || isAdmin) && (
                        <TouchableOpacity style={{ padding: 5 }} onPress={() => handleDeleteTopic(selectedTopic.id)}>
                          <SvgIcon name="trash" size={16} color={COLORS.gray3} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <Text style={styles.topicTitle}>{selectedTopic.title}</Text>
                  {renderFormattedText(selectedTopic.description)}
                  {selectedTopic.image_url && <Image source={{ uri: selectedTopic.image_url }} style={styles.msgImgFull} resizeMode="contain" />}

                  <View style={styles.votesRow}>
                    <TouchableOpacity onPress={() => handleVote(selectedTopic.id, 1)} style={styles.voteBtn}>
                      <SvgIcon name="thumbs-up" size={16} color={selectedTopic.userVote === 1 ? COLORS.green : COLORS.navy} />
                      <Text style={[styles.voteText, selectedTopic.userVote === 1 && styles.voteActive]}>{selectedTopic.upvotes || 0}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => handleVote(selectedTopic.id, -1)} style={styles.voteBtn}>
                      <SvgIcon name="thumbs-down" size={16} color={selectedTopic.userVote === -1 ? '#D32F2F' : COLORS.navy} />
                      <Text style={[styles.voteText, selectedTopic.userVote === -1 && styles.voteActive]}>{selectedTopic.downvotes || 0}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.separator} />
                  <Text style={styles.commentsTitle}>Comentarios</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isOwner = currentUser?.id === item.user_id;

                return (
                  <View style={styles.commentCard}>
                    <View style={styles.topicHeader}>
                      <View style={styles.authorRow}>
                        <View style={[styles.avatar, { width: 24, height: 24, borderRadius: 12 }]}>
                          <Text style={[styles.avatarText, { fontSize: 12 }]}>{item.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}</Text>
                        </View>
                        <Text style={styles.commentAuthorName}>{item.profiles?.full_name || 'Usuario'}</Text>
                      </View>

                      {(isOwner || isAdmin) && (
                        <TouchableOpacity style={{ padding: 5 }} onPress={() => {
                          showAlert('Confirmar', '¿Borrar comentario?', [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                              text: 'Borrar',
                              style: 'destructive',
                              onPress: async () => {
                                const previousComments = comments;
                                setComments(prev => prev.filter(c => c.id !== item.id));

                                try {
                                  await deleteComment(item.id);
                                } catch {
                                  setComments(previousComments);
                                  showAlert('Error', 'No se pudo borrar el comentario.');
                                }
                              }
                            }
                          ]);
                        }}>
                          <SvgIcon name="trash" size={14} color={COLORS.gray3} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {renderFormattedText(item.content)}
                    {item.image_url && <Image source={{ uri: item.image_url }} style={styles.msgImgSmall} resizeMode="cover" />}
                  </View>
                );
              }}
            />

            <View style={styles.commentInputBox}>
              {newCommentImg && (
                <View style={styles.imgPreviewContSmall}>
                  <Image source={{ uri: newCommentImg }} style={styles.imgPreviewSmall} />
                  <TouchableOpacity style={styles.imgRemoveBtnSmall} onPress={() => setNewCommentImg(null)}>
                    <Text style={styles.imgRemoveTxtSmall}>X</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.commentInputRow}>
                {(() => {
                  const myCommentsCount = comments.filter(c => c.user_id === currentUser?.id).length;
                  const limitReached = myCommentsCount >= 3 && !isAdmin;
                  
                  return (
                    <>
                      <TouchableOpacity onPress={() => !limitReached && pickImage(setNewCommentImg)} style={[styles.attachBtn, limitReached && { opacity: 0.5 }]} disabled={limitReached}>
                        <SvgIcon name="camera" size={20} color={COLORS.gray1} />
                      </TouchableOpacity>

                      <TextInput 
                        style={[styles.commentInput, limitReached && { backgroundColor: COLORS.border, color: COLORS.gray1 }]} 
                        value={newComment} 
                        onChangeText={setNewComment} 
                        placeholder={limitReached ? "Alcanzaste el límite de 3 comentarios aquí" : "Escribe tu opinión..."} 
                        placeholderTextColor={limitReached ? COLORS.gray3 : COLORS.gray1} 
                        maxLength={450} 
                        multiline 
                        editable={!limitReached}
                      />

                      <TouchableOpacity onPress={handleCreateComment} disabled={loading || (!newComment.trim() && !newCommentImg) || limitReached} style={[styles.sendBtn, limitReached && { backgroundColor: COLORS.gray3 }]}>
                        {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : <SvgIcon name="arrow-right" size={20} color={COLORS.white} />}
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontFamily: FONTS.heading, fontSize: 18, color: COLORS.navy, fontWeight: 'bold' },
  backBtn: { padding: 5 }, headerActionBtn: { padding: 5 }, listContainer: { padding: 15 },
  emptyText: { textAlign: 'center', marginTop: 40, fontFamily: FONTS.body, color: COLORS.gray1 },
  topicCard: { backgroundColor: COLORS.white, padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: COLORS.border },
  topicHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { color: COLORS.white, fontFamily: FONTS.heading, fontWeight: 'bold', fontSize: 14 },
  authorName: { fontFamily: FONTS.body, color: COLORS.gray1, fontSize: 14 },
  topicActions: { flexDirection: 'row', alignItems: 'center' },
  topicTitle: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: 'bold', color: COLORS.navy, marginBottom: 5 },
  topicDesc: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray1, lineHeight: 20 },
  hasAttachmentText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.green, marginTop: 10 },
  votesRow: { flexDirection: 'row', marginTop: 15, gap: 15 },
  voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: COLORS.bg, borderRadius: 8 },
  voteText: { fontSize: 14, color: COLORS.navy, opacity: 0.7 }, voteActive: { opacity: 1, fontWeight: 'bold', color: COLORS.navy },
  createContainer: { padding: 20 },
  label: { fontFamily: FONTS.heading, fontSize: 14, color: COLORS.navy, fontWeight: 'bold', marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 15, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy },
  textArea: { height: 120 }, imgPickerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 30 },
  imgPickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 8 },
  imgPickerTxt: { marginLeft: 8, fontFamily: FONTS.body, fontSize: 14, color: COLORS.navy },
  imgPreviewCont: { marginLeft: 15, position: 'relative' }, imgPreview: { width: 60, height: 60, borderRadius: 8 },
  imgRemoveBtn: { position: 'absolute', top: -10, right: -10, backgroundColor: 'red', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  imgRemoveTxt: { color: 'white', fontWeight: 'bold', fontSize: 12, textAlign: 'center' },
  submitBtn: { backgroundColor: COLORS.green, padding: 15, borderRadius: 8, alignItems: 'center' },
  submitBtnTxt: { color: COLORS.white, fontFamily: FONTS.heading, fontWeight: 'bold', fontSize: 16 },
  threadContainer: { padding: 15, paddingBottom: 40 },
  opCard: { backgroundColor: COLORS.white, padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  msgText: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.navy, lineHeight: 22, marginTop: 10 },
  msgImgFull: { width: '100%', height: 200, marginTop: 15, borderRadius: 8 },
  separator: { height: 1, backgroundColor: COLORS.border, marginVertical: 15 },
  commentsTitle: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: 'bold', color: COLORS.navy, marginBottom: 15 },
  commentCard: { backgroundColor: COLORS.white, padding: 15, borderRadius: 12, marginBottom: 10, marginLeft: 20, borderWidth: 1, borderColor: COLORS.border },
  commentAuthorName: { fontFamily: FONTS.body, color: COLORS.gray1, fontSize: 13 },
  msgImgSmall: { width: 100, height: 100, marginTop: 10, borderRadius: 8 },
  commentInputBox: { backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border, padding: 10 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center' }, attachBtn: { padding: 10 },
  commentInput: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, minHeight: 40, maxHeight: 100, fontFamily: FONTS.body, color: COLORS.navy },
  sendBtn: { backgroundColor: COLORS.green, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  imgPreviewContSmall: { position: 'relative', width: 60, height: 60, marginBottom: 10, marginLeft: 50 },
  imgPreviewSmall: { width: 60, height: 60, borderRadius: 8 },
  imgRemoveBtnSmall: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  imgRemoveTxtSmall: { color: 'white', fontWeight: 'bold', fontSize: 10, lineHeight: 10, textAlign: 'center' }
});