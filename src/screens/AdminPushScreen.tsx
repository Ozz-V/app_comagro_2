import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, StatusBar, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabase';

const TIPOS_COMUNICADO = [
  '¡Nuevas actualizaciones!',
  'Aviso Importante',
  'Problemas Conocidos / Mejoras',
  'Saludos / Festividades (Otros)',
  'Imagen'
];

export default function AdminPushScreen() {
  const navigation = useNavigation();
  const [tipo, setTipo] = useState(TIPOS_COMUNICADO[1]);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  const saveComunicado = async () => {
    if (!titulo.trim() || !contenido.trim()) {
      Alert.alert('Error', 'Título y contenido son obligatorios.');
      return;
    }
    
    Alert.alert('Confirmar', '¿Guardar este comunicado global?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar y Publicar', style: 'default', onPress: async () => {
        setLoading(true);
        const { error } = await supabase.from('app_comunicados').insert([{
          tipo_comunicado: tipo,
          titulo,
          contenido,
          imagen_url: imagenUrl.trim() || null,
          is_active: isActive
        }]);
        setLoading(false);
        if (error) {
          Alert.alert('Error', 'No se pudo guardar el comunicado. ' + error.message);
        } else {
          Alert.alert('Éxito', 'Comunicado publicado correctamente en la plataforma.');
          setTitulo('');
          setContenido('');
          setImagenUrl('');
        }
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtnWrapper} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Cerrar</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Nuevo Comunicado</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helperText}>Este módulo inserta un aviso global en la tabla app_comunicados. Los usuarios lo verán al abrir la app.</Text>
        
        <Text style={styles.label}>Tipo de Comunicado</Text>
        <View style={styles.pillsContainer}>
          {TIPOS_COMUNICADO.map((t) => (
            <TouchableOpacity 
              key={t} 
              style={[styles.pill, tipo === t && styles.pillActive]}
              onPress={() => setTipo(t)}
            >
              <Text style={[styles.pillText, tipo === t && styles.pillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Título</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Ej: Nueva lista de precios..." 
          value={titulo} 
          onChangeText={setTitulo} 
        />

        <Text style={styles.label}>Contenido / Mensaje</Text>
        <TextInput 
          style={[styles.input, styles.textArea]} 
          placeholder="Escribe el cuerpo del comunicado..." 
          value={contenido} 
          onChangeText={setContenido} 
          multiline 
          textAlignVertical="top"
        />

        <Text style={styles.label}>URL de Imagen (Opcional)</Text>
        <TextInput 
          style={styles.input} 
          placeholder="https://ejemplo.com/imagen.jpg" 
          value={imagenUrl} 
          onChangeText={setImagenUrl} 
          autoCapitalize="none"
        />

        <View style={styles.switchRow}>
          <Text style={styles.label}>Publicar inmediatamente (Activo)</Text>
          <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: '#1f2f6b', false: '#ccc' }} />
        </View>

        <TouchableOpacity style={styles.sendBtn} onPress={saveComunicado} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Guardar Comunicado</Text>}
        </TouchableOpacity>
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
  backBtnWrapper: {
    width: 80,
    paddingLeft: 16,
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: 'Barlow_600SemiBold',
    fontSize: 16,
    color: '#1f2f6b',
  },
  content: { padding: 16, paddingBottom: 40 },
  helperText: { fontFamily: 'Barlow_400Regular', fontSize: 14, color: '#666', marginBottom: 20 },
  label: { fontFamily: 'Barlow_600SemiBold', fontSize: 14, color: '#333', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, fontFamily: 'Barlow_400Regular', marginBottom: 16 },
  textArea: { height: 100 },
  pillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e0e0e0' },
  pillActive: { backgroundColor: '#1f2f6b' },
  pillText: { fontFamily: 'Barlow_600SemiBold', fontSize: 12, color: '#333' },
  pillTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingVertical: 8 },
  sendBtn: { backgroundColor: '#1f2f6b', padding: 16, borderRadius: 8, alignItems: 'center' },
  sendBtnText: { fontFamily: 'Barlow_600SemiBold', fontSize: 16, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }
});
