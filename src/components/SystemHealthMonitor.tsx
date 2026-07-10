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
  const [plytixHealth, setPlytixHealth] = useState<HealthStatus>({ service: 'Plytix Sync (Edge)', status: 'loading', lastPing: null });
  const [aiHealth, setAiHealth] = useState<HealthStatus>({ service: 'Gemini AI (Sales Pitch)', status: 'loading', lastPing: null });
  const [userActivity, setUserActivity] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(true);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkHealth() {
    setIsRefreshing(true);
    await Promise.all([
      checkPlytix(),
      checkAITokens(),
      checkUserActivity()
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
      setPlytixHealth({ service: 'Plytix Sync (Edge)', status: 'ok', lastPing: new Date().toLocaleTimeString() });
    } catch (e: any) {
      setPlytixHealth({ service: 'Plytix Sync (Edge)', status: 'error', lastPing: new Date().toLocaleTimeString(), details: e.message || 'Desconectado' });
    }
  }

  async function checkAITokens() {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('updated_at')
        .not('sales_pitch', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1);
        
      if (error) throw new Error('Error DB');
      
      const lastGenerated = data && data.length > 0 ? new Date(data[0].updated_at).toLocaleDateString() : 'Desconocido';
      setAiHealth({ service: 'Gemini AI (Sales Pitch)', status: 'ok', lastPing: new Date().toLocaleTimeString(), details: `Último generado: ${lastGenerated}` });
    } catch (e: any) {
      setAiHealth({ service: 'Gemini AI (Sales Pitch)', status: 'error', lastPing: new Date().toLocaleTimeString(), details: 'Desconectado' });
    }
  }

  async function checkUserActivity() {
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', weekAgo.toISOString());
        
      if (!error && count !== null) {
        setUserActivity(count);
      }
    } catch (e) {
      // Ignorar errores
    }
  }

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <View style={[s.dot, { backgroundColor: COLORS.green }]} />;
      case 'error': return <View style={[s.dot, { backgroundColor: COLORS.red }]} />;
      case 'loading': return <ActivityIndicator size="small" color={COLORS.blue} />;
      default: return <View style={[s.dot, { backgroundColor: COLORS.gray4 }]} />;
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <SvgIcon name="agenteIA" size={24} color={COLORS.navy} />
        <Text style={s.title}>Monitor de Servidores (Enterprise)</Text>
        {isRefreshing && <ActivityIndicator size="small" color={COLORS.gray4} style={{ marginLeft: 'auto' }} />}
      </View>
      
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

        <View style={s.divider} />
        
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: COLORS.blue }]} />
          <View style={s.info}>
            <Text style={s.serviceName}>Actividad de Usuarios</Text>
            <Text style={s.detailText}>{userActivity} usuarios activos (últimos 7 días)</Text>
          </View>
        </View>
      </View>
      
      <TouchableOpacity style={s.refreshBtn} onPress={checkHealth}>
        <Text style={s.refreshTxt}>Actualizar Estado</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginVertical: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: FONTS.heading, fontSize: 16, fontWeight: '700', color: COLORS.navy, marginLeft: 8 },
  card: { backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  info: { flex: 1 },
  serviceName: { fontFamily: FONTS.heading, fontSize: 15, fontWeight: '600', color: COLORS.navy },
  subText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.gray4, marginTop: 2 },
  detailText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray3, marginTop: 2 },
  errorText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.red, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  refreshBtn: { marginTop: 12, paddingVertical: 10, backgroundColor: '#F0F4F8', borderRadius: 8, alignItems: 'center' },
  refreshTxt: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.blue, fontWeight: '600' }
});
