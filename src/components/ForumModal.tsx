import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import SvgIcon from './SvgIcon';
import { useCustomAlert } from '../contexts/CustomAlertContext';
import { useForumModalLogic } from '../hooks/useForumModalLogic';
import { styles } from './forum/ForumStyles';
import ForumTopicList from './forum/ForumTopicList';
import ForumCreateTopic from './forum/ForumCreateTopic';
import ForumTopicThread from './forum/ForumTopicThread';

interface ForumModalProps { visible: boolean; onClose: () => void; openTopicId?: string | null; openCommentId?: string | null; notificationMode?: boolean; }

export default function ForumModal({ visible, onClose, openTopicId, openCommentId, notificationMode = false }: ForumModalProps) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();

  const {
    topics, loading, refreshing,
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
  } = useForumModalLogic({ visible, openTopicId, openCommentId, notificationMode, showAlert });

  const goBackOrClose = () => {
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
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBackOrClose}>
      <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={goBackOrClose}>
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
          <ForumTopicList
            topics={topics}
            loading={loading}
            refreshing={refreshing}
            currentUser={currentUser}
            isAdmin={isAdmin}
            onRefresh={() => loadTopics(true)}
            onOpenTopic={openTopic}
            onEditTopic={handleEditTopic}
            onDeleteTopic={handleDeleteTopic}
            onVote={handleVote}
          />
        )}

        {view === 'create' && (
          <ForumCreateTopic
            newTopicTitle={newTopicTitle}
            setNewTopicTitle={setNewTopicTitle}
            newTopicDesc={newTopicDesc}
            setNewTopicDesc={setNewTopicDesc}
            newTopicImg={newTopicImg}
            setNewTopicImg={setNewTopicImg}
            editingTopicId={editingTopicId}
            loading={loading}
            onPickImage={pickImage}
            onSubmit={handleCreateOrUpdateTopic}
          />
        )}

        {view === 'topic' && selectedTopic && (
          <ForumTopicThread
            selectedTopic={selectedTopic}
            comments={comments}
            commentsListRef={commentsListRef}
            currentUser={currentUser}
            isAdmin={isAdmin}
            loading={loading}
            newComment={newComment}
            setNewComment={setNewComment}
            newCommentImg={newCommentImg}
            setNewCommentImg={setNewCommentImg}
            onVote={handleVote}
            onEditTopic={handleEditTopic}
            onDeleteTopic={handleDeleteTopic}
            onDeleteComment={handleDeleteComment}
            onPickImage={pickImage}
            onCreateComment={handleCreateComment}
          />
        )}
      </View>
    </Modal>
  );
}
