import { supabase } from '../supabase';

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

// Exportamos esta función para que tests/Forum.test.ts no falle
export async function uploadForumImage(uri: string): Promise<string> {
  const ext = uri.split('.').pop();
  const filename = `${Date.now()}.${ext}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  
  const { data, error } = await supabase.storage.from('forum_images').upload(filename, blob);
  if (error) throw error;
  
  const { data: urlData } = supabase.storage.from('forum_images').getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function fetchTopics(): Promise<ForumTopic[]> {
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id;

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

// imageUri es opcional para no romper las pruebas viejas
export async function createTopic(title: string, description: string, imageUri?: string | null) {
  let image_url = null;
  if (imageUri) {
     image_url = await uploadForumImage(imageUri);
  }
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('forum_topics').insert({
    user_id: user.user?.id,
    title,
    description,
    image_url
  });
  if (error) throw error;
}

// imageUri es opcional para no romper las pruebas viejas
export async function updateTopic(id: string, title: string, description: string, imageUri?: string | null) {
  let image_url = imageUri;
  if (imageUri && !imageUri.startsWith('http')) {
     image_url = await uploadForumImage(imageUri);
  }
  const { error } = await supabase.from('forum_topics').update({
    title,
    description,
    image_url
  }).eq('id', id);
  
  if (error) throw error;
}

// Restauramos esta función específica porque el archivo de test la busca
export async function updateTopicTitle(id: string, title: string) {
  const { error } = await supabase.from('forum_topics').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function deleteTopic(id: string) {
  const { error } = await supabase.from('forum_topics').delete().eq('id', id);
  if (error) throw error;
}

// imageUri es opcional para no romper las pruebas viejas
export async function createComment(topicId: string, content: string, imageUri?: string | null) {
  let image_url = null;
  if (imageUri) {
     image_url = await uploadForumImage(imageUri);
  }
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('forum_comments').insert({
    topic_id: topicId,
    user_id: user.user?.id,
    content,
    image_url
  });
  if (error) throw error;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('forum_comments').delete().eq('id', id);
  if (error) throw error;
}

export async function voteTopic(topicId: string, voteType: 1 | -1) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;
  const userId = user.user.id;

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
