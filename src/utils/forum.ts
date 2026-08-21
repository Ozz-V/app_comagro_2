import { supabase } from '../supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

export interface ForumTopic {
  id: string;
  user_id: string;
  title: string;
  description: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface ForumComment {
  id: string;
  topic_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    avatar_url: string | null;
  };
}

// Comprime y sube imagen al bucket forum_images
export const uploadForumImage = async (uri: string): Promise<string | null> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) return null;

    // Si pesa más de 2MB (2 * 1024 * 1024), tiramos error
    if (fileInfo.size && fileInfo.size > 2097152) {
      throw new Error('La imagen excede los 2MB permitidos.');
    }

    // Comprimir la imagen usando expo-image-manipulator
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }], // Reducir ancho máximo a 800px para comprimir
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG } // Calidad al 50%
    );

    // Leer el archivo comprimido como base64
    const base64 = await FileSystem.readAsStringAsync(manipResult.uri, { encoding: 'base64' });

    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

    const { data, error } = await supabase.storage
      .from('forum_images')
      .upload(fileName, decode(base64), { contentType: 'image/jpeg' });

    if (error) {
      console.error('Error uploading image to Supabase:', error);
      throw error;
    }

    // Retornar la URL pública
    const { data: publicUrlData } = supabase.storage.from('forum_images').getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error en uploadForumImage:', error);
    throw error;
  }
};

export const fetchTopics = async (): Promise<ForumTopic[]> => {
  const { data, error } = await supabase
    .from('forum_topics')
    .select(`
      *,
      profiles (
        full_name,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as ForumTopic[];
};

export const fetchComments = async (topicId: string): Promise<ForumComment[]> => {
  const { data, error } = await supabase
    .from('forum_comments')
    .select(`
      *,
      profiles (
        full_name,
        avatar_url
      )
    `)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as ForumComment[];
};

export const createTopic = async (title: string, description: string, imageUri?: string | null): Promise<ForumTopic> => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('No estás autenticado');

  let imageUrl = null;
  if (imageUri) {
    imageUrl = await uploadForumImage(imageUri);
  }

  const { data, error } = await supabase
    .from('forum_topics')
    .insert([
      {
        user_id: userData.user.id,
        title,
        description,
        image_url: imageUrl,
      },
    ])
    .select()
    .single();

  if (error) {
     if (error.message.includes('5 temas')) {
        throw new Error('Has alcanzado el límite máximo de 5 temas creados.');
     }
     throw error;
  }
  return data as ForumTopic;
};

export const createComment = async (topicId: string, content: string, imageUri?: string | null): Promise<ForumComment> => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('No estás autenticado');

  let imageUrl = null;
  if (imageUri) {
    imageUrl = await uploadForumImage(imageUri);
  }

  const { data, error } = await supabase
    .from('forum_comments')
    .insert([
      {
        topic_id: topicId,
        user_id: userData.user.id,
        content,
        image_url: imageUrl,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as ForumComment;
};

export const deleteTopic = async (topicId: string) => {
  const { error } = await supabase.from('forum_topics').delete().eq('id', topicId);
  if (error) throw error;
};

export const deleteComment = async (commentId: string) => {
  const { error } = await supabase.from('forum_comments').delete().eq('id', commentId);
  if (error) throw error;
};

export const updateTopicTitle = async (topicId: string, newTitle: string) => {
  const { error } = await supabase.from('forum_topics').update({ title: newTitle }).eq('id', topicId);
  if (error) throw error;
};
