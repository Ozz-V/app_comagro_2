import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import SystemHealthMonitor from '../components/SystemHealthMonitor';
import { SvgXml } from 'react-native-svg';

type AdminDashboardNavProp = NativeStackNavigationProp<any, 'AdminDashboard'>;

const IconUsers = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f2f6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const IconServer = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f2f6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`;
const IconBell = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f2f6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
const IconStats = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f2f6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`;
const IconHistory = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f2f6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminDashboardNavProp>();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <View style={styles.topbar}>
        <View style={{ width: 60 }} />
        <Text style={styles.topTitle}>Centro de Comando</Text>
        <View style={{ width: 60 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>Módulos de Administración</Text>
        
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AdminUsers')}>
          <View style={styles.iconBox}><SvgXml xml={IconUsers} /></View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Gestión de Usuarios</Text>
            <Text style={styles.cardDesc}>Administrar roles y baneos.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AdminPlytix')}>
          <View style={styles.iconBox}><SvgXml xml={IconServer} /></View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Monitor Plytix</Text>
            <Text style={styles.cardDesc}>Revisar sincronizaciones fallidas.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AdminPush')}>
          <View style={styles.iconBox}><SvgXml xml={IconBell} /></View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Push Global</Text>
            <Text style={styles.cardDesc}>Enviar notificación a todos los usuarios.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Estadisticas')}>
          <View style={styles.iconBox}><SvgXml xml={IconStats} /></View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Métricas de Negocio</Text>
            <Text style={styles.cardDesc}>Ver estadísticas globales y descargar PDF.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Historial')}>
          <View style={styles.iconBox}><SvgXml xml={IconHistory} /></View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Mi Historial y Favoritos</Text>
            <Text style={styles.cardDesc}>Ver tus favoritos y actividad personal.</Text>
          </View>
        </TouchableOpacity>

        <View style={{ marginTop: 30 }}>
          <Text style={styles.subtitle}>Infraestructura</Text>
          <SystemHealthMonitor />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  topbar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  topTitle: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 24,
    color: '#1f2f6b',
    textTransform: 'uppercase',
  },
  scroll: { padding: 16, paddingBottom: 40 },
  subtitle: { 
    fontFamily: 'Barlow_600SemiBold', 
    fontSize: 14, 
    color: '#888', 
    marginBottom: 12, 
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 12, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2 
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardText: { flex: 1, marginLeft: 16 },
  cardTitle: { fontFamily: 'Barlow_600SemiBold', fontSize: 18, color: '#1f2f6b' },
  cardDesc: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#666', marginTop: 4 }
});
