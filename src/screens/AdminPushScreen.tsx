import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { supabase } from '../supabase';

export default function AdminPushScreen() {
  const navigation = useNavigation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const sendPush = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Error', 'Título y mensaje son obligatorios.');
      return;
    }
    
    Alert.alert('Confirmar', '¿Estás seguro de enviar esta notificación a TODOS los usuarios?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Enviar', style: 'destructive', onPress: async () => {
        setLoading(true);
        const { error } = await supabase.functions.invoke('forum-notify', {
          body: { action: 'broadcast', title, body }
        });
        setLoading(false);
        if (error) {
          Alert.alert('Error', 'No se pudo enviar la notificación.');
        } else {
          Alert.alert('Éxito', 'Notificación masiva enviada.');
          setTitle('');
          setBody('');
        }
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{color:'#1f2f6b', fontSize:24}}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Push Masivo</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Título de la Notificación</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Ej: Nueva lista de precios" 
          value={title} 
          onChangeText={setTitle} 
          maxLength={50}
        />

        <Text style={styles.label}>Mensaje</Text>
        <TextInput 
          style={[styles.input, styles.textArea]} 
          placeholder="Escribe el mensaje..." 
          value={body} 
          onChangeText={setBody} 
          multiline 
          numberOfLines={4}
          maxLength={150}
        />

        <TouchableOpacity style={styles.sendBtn} onPress={sendPush} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Enviar a Todos</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', elevation: 2 },
  backBtn: { padding: 4, marginRight: 12 },
  title: { fontFamily: 'BarlowCondensed_700Bold', fontSize: 24, color: '#1f2f6b' },
  content: { padding: 16 },
  label: { fontFamily: 'Barlow_600SemiBold', fontSize: 16, color: '#333', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, fontFamily: 'Barlow_400Regular', marginBottom: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  sendBtn: { backgroundColor: '#d32f2f', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  sendBtnText: { fontFamily: 'Barlow_700Bold', fontSize: 18, color: '#fff', textTransform: 'uppercase' }
});
