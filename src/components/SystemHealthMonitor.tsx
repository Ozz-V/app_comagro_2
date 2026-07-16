import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { COLORS, FONTS } from '../theme';
import { supabase } from '../supabase';
import SvgIcon from './SvgIcon';

interface HealthStatus {
  service: string;
  status: 'ok' | 'error' | 'loading' | 'unknown';
  lastPing: string | null;
  details?: string;
}

const AnimatedWaveform = ({ status, color }: { status: string, color: string }) => {
  const anim1 = useRef(new Animated.Value(4)).current;
  const anim2 = useRef(new Animated.Value(4)).current;
  const anim3 = useRef(new Animated.Value(4)).current;
  const anim4 = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    if (status === 'ok') {
      const createAnimation = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: Math.random() * 10 + 8, duration: 300, delay, useNativeDriver: false }),
            Animated.timing(anim, { toValue: 4, duration: 300, useNativeDriver: false })
          ])
        );
      };
      
      const loop1 = createAnimation(anim1, 0);
      const loop2 = createAnimation(anim2, 150);
      const loop3 = createAnimation(anim3, 75);
      const loop4 = createAnimation(anim4, 225);
      
      loop1.start();
      loop2.start();
      loop3.start();
      loop4.start();

      return () => {
        loop1.stop();
        loop2.stop();
        loop3.stop();
        loop4.stop();
      };
    } else {
      Animated.timing(anim1, { toValue: 4, duration: 200, useNativeDriver: false }).start();
      Animated.timing(anim2, { toValue: 4, duration: 200, useNativeDriver: false }).start();
      Animated.timing(anim3, { toValue: 4, duration: 200, useNativeDriver: false }).start();
      Animated.timing(anim4, { toValue: 4, duration: 200, useNativeDriver: false }).start();
    }
  }, [status]);

  if (status === 'loading') {
    return <ActivityIndicator size="small" color={color} style={{ marginRight: 12, width: 24 }} />;
  }

  const activeColor = status === 'ok' ? color : status === 'error' ? '#D32F2F' : COLORS.gray4;

  return (
    <View style={s.waveformContainer}>
      <Animated.View style={[s.waveformBar, { backgroundColor: activeColor, height: anim1 }]} />
      <Animated.View style={[s.waveformBar, { backgroundColor: activeColor, height: anim2 }]} />
      <Animated.View style={[s.waveformBar, { backgroundColor: activeColor, height: anim3 }]} />
      <Animated.View style={[s.waveformBar, { backgroundColor: activeColor, height: anim4 }]} />
    </View>
  );
};

export default function SystemHealthMonitor() {
  const [plytixHealth, setPlytixHealth] = useState<HealthStatus>({ service: 'Plytix Sync', status: 'loading', lastPing: null });
  const [aiHealth, setAiHealth] = useState<HealthStatus>({ service: 'Asistente IA', status: 'loading', lastPing: null });
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 120000);
    return () => clearInterval(interval);
  }, []);

  async function checkHealth() {
    setIsRefreshing(true);
    await Promise.all([
      checkPlytix(),
      checkAITokens()
    ]);
    setIsRefreshing(false);
  }

  async function checkPlytix() {
    try {
      const { data, error } = await supabase.functions.invoke('sync-plytix/health', {
        method: 'GET',
      });
      if (error || !data || data.status !== 'ok') {
        throw new Error('No responde');
      }
      setPlytixHealth({ service: 'Plytix Sync', status: 'ok', lastPing: new Date().toLocaleTimeString() });
    } catch (e: any) {
      setPlytixHealth({ service: 'Plytix Sync', status: 'error', lastPing: new Date().toLocaleTimeString(), details: e.message || 'Desconectado' });
    }
  }

  async function checkAITokens() {
    try {
      // Ping real y gratuito: llama a la función chat con { ping: true },
      // que del lado del servidor consulta el endpoint de metadata de
      // Gemini (no generateContent), así que NO gasta tokens de IA — solo
      // confirma que la API de Google responde y que la key es válida.
      const { data, error } = await supabase.functions.invoke('chat', { body: { ping: true } });
      if (error || !data || data.status !== 'ok') {
        throw new Error(data?.message || 'No responde');
      }
      setAiHealth({ service: 'Asistente IA', status: 'ok', lastPing: new Date().toLocaleTimeString(), details: 'Gemini responde correctamente' });
    } catch (e: any) {
      setAiHealth({ service: 'Asistente IA', status: 'error', lastPing: new Date().toLocaleTimeString(), details: 'Desconectado' });
    }
  }

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <View style={s.headerLeft}>
          <SvgIcon name="server" size={18} color={COLORS.navy} />
          <Text style={s.title}>Estado de Servidores</Text>
        </View>
        <View style={s.headerRight}>
          {isRefreshing && <ActivityIndicator size="small" color={COLORS.gray4} style={{ marginRight: 8 }} />}
          <Text style={s.arrow}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>
      
      {expanded && (
        <View style={s.card}>
          <View style={s.row}>
            <AnimatedWaveform status={plytixHealth.status} color="#1c9f4b" />
            <View style={s.info}>
              <Text style={s.serviceName}>{plytixHealth.service}</Text>
              <Text style={s.subText}>Último ping: {plytixHealth.lastPing || '...'}</Text>
              {plytixHealth.details && <Text style={s.errorText}>{plytixHealth.details}</Text>}
            </View>
          </View>
          
          <View style={s.divider} />
          
          <View style={s.row}>
            <AnimatedWaveform status={aiHealth.status} color="#2196F3" />
            <View style={s.info}>
              <Text style={s.serviceName}>{aiHealth.service}</Text>
              <Text style={s.subText}>Último ping: {aiHealth.lastPing || '...'}</Text>
              {aiHealth.details && <Text style={s.detailText}>{aiHealth.details}</Text>}
            </View>
          </View>
          
          <TouchableOpacity style={s.refreshBtn} onPress={checkHealth}>
            <Text style={s.refreshTxt}>Actualizar Estado</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginVertical: 16, backgroundColor: COLORS.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '700', color: COLORS.navy, marginLeft: 8 },
  arrow: { fontSize: 12, color: COLORS.gray3, marginLeft: 4 },
  card: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  waveformContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 18, width: 24, justifyContent: 'space-between', marginRight: 12, paddingBottom: 2 },
  waveformBar: { width: 4, borderRadius: 2 },
  info: { flex: 1 },
  serviceName: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '600', color: COLORS.navy },
  subText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginTop: 2 },
  detailText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray3, marginTop: 2 },
  errorText: { fontFamily: FONTS.body, fontSize: 12, color: '#D32F2F', marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  refreshBtn: { marginTop: 12, paddingVertical: 10, backgroundColor: '#F0F4F8', borderRadius: 8, alignItems: 'center' },
  refreshTxt: { fontFamily: FONTS.body, fontSize: 14, color: '#2196F3', fontWeight: '600' }
});
