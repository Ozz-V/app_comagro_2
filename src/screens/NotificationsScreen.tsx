import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';

const ANIMATION_ISO = require('../../assets/iso.json');

type NotifRow = {
  id: number;
  type: 'plytix' | 'forum_topic' | 'forum_comment';
  title: string;
  body: string;
  data: Record<string, unknown>;
  sent_at: string;
  read_at: string | null;
};

function iconForType(type: NotifRow['type']) {
  if (type === 'plytix') return 'doc4';
  return 'chatBubble';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const dias = Math.floor(hs / 24);
  return `hace ${dias} d`;
}

export default function NotificationsScreen({ navigation }: { navigation: { goBack: () => void; [key: string]: unknown } }) {
  const [items, setItems] = useState<NotifRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setCargando(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setItems([]); return; }
      const { data, error: qErr } = await supabase
        .from('notifications_log')
        .select('id, type, title, body, data, sent_at, read_at')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(100);
      if (qErr) throw qErr;
      setItems((data || []) as NotifRow[]);
    } catch (e) {
      setError('No se pudo cargar el historial de notificaciones.');
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(false); }, [cargar]);

  async function marcarLeida(item: NotifRow) {
    if (item.read_at) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i));
    await supabase.from('notifications_log').update({ read_at: new Date().toISOString() }).eq('id', item.id);
    // Nota: la navegación a la lista de productos actualizados o al tema del
    // foro correspondiente se conecta en el siguiente paso, junto con el
    // resto de las pantallas (Sugerencias / Estadísticas).
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView source={ANIMATION_ISO} autoPlay loop style={styles.logoAnimado} resizeMode="contain" />
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.btnVolver}>‹ Volver</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.topBorder} />

      <Text style={styles.titulo}>Notificaciones</Text>

      {cargando ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.navy} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorTxt}>{error}</Text></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={styles.vacioTxt}>Todavía no llegaron notificaciones.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargar(true)} colors={[COLORS.green]} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => marcarLeida(item)}>
              {!item.read_at && <View style={styles.dot} />}
              <View style={styles.cardIcon}>
                <SvgIcon name={iconForType(item.type)} size={22} color={COLORS.navy} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
                <Text style={styles.cardTime}>{timeAgo(item.sent_at)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },
  btnVolver: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.green },
  titulo: {
    fontFamily: FONTS.heading, fontSize: 22, fontWeight: '700',
    color: COLORS.navy, textAlign: 'center', marginTop: 20, marginBottom: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTxt: { fontFamily: FONTS.body, fontSize: 14, color: '#e74c3c', textAlign: 'center' },
  vacioTxt: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.gray4, textAlign: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, marginBottom: 12, backgroundColor: COLORS.white,
  },
  dot: { position: 'absolute', top: 12, right: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.green },
  cardIcon: { marginTop: 2 },
  cardTitle: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, marginBottom: 2 },
  cardBody: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray4, marginBottom: 6 },
  cardTime: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.gray4 },
});
