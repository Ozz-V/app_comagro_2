import { supabase } from '../supabase';
import * as FileSystem from 'expo-file-system';

export interface ForumTopic {
  id: string;
  user_id: string;
  title: string;
  description: string;
  image_url: string | null;
  created_at: string;
  profiles?: { full_name: string; avatar_url?: string | null };
  forum_topic_votes?: { user_id: string; vote_type: number }[];
  upvotes?: number;
  downvotes?: number;
  userVote?: number | null;
}

export interface ForumComment {
  id: string;
  topic_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  profiles?: { full_name: string; avatar_url?: string | null };
}

export async function uploadForumImage(uri: string): Promise<string | null> {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) return null;
  
  if (fileInfo.size && fileInfo.size > 2097152) { // 2MB
    throw new Error('La imagen excede los 2MB permitidos.');
  }

  const ext = uri.split('.').pop() || 'jpg';
  const filename = `${Date.now()}.${ext}`;
  
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: filename,
    type: `image/${ext === 'png' ? 'png' : 'jpeg'}`
  } as any);

  const { data, error } = await supabase.storage.from('forum_images').upload(filename, formData);
  if (error) throw error;
  
  const { data: urlData } = supabase.storage.from('forum_images').getPublicUrl(data?.path || filename);
  return urlData.publicUrl;
}

export async function fetchTopics(): Promise<ForumTopic[]> {
  const authResponse = await supabase.auth.getUser();
  const currentUserId = authResponse?.data?.user?.id;

  const { data, error } = await supabase
    .from('forum_topics')
    .select(`
      *,
      profiles (full_name),
      forum_topic_votes (user_id, vote_type)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data as any[]).map(topic => {
    let upvotes = 0;
    let downvotes = 0;
    let userVote = null;

    if (topic.forum_topic_votes) {
      topic.forum_topic_votes.forEach((v: any) => {
        if (v.vote_type === 1) upvotes++;
        if (v.vote_type === -1) downvotes++;
        if (currentUserId && v.user_id === currentUserId) {
          userVote = v.vote_type;
        }
      });
    }

    return {
      ...topic,
      upvotes,
      downvotes,
      userVote
    };
  });
}

export async function fetchComments(topicId: string): Promise<ForumComment[]> {
  const { data, error } = await supabase
    .from('forum_comments')
    .select('*, profiles(full_name)')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true });
    
  if (error) throw error;
  return data as any[];
}

export async function createTopic(title: string, description: string, imageUri?: string | null) {
  const authResponse = await supabase.auth.getUser();
  const user = authResponse?.data?.user;
  
  if (!user) throw new Error('No estás autenticado');

  let image_url = null;
  if (imageUri) {
     image_url = await uploadForumImage(imageUri);
  }
  
  const { data, error } = await supabase.from('forum_topics').insert({
    user_id: user.id,
    title,
    description,
    image_url
  }).select().single();

  if (error) {
    if (error.message && error.message.includes('5 temas')) {
      throw new Error('Has alcanzado el límite máximo de 5 temas creados.');
    }
    throw error;
  }
  
  return data;
}

export async function updateTopic(id: string, title: string, description: string, imageUri?: string | null) {
  let image_url = imageUri;
  if (imageUri && !imageUri.startsWith('http')) {
     image_url = await uploadForumImage(imageUri) || null;
  }
  const { data, error } = await supabase.from('forum_topics').update({
    title,
    description,
    image_url
  }).eq('id', id).select().single();
  
  if (error) throw error;
  return data;
}

export async function updateTopicTitle(id: string, title: string) {
  const { data, error } = await supabase.from('forum_topics').update({ title }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTopic(id: string) {
  const { error } = await supabase.from('forum_topics').delete().eq('id', id);
  if (error) throw error;
}

export async function createComment(topicId: string, content: string, imageUri?: string | null) {
  const authResponse = await supabase.auth.getUser();
  const user = authResponse?.data?.user;
  
  if (!user) throw new Error('No estás autenticado');

  let image_url = null;
  if (imageUri) {
     image_url = await uploadForumImage(imageUri);
  }
  
  const { data, error } = await supabase.from('forum_comments').insert({
    topic_id: topicId,
    user_id: user.id,
    content,
    image_url
  }).select().single();
  
  if (error) throw error;
  return data;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('forum_comments').delete().eq('id', id);
  if (error) throw error;
}

export async function voteTopic(topicId: string, voteType: 1 | -1) {
  const authResponse = await supabase.auth.getUser();
  const user = authResponse?.data?.user;
  if (!user) throw new Error('No estás autenticado');
  
  const userId = user.id;

  const { data: existing } = await supabase
    .from('forum_topic_votes')
    .select('*')
    .eq('topic_id', topicId)
    .eq('user_id', userId)
    .single();

  if (existing && existing.vote_type === voteType) {
    await supabase.from('forum_topic_votes').delete().eq('id', existing.id);
  } else if (existing) {
    await supabase.from('forum_topic_votes').update({ vote_type: voteType }).eq('id', existing.id);
  } else {
    await supabase.from('forum_topic_votes').insert({
      topic_id: topicId,
      user_id: userId,
      vote_type: voteType
    });
  }
}
