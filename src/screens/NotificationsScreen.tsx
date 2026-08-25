import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import ForumModal from '../components/ForumModal';
import { useCustomAlert } from '../contexts/CustomAlertContext';

const ANIMATION_ISO = require('../../assets/iso.json');

type NotifRow = {
  id: number;
  type: 'plytix' | 'new_products' | 'forum_topic' | 'forum_comment';
  title: string;
  body: string;
  data: Record<string, unknown>;
  sent_at: string;
  read_at: string | null;
};

function iconForType(type: NotifRow['type']) {
  if (type === 'plytix' || type === 'new_products') return 'doc4';
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

export default function NotificationsScreen({
  navigation,
}: {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    [key: string]: unknown;
  };
}) {
  const [items, setItems] = useState<NotifRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForumModal, setShowForumModal] = useState(false);
  const [forumOpenTopicId, setForumOpenTopicId] = useState<string | null>(null);
  const [forumOpenCommentId, setForumOpenCommentId] = useState<string | null>(null);

  const { showAlert } = useCustomAlert();

  const cargar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setCargando(true);

    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setItems([]);
        return;
      }

      const { data, error: qErr } = await supabase
        .from('notifications_log')
        .select('id, type, title, body, data, sent_at, read_at')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(100);

      if (qErr) throw qErr;

      setItems((data || []) as NotifRow[]);
    } catch {
      setError('No se pudo cargar el historial de notificaciones.');
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargar(false);
  }, [cargar]);

  const marcarComoLeida = async (item: NotifRow) => {
    if (item.read_at) return;

    const now = new Date().toISOString();

    setItems(prev =>
      prev.map(i => (i.id === item.id ? { ...i, read_at: now } : i))
    );

    await supabase
      .from('notifications_log')
      .update({ read_at: now })
      .eq('id', item.id);
  };

  const eliminarNotificacion = async (item: NotifRow) => {
    const { error: deleteError } = await supabase
      .from('notifications_log')
      .delete()
      .eq('id', item.id);

    if (deleteError) {
      showAlert(
        'No se pudo eliminar',
        'La notificación no pudo eliminarse del historial. Comprueba que la política de eliminación de notifications_log esté habilitada en Supabase.'
      );
      return;
    }

    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  const avisarContenidoEliminado = (
    item: NotifRow,
    tipo: 'Sugerencia' | 'Comentario' | 'Producto'
  ) => {
    showAlert(
      `${tipo} no disponible`,
      `El ${tipo.toLowerCase()} de esta notificación ya no existe porque fue eliminado.

¿Deseas eliminar también esta notificación del historial?`,
      [
        {
          text: 'Conservar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void eliminarNotificacion(item);
          },
        },
      ]
    );
  };

  const comprobarYabrirForo = async (item: NotifRow) => {
    const topicId =
      typeof item.data?.topicId === 'string' ? item.data.topicId : null;

    const commentId =
      typeof item.data?.commentId === 'string' ? item.data.commentId : null;

    if (!topicId) {
      avisarContenidoEliminado(
        item,
        item.type === 'forum_comment' ? 'Comentario' : 'Sugerencia'
      );
      return;
    }

    /*
     * Primero comprobamos que el tema siga existiendo.
     * Así una notificación vieja nunca rompe la navegación.
     */
    const { data: topic, error: topicError } = await supabase
      .from('forum_topics')
      .select('id')
      .eq('id', topicId)
      .maybeSingle();

    if (topicError || !topic) {
      avisarContenidoEliminado(
        item,
        item.type === 'forum_comment' ? 'Comentario' : 'Sugerencia'
      );
      return;
    }

    /*
     * Para comentarios comprobamos además que el comentario concreto
     * siga existiendo. Esto permite detectar comentarios eliminados.
     */
    if (item.type === 'forum_comment') {
      if (!commentId) {
        avisarContenidoEliminado(item, 'Comentario');
        return;
      }

      const { data: comment, error: commentError } = await supabase
        .from('forum_comments')
        .select('id')
        .eq('id', commentId)
        .eq('topic_id', topicId)
        .maybeSingle();

      if (commentError || !comment) {
        avisarContenidoEliminado(item, 'Comentario');
        return;
      }
    }

    /*
     * IMPORTANTE:
     *
     * NO hacemos navigate('Portal').
     * NO hacemos popToTop().
     * NO usamos DeviceEventEmitter.
     *
     * ForumModal queda montado SOBRE NotificationsScreen.
     * Al cerrarlo, regresamos exactamente a esta lista.
     */
    setForumOpenTopicId(topicId);
    setForumOpenCommentId(commentId);
    setShowForumModal(true);
  };

  const manejarToqueNotificacion = async (item: NotifRow) => {
    await marcarComoLeida(item);

    const isForum =
      item.type === 'forum_topic' || item.type === 'forum_comment';

    const isProducts =
      item.type === 'new_products' || item.type === 'plytix';

    if (isForum) {
      await comprobarYabrirForo(item);
      return;
    }

    if (isProducts) {
      const skus = Array.isArray(item.data?.skus)
        ? item.data.skus.filter(
            (sku): sku is string => typeof sku === 'string'
          )
        : [];

      if (skus.length === 0) {
        avisarContenidoEliminado(item, 'Producto');
        return;
      }

      /*
       * ProductViewer es una pantalla real de la pila.
       *
       * Notificaciones
       *      ↓
       * ProductViewer
       *      ↓
       * goBack()
       *      ↓
       * Notificaciones
       */
      navigation.navigate('ProductViewer', {
        sku: skus[0],
        contextSkus: skus,
        notificationId: item.id,
      });

      return;
    }
  };

  const cerrarForum = () => {
    setShowForumModal(false);
    setForumOpenTopicId(null);
    setForumOpenCommentId(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      <View style={styles.topbar}>
        <LottieView
          source={ANIMATION_ISO}
          autoPlay
          loop
          style={styles.logoAnimado}
          resizeMode="contain"
        />

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.btnVolver}>‹ Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.topBorder} />

      <Text style={styles.titulo}>Notificaciones</Text>

      {cargando ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.navy} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTxt}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.vacioTxt}>
            Todavía no llegaron notificaciones.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 60,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => cargar(true)}
              colors={[COLORS.green]}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => {
                void manejarToqueNotificacion(item);
              }}
            >
              {!item.read_at && <View style={styles.dot} />}

              <View style={styles.cardIcon}>
                <SvgIcon
                  name={iconForType(item.type)}
                  size={22}
                  color={COLORS.navy}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
                <Text style={styles.cardTime}>
                  {timeAgo(item.sent_at)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <ForumModal
        visible={showForumModal}
        openTopicId={forumOpenTopicId}
        openCommentId={forumOpenCommentId}
        notificationMode
        onClose={cerrarForum}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  topbar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight || 24) + 10
        : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBorder: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  logoAnimado: {
    width: 100,
    height: 40,
  },
  btnVolver: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.green,
  },
  titulo: {
    fontFamily: FONTS.heading,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.navy,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  errorTxt: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: '#e74c3c',
    textAlign: 'center',
  },
  vacioTxt: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: COLORS.white,
  },
  dot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.green,
  },
  cardIcon: {
    marginTop: 2,
  },
  cardTitle: {
    fontFamily: FONTS.heading,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  cardBody: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
    marginBottom: 6,
  },
  cardTime: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
  },
});
