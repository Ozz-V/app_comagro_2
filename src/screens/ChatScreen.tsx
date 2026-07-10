import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Platform, TextInput, FlatList, ActivityIndicator,
  KeyboardAvoidingView, Animated
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LottieView from 'lottie-react-native';
import { supabase, EDGE_URL } from '../supabase';
import { COLORS, FONTS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatScreen({ navigation }: { navigation: any }) {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState<any>(null);
  const [profName, setProfName] = useState('');
  const [apiStatus, setApiStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const dotOpacity = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const flatListRef = useRef<FlatList<any>>(null);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  useEffect(() => {
    // Blinking animation for online status dot
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, [dotOpacity]);

  useEffect(() => {
    fetchInitData();
    pingApi();
  }, []);

  async function pingApi() {
    setApiStatus('connecting');
    try {
      // Lightweight ping to check if Supabase is reachable
      const { error } = await supabase.from('productos').select('sku').limit(1);
      if (error) throw error;
      setApiStatus('online');
    } catch (e) {
      setApiStatus('offline');
    }
  }

  async function fetchInitData() {
    try {
      // 1. Remote Config — leído con el token del usuario autenticado
      const { data: config, error: configError } = await supabase
        .from('app_config')
        .select('ai_prompt')
        .eq('id', 'global')
        .single();

      if (config) setRemoteConfig(config);

      // 2. Perfil Usuario
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (prof && prof.full_name && prof.full_name.trim() !== '') {
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
    } catch (e) {
      // Error silente al inicializar chat
    }
  }

  async function askChatbot() {
    if (!chatInput.trim()) return;
    setChatLoading(true);

    const userMsg = chatInput.trim();
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory);
    setChatInput('');

    let success = false;
    let lastError = '';

    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      const session = refreshData?.session || (await supabase.auth.getSession()).data?.session;
      
      const historyForApi = newHistory.filter(msg => !(msg.role === 'assistant' && msg.content.includes('Soy el Asistente IA de Comagro')));

      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: historyForApi,
          user_id: session?.user?.id || 'anon',
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
    } catch (err: any) {
      lastError = err.message;
    }

    if (!success) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Fallo de conexión en servidores IA: ${lastError}`
      }]);
    }

    setChatLoading(false);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }

  const parseMessage = (text: string) => {
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

  const renderProductCard = (sku: string, skusContext: string[]) => {
    return <AiProductCard key={sku} sku={sku} skusContext={skusContext} navigation={navigation} />;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.navy} barStyle="light-content" />

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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              {apiStatus === 'connecting' && <ActivityIndicator size={10} color={COLORS.gray3} style={{ marginRight: 4 }} />}
              {apiStatus === 'online' && (
                <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#1c9f4b', marginRight: 4, opacity: dotOpacity }} />
              )}
              {apiStatus === 'offline' && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D32F2F', marginRight: 4 }} />
              )}
              <Text style={[
                styles.headerSubtitle,
                apiStatus === 'online' && { color: '#1c9f4b' },
                apiStatus === 'offline' && { color: '#D32F2F' }
              ]}>
                {apiStatus === 'connecting' ? 'Conectando...' : (apiStatus === 'online' ? 'Online' : 'Desconectado')}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => { setChatHistory([]); fetchInitData(); pingApi(); }} style={styles.clearButton}>
          <Text style={styles.clearText}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
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
                    {skus.map(sku => renderProductCard(sku, skus))}
                  </View>
                )}
              </View>
            );
          }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={[styles.inputContainer, { paddingBottom: Platform.OS === 'android' ? Math.max(10, insets.bottom + 5) : 10 }]}>
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

const AiProductCard = ({ sku, skusContext, navigation }: { sku: string; skusContext: string[]; navigation: any }) => {
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    import('../utils/database').then(async ({ getProductBySku, fetchMissingProductFromCloud }) => {
      let p = await getProductBySku(sku);
      if (!p && isMounted) {
        // No está en local, lo buscamos en la nube "on-the-fly"
        p = await fetchMissingProductFromCloud(sku);
      }
      if (isMounted) {
        if (p) setProduct(p);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [sku]);

  if (loading) {
    return (
      <View style={[styles.productCard, { justifyContent: 'center', alignItems: 'center', minHeight: 80 }]}>
        <ActivityIndicator color={COLORS.navy} />
      </View>
    );
  }

  // Si a pesar de todo no existe, mostramos una tarjeta básica
  const displayBrand = product ? product.marca : 'Buscando catálogo...';
  const displayModel = product ? product.modelo : sku;
  const displayImage = product ? product.imagen : null;

  return (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => navigation.navigate('ProductViewer', { sku: displayModel, contextSkus: skusContext })}
    >
      <View style={styles.cardContent}>
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={styles.cardImage} contentFit="contain" />
        ) : (
          <View style={styles.cardImagePlaceholder} />
        )}
        <View style={styles.cardTextContainer}>
          <Text style={styles.cardBrand} numberOfLines={1}>{displayBrand}</Text>
          <Text style={styles.cardModel} numberOfLines={2}>{displayModel}</Text>
          <Text style={styles.cardAction}>Ver Ficha Técnica ›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

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
  cardImage: { width: 50, height: 50, marginRight: 10, borderRadius: 4 },
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
