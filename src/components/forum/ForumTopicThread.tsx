import React, { RefObject } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS } from '../../theme';
import SvgIcon from '../SvgIcon';
import { ForumTopic, ForumComment } from '../../utils/forum';
import { styles } from './ForumStyles';
import FormattedText from './FormattedText';

interface Props {
  selectedTopic: ForumTopic;
  comments: ForumComment[];
  commentsListRef: RefObject<FlatList<ForumComment> | null>;
  currentUser: any;
  isAdmin: boolean;
  loading: boolean;
  newComment: string;
  setNewComment: (v: string) => void;
  newCommentImg: string | null;
  setNewCommentImg: (v: string | null) => void;
  onVote: (topicId: string, vote: 1 | -1) => void;
  onEditTopic: (topic: ForumTopic) => void;
  onDeleteTopic: (id: string) => void;
  onDeleteComment: (commentId: string) => void;
  onPickImage: (setImg: (uri: string | null) => void) => void;
  onCreateComment: () => void;
}

export default function ForumTopicThread({
  selectedTopic, comments, commentsListRef, currentUser, isAdmin, loading,
  newComment, setNewComment, newCommentImg, setNewCommentImg,
  onVote, onEditTopic, onDeleteTopic, onDeleteComment, onPickImage, onCreateComment,
}: Props) {
  const myCommentsCount = comments.filter(c => c.user_id === currentUser?.id).length;
  const limitReached = myCommentsCount >= 3 && !isAdmin;

  return (
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
                {selectedTopic.profiles?.avatar_url ? (
                  <Image source={{ uri: selectedTopic.profiles.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}><Text style={styles.avatarText}>{selectedTopic.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}</Text></View>
                )}
                <Text style={styles.authorName}>{selectedTopic.profiles?.full_name || 'Usuario'}</Text>
              </View>

              <View style={styles.topicActions}>
                {currentUser?.id === selectedTopic.user_id && (
                  <TouchableOpacity style={{ padding: 5 }} onPress={() => onEditTopic(selectedTopic)}>
                    <SvgIcon name="edit" size={16} color={COLORS.navy} />
                  </TouchableOpacity>
                )}

                {(currentUser?.id === selectedTopic.user_id || isAdmin) && (
                  <TouchableOpacity style={{ padding: 5 }} onPress={() => onDeleteTopic(selectedTopic.id)}>
                    <SvgIcon name="trash" size={16} color={COLORS.gray3} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.topicTitle}>{selectedTopic.title}</Text>
            <FormattedText text={selectedTopic.description} />
            {selectedTopic.image_url && <Image source={{ uri: selectedTopic.image_url }} style={styles.msgImgFull} resizeMode="contain" />}

            <View style={styles.votesRow}>
              <TouchableOpacity onPress={() => onVote(selectedTopic.id, 1)} style={styles.voteBtn}>
                <SvgIcon name="thumbs-up" size={16} color={selectedTopic.userVote === 1 ? COLORS.green : COLORS.navy} />
                <Text style={[styles.voteText, selectedTopic.userVote === 1 && styles.voteActive]}>{selectedTopic.upvotes || 0}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => onVote(selectedTopic.id, -1)} style={styles.voteBtn}>
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
                  {item.profiles?.avatar_url ? (
                    <Image source={{ uri: item.profiles.avatar_url }} style={[styles.avatar, { width: 24, height: 24, borderRadius: 12 }]} />
                  ) : (
                    <View style={[styles.avatar, { width: 24, height: 24, borderRadius: 12 }]}>
                      <Text style={[styles.avatarText, { fontSize: 12 }]}>{item.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}</Text>
                    </View>
                  )}
                  <Text style={styles.commentAuthorName}>{item.profiles?.full_name || 'Usuario'}</Text>
                </View>

                {(isOwner || isAdmin) && (
                  <TouchableOpacity style={{ padding: 5 }} onPress={() => onDeleteComment(item.id)}>
                    <SvgIcon name="trash" size={14} color={COLORS.gray3} />
                  </TouchableOpacity>
                )}
              </View>

              <FormattedText text={item.content} />
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
          <TouchableOpacity onPress={() => !limitReached && onPickImage(setNewCommentImg)} style={[styles.attachBtn, limitReached && { opacity: 0.5 }]} disabled={limitReached}>
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

          <TouchableOpacity onPress={onCreateComment} disabled={loading || (!newComment.trim() && !newCommentImg) || limitReached} style={[styles.sendBtn, limitReached && { backgroundColor: COLORS.gray3 }]}>
            {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : <SvgIcon name="arrow-right" size={20} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
