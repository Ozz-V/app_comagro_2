import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Platform, TextInput, FlatList, ActivityIndicator,
  KeyboardAvoidingView, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LottieView from 'lottie-react-native';
import { supabase, EDGE_URL } from '../supabase';
import { COLORS, FONTS } from '../theme';

export default function ChatScreen({ navigation }) {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState(null);
  const [profName, setProfName] = useState('');
  const [allProdsCache, setAllProdsCache] = useState([]);

  const flatListRef = useRef(null);

  useEffect(() => {
    fetchInitData();
  }, []);

  async function fetchInitData() {
    try {
      // 1. Remote Config — leído con el token del usuario autenticado
      const { data: config, error: configError } = await supabase
        .from('app_config')
        .select('ai_prompt')   // Solo el prompt: ya NO necesitamos ai_api_keys en el cliente
        .eq('id', 'global')
        .single();

      if (configError) {
        // Error al leer app_config — se usa prompt por defecto
      }
      if (config) setRemoteConfig(config);

      // 2. Perfil Usuario
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (prof && prof.full_name && prof.full_name !== 'EMPTY') {
          setProfName(prof.full_name);
          setChatHistory([{
            role: 'assistant',
            content: `¡Hola ${prof.full_name.split(' ')[0]}! Soy el Asistente IA de Comagro. Estoy conectado a la base de datos de productos. ¿En qué te puedo ayudar hoy?`
          }]);
        } else {
          setChatHistory([{
            role: 'assistant',
            content: `¡Hola! Soy el Asistente IA de Comagro. Estoy conectado a la base de datos de productos. ¿En qué te puedo ayudar hoy?`
          }]);
        }
      }

      // 3. Productos Cache
      let fallback = await AsyncStorage.getItem('@productos_cache');
      if (!fallback) fallback = await AsyncStorage.getItem('comagro_productos_v3');
      
      if (!fallback) {
        // Si no hay caché (primera vez que abre), descargar silenciosamente
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const headers = { Authorization: `Bearer ${session.access_token}` };
          const res = await fetch(EDGE_URL, { headers });
          if (res.ok) {
            const nuevosRows = await res.json();
            fallback = JSON.stringify(nuevosRows);
            await AsyncStorage.setItem('comagro_productos_v3', fallback);
            await AsyncStorage.setItem('comagro_productos_fecha_v3', Date.now().toString());
          }
        }
      }

      if (fallback) setAllProdsCache(parseRawProducts(fallback));
    } catch (e) {
      // Error silente al inicializar chat
    }
  }

  const parseRawProducts = (rawData) => {
    return JSON.parse(rawData).map(row => {
      const marca = (row['Brand'] || row['Marca'] || row['marca'] || row['MARCA'] || '').toString().trim();
      const imagen = row['imagen 1'] || row['imagen'] || null;
      return { modelo: (row['SKU'] || '').toString().trim(), marca, imagen };
    });
  };

  async function askChatbot() {
    if (!chatInput.trim()) return;
    setChatLoading(true);

    const userMsg = chatInput.trim();
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory);
    setChatInput('');

    // ----------------------------------------------------------------
    // SEGURIDAD: La Gemini API Key vive SOLO en los secrets de la Edge
    // Function en el servidor. La APK nunca la toca ni la expone.
    // Todo el RAG (embeddings + búsqueda vectorial) lo hace la Edge Function.
    // ----------------------------------------------------------------
    let success = false;
    let lastError = '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Filtrar el saludo inicial porque a Gemini le da error 400 si el historial no empieza con 'user'
      const historyForApi = newHistory.filter(msg => !(msg.role === 'assistant' && msg.content.includes('Soy el Asistente IA de Comagro')));

      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: historyForApi,
          user_id: session?.user?.id || 'anon',
          // Pasamos el prompt personalizado si existe, para que la Edge Function lo use
          custom_prompt: remoteConfig?.ai_prompt || null,
        }
      });

      if (error) throw new Error(error.message || 'Error en Supabase Edge Function');

      if (data && data.reply) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);
        success = true;
      } else {
        throw new Error('Respuesta vacía de la Edge Function');
      }
    } catch (err) {
      lastError = err.message;
      // Error silente en petición al chatbot
    }

    if (!success) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Fallo de conexión en servidores IA: ${lastError}`
      }]);
    }

    setChatLoading(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }

  // Extrae la etiqueta [SKU: XXX] del texto y devuelve el texto limpio y los SKUs encontrados
  const parseMessage = (text) => {
    const skuRegex = /\[SKU:\s*([^\]]+)\]/gi;
    let match;
    const skus = [];
    let cleanText = text;

    while ((match = skuRegex.exec(text)) !== null) {
      skus.push(match[1].trim());
      cleanText = cleanText.replace(match[0], '');
    }
    return { cleanText: cleanText.trim(), skus };
  };

  const renderProductCard = (sku) => {
    const product = allProdsCache.find(p => p.modelo.toUpperCase() === sku.toUpperCase());
    if (!product) return null;

    return (
      <TouchableOpacity
        key={sku}
        style={styles.productCard}
        onPress={() => navigation.navigate('Productos', { openProductSku: product.modelo })}
      >
        <View style={styles.cardContent}>
          {product.imagen ? (
            <Image source={{ uri: product.imagen }} style={styles.cardImage} />
          ) : (
            <View style={styles.cardImagePlaceholder} />
          )}
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardBrand} numberOfLines={1}>{product.marca}</Text>
            <Text style={styles.cardModel} numberOfLines={2}>{product.modelo}</Text>
            <Text style={styles.cardAction}>Ver Ficha Técnica ›</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.navy} barStyle="light-content" />

      {/* HEADER DE CHAT NATIVO */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.avatarContainer}>
            <LottieView
              source={require('../../assets/iso.json')}
              autoPlay
              loop
              style={styles.avatarLottie}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={styles.headerTitle}>Comagro AI Bot</Text>
            <Text style={styles.headerSubtitle}>Conectado a DB Oficial</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => { setChatHistory([]); fetchInitData(); }} style={styles.clearButton}>
          <Text style={styles.clearText}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <FlatList
          ref={flatListRef}
          data={chatHistory}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.chatContainer}
          renderItem={({ item }) => {
            const { cleanText, skus } = item.role === 'assistant'
              ? parseMessage(item.content)
              : { cleanText: item.content, skus: [] };

            return (
              <View style={[
                styles.bubbleWrapper,
                item.role === 'user' ? styles.bubbleUser : styles.bubbleBot
              ]}>
                <Text style={styles.bubbleText}>{cleanText}</Text>

                {/* RENDERIZADO DE TARJETAS DE PRODUCTO */}
                {skus.length > 0 && (
                  <View style={styles.cardsContainer}>
                    {skus.map(sku => renderProductCard(sku))}
                  </View>
                )}
              </View>
            );
          }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Escribe tu consulta técnica..."
            placeholderTextColor={COLORS.gray4}
            value={chatInput}
            onChangeText={setChatInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: chatInput.trim() ? COLORS.navy : COLORS.gray4 }]}
            onPress={askChatbot}
            disabled={chatLoading || !chatInput.trim()}
          >
            {chatLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.sendIcon}>➤</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#E5DDD5' },
  header: {
    backgroundColor: COLORS.navy,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backButton: { padding: 8, marginRight: 4 },
  backText: { color: COLORS.white, fontSize: 32, fontWeight: 'bold', lineHeight: 32, marginTop: -4 },
  avatarContainer: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden'
  },
  avatarLottie: { width: 50, height: 50 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.white },
  headerSubtitle: { fontSize: 12, color: COLORS.green },
  clearButton: { padding: 8 },
  clearText: { fontSize: 14, color: COLORS.white, fontWeight: '600' },

  keyboardView: { flex: 1 },
  chatContainer: { padding: 16, gap: 12 },

  bubbleWrapper: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 1
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
    borderTopRightRadius: 4,
  },
  bubbleBot: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, color: '#303030', lineHeight: 22 },

  cardsContainer: { marginTop: 12, gap: 10 },
  productCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, padding: 8,
  },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  cardImage: { width: 50, height: 50, resizeMode: 'contain', marginRight: 10, borderRadius: 4 },
  cardImagePlaceholder: { width: 50, height: 50, backgroundColor: '#E2E8F0', marginRight: 10, borderRadius: 4 },
  cardTextContainer: { flex: 1 },
  cardBrand: { fontSize: 11, color: COLORS.gray4, fontWeight: 'bold' },
  cardModel: { fontSize: 14, color: COLORS.navy, fontWeight: 'bold', marginBottom: 4 },
  cardAction: { fontSize: 12, color: COLORS.green, fontWeight: 'bold' },

  inputContainer: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center'
  },
  input: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, color: '#303030'
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginLeft: 10
  },
  sendIcon: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 }
});
