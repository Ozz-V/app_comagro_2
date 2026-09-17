import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, ActivityIndicator } from 'react-native';
import { COLORS } from '../../theme';
import SvgIcon from '../SvgIcon';
import { ForumTopic } from '../../utils/forum';
import { styles } from './ForumStyles';

interface Props {
  topics: ForumTopic[];
  loading: boolean;
  refreshing: boolean;
  currentUser: any;
  isAdmin: boolean;
  onRefresh: () => void;
  onOpenTopic: (topic: ForumTopic) => void;
  onEditTopic: (topic: ForumTopic) => void;
  onDeleteTopic: (id: string) => void;
  onVote: (topicId: string, vote: 1 | -1) => void;
}

export default function ForumTopicList({
  topics, loading, refreshing, currentUser, isAdmin,
  onRefresh, onOpenTopic, onEditTopic, onDeleteTopic, onVote,
}: Props) {
  return (
    <FlatList
      data={topics}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.listContainer}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No hay sugerencias aún. ¡Crea la primera!</Text> : <ActivityIndicator size="large" color={COLORS.green} style={{ marginTop: 40 }} />}
      renderItem={({ item }) => {
        const isOwner = currentUser?.id === item.user_id;

        return (
          <TouchableOpacity style={styles.topicCard} onPress={() => onOpenTopic(item)}>
            <View style={styles.topicHeader}>
              <View style={styles.authorRow}>
                {item.profiles?.avatar_url ? (
                  <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}><Text style={styles.avatarText}>{item.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}</Text></View>
                )}
                <Text style={styles.authorName}>{item.profiles?.full_name || 'Usuario'}</Text>
              </View>

              <View style={styles.topicActions}>
                {isOwner && (
                  <TouchableOpacity style={{ padding: 5 }} onPress={() => onEditTopic(item)}>
                    <SvgIcon name="edit" size={16} color={COLORS.navy} />
                  </TouchableOpacity>
                )}

                {(isOwner || isAdmin) && (
                  <TouchableOpacity style={{ padding: 5 }} onPress={() => onDeleteTopic(item.id)}>
                    <SvgIcon name="trash" size={16} color={COLORS.gray3} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.topicTitle}>{item.title}</Text>
            <Text style={styles.topicDesc} numberOfLines={2}>{item.description}</Text>
            {item.image_url && <Text style={styles.hasAttachmentText}>📎 Contiene imagen</Text>}

            <View style={styles.votesRow}>
              <TouchableOpacity onPress={() => onVote(item.id, 1)} style={styles.voteBtn}>
                <SvgIcon name="thumbs-up" size={16} color={item.userVote === 1 ? COLORS.green : COLORS.navy} />
                <Text style={[styles.voteText, item.userVote === 1 && styles.voteActive]}>{item.upvotes || 0}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => onVote(item.id, -1)} style={styles.voteBtn}>
                <SvgIcon name="thumbs-down" size={16} color={item.userVote === -1 ? '#D32F2F' : COLORS.navy} />
                <Text style={[styles.voteText, item.userVote === -1 && styles.voteActive]}>{item.downvotes || 0}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}
