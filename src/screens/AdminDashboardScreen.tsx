import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';


type AdminDashboardNavProp = NativeStackNavigationProp<any, 'AdminDashboard'>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminDashboardNavProp>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{color:'#1f2f6b', fontSize:24}}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Centro de Comando</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>Módulos de Administración</Text>
        
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AdminUsers')}>
          <Text style={{fontSize:24}}>??</Text>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Gestión de Usuarios</Text>
            <Text style={styles.cardDesc}>Administrar roles y baneos.</Text>
          </View>
          <Text style={{color:'#ccc', fontSize:24}}>{'>'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AdminPlytix')}>
          <Text style={{fontSize:24}}>??</Text>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Monitor Plytix</Text>
            <Text style={styles.cardDesc}>Revisar sincronizaciones fallidas.</Text>
          </View>
          <Text style={{color:'#ccc', fontSize:24}}>{'>'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AdminPush')}>
          <Text style={{fontSize:24}}>??</Text>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Push Global</Text>
            <Text style={styles.cardDesc}>Enviar notificación a todos los usuarios.</Text>
          </View>
          <Text style={{color:'#ccc', fontSize:24}}>{'>'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', elevation: 2 },
  backBtn: { padding: 4, marginRight: 12 },
  title: { fontFamily: 'BarlowCondensed_700Bold', fontSize: 24, color: '#1f2f6b' },
  scroll: { padding: 16 },
  subtitle: { fontFamily: 'Barlow_600SemiBold', fontSize: 16, color: '#666', marginBottom: 16, textTransform: 'uppercase' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 1 },
  cardText: { flex: 1, marginLeft: 16 },
  cardTitle: { fontFamily: 'Barlow_600SemiBold', fontSize: 18, color: '#333' },
  cardDesc: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#666', marginTop: 4 }
});
