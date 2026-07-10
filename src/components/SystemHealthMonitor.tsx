import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS, FONTS } from '../theme';
import { supabase } from '../supabase';
import SvgIcon from './SvgIcon';

interface HealthStatus {
  service: string;
  status: 'ok' | 'error' | 'loading' | 'unknown';
  lastPing: string | null;
  details?: string;
}

export default function SystemHealthMonitor() {
  const [plytixHealth, setPlytixHealth] = useState<HealthStatus>({ service: 'Plytix Sync', status: 'loading', lastPing: null });
  const [aiHealth, setAiHealth] = useState<HealthStatus>({ service: 'Asistente IA', status: 'loading', lastPing: null });
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
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
      const { data, error } = await supabase
        .from('productos_ai_data')
        .select('created_at')
        .not('sales_pitch', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (error) throw new Error('Error DB');
      
      const lastGenerated = data && data.length > 0 && data[0].created_at ? new Date(data[0].created_at).toLocaleDateString() : 'Desconocido';
      setAiHealth({ service: 'Asistente IA', status: 'ok', lastPing: new Date().toLocaleTimeString(), details: `Último generado: ${lastGenerated}` });
    } catch (e: any) {
      setAiHealth({ service: 'Asistente IA', status: 'error', lastPing: new Date().toLocaleTimeString(), details: 'Desconectado' });
    }
  }

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <View style={[s.dot, { backgroundColor: '#1c9f4b' }]} />;
      case 'error': return <View style={[s.dot, { backgroundColor: '#D32F2F' }]} />;
      case 'loading': return <ActivityIndicator size="small" color="#2196F3" />;
      default: return <View style={[s.dot, { backgroundColor: COLORS.gray4 }]} />;
    }
  };

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
            {renderStatusIcon(plytixHealth.status)}
            <View style={s.info}>
              <Text style={s.serviceName}>{plytixHealth.service}</Text>
              <Text style={s.subText}>Último ping: {plytixHealth.lastPing || '...'}</Text>
              {plytixHealth.details && <Text style={s.errorText}>{plytixHealth.details}</Text>}
            </View>
          </View>
          
          <View style={s.divider} />
          
          <View style={s.row}>
            {renderStatusIcon(aiHealth.status)}
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
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  info: { flex: 1 },
  serviceName: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '600', color: COLORS.navy },
  subText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginTop: 2 },
  detailText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray3, marginTop: 2 },
  errorText: { fontFamily: FONTS.body, fontSize: 12, color: '#D32F2F', marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  refreshBtn: { marginTop: 12, paddingVertical: 10, backgroundColor: '#F0F4F8', borderRadius: 8, alignItems: 'center' },
  refreshTxt: { fontFamily: FONTS.body, fontSize: 14, color: '#2196F3', fontWeight: '600' }
});
