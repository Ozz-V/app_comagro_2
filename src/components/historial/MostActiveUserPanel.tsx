import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { supabase } from '../../supabase';
import { useFeaturesStore } from '../../store/useFeaturesStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

const CACHE_KEY = '@historial_most_active_user_v1';

const FireIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF7A00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
const EyeIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${COLORS.navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ShareIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${COLORS.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

interface ActiveUser {
  email: string;
  full_name: string;
  avatar_url: string | null;
  views: number;
  shares: number;
}

export default function MostActiveUserPanel() {
  const { isFeatureEnabled } = useFeaturesStore();
  const [user, setUser] = useState<ActiveUser | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setUser(JSON.parse(cached));
      } catch (e) {}

      // RPC agregada: no expone filas crudas, solo el total del usuario con
      // más actividad. Cualquier usuario (admin o no) puede llamarla.
      const { data, error } = await supabase.rpc('get_most_active_user');
      if (error || !data || data.length === 0) return;

      const top = data[0];
      if (!top?.user_email) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('email', top.user_email)
        .maybeSingle();

      const result: ActiveUser = {
        email: top.user_email,
        full_name: profile?.full_name || top.user_email,
        avatar_url: profile?.avatar_url || null,
        views: Number(top.views || 0),
        shares: Number(top.shares || 0),
      };

      setUser(result);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result));
    };
    load();
  }, []);

  if (!isFeatureEnabled('usuario_mas_activo') || !user) return null;

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&background=0D8A39&color=fff`;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <SvgXml xml={FireIcon} />
        <Text style={styles.title}>Usuario Más Activo</Text>
      </View>

      <View style={styles.row}>
        <Image source={{ uri: user.avatar_url || fallbackAvatar }} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{user.full_name}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <SvgXml xml={EyeIcon} />
              <Text style={styles.statText}>{user.views} vistas</Text>
            </View>
            <View style={styles.statChip}>
              <SvgXml xml={ShareIcon} />
              <Text style={styles.statText}>{user.shares} compartidos</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  title: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.gray4, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.bg, flexShrink: 0 },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, marginBottom: 6 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.bg, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  statText: { fontFamily: FONTS.bodySemi, fontSize: 11, color: COLORS.navy },
});
