import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../supabase';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';

const LOGO_BASE = 'https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/';

// Configurar comportamiento de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const OPCIONES = [
  { id: 'catalogos', screen: 'Catalogos', icon: 'doc', titulo: 'Catálogos Generales', desc: 'PDFs de catálogos por marca' },
  { id: 'fichas', screen: 'Fichas', icon: 'doc4', titulo: 'Fichas Técnicas', desc: 'Fichas técnicas por categoría' },
  { id: 'productos', screen: 'Productos', icon: 'buscar', titulo: 'Todos los Productos', desc: 'Catálogo completo con specs' },
  { id: 'config', screen: 'Config', icon: 'config', titulo: 'Configuración', desc: 'Perfil, Versión y Sistema' },
];

export default function PortalScreen({ navigation }) {
  const [recientes, setRecientes] = useState([]);
  const [analytics, setAnalytics] = useState({ vistos: [], buscados: [], compartidos: [] });
  const [tabAnalytics, setTabAnalytics] = useState('vistos'); // 'vistos' | 'buscados' | 'compartidos'
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  
  // Calculadora Beta
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcMode, setCalcMode] = useState('');
  const [calcInput, setCalcInput] = useState('');

  useEffect(() => {
    cargarTodo();
    registrarParaNotificaciones();
  }, []);

  // Recargar al volver a esta pantalla
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      cargarTodo();
    });
    return unsubscribe;
  }, [navigation]);

  async function cargarTodo() {
    cargarRecientes();
    cargarAnalytics();
  }

  async function registrarParaNotificaciones() {
    if (!Device.isDevice) return;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').upsert({ id: user.id, push_token: token });
    }
  }

  async function cargarRecientes() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('producto_analytics')
        .select('modelo, marca, sku, created_at')
        .eq('user_email', user.email)
        .eq('action', 'view')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        const seen = new Set();
        const unique = [];
        for (const item of data) {
          if (!seen.has(item.sku)) {
            seen.add(item.sku);
            unique.push(item);
          }
          if (unique.length >= 5) break;
        }
        setRecientes(unique);
      }
    } catch (e) {
      console.log('Error recientes:', e);
    }
  }

  async function cargarAnalytics() {
    setLoadingAnalytics(true);
    try {
      const [{ data: v }, { data: b }, { data: c }] = await Promise.all([
        supabase.from('producto_analytics').select('modelo, marca, sku').eq('action', 'view').limit(200),
        supabase.from('producto_analytics').select('modelo, marca, sku').eq('action', 'search').limit(200),
        supabase.from('producto_analytics').select('modelo, marca, sku').in('action', ['share_pdf', 'share_image']).limit(200)
      ]);

      setAnalytics({
        vistos: procesarTop(v || [], 4),
        buscados: procesarTop(b || [], 4),
        compartidos: procesarTop(c || [], 4)
      });
    } catch (e) {
      console.log('Error analytics:', e);
    } finally {
      setLoadingAnalytics(false);
    }
  }

  function procesarTop(items, limit) {
    const counts = {};
    items.forEach(i => {
      const key = i.sku || i.modelo;
      if (!counts[key]) counts[key] = { modelo: i.modelo, marca: i.marca, sku: i.sku, count: 0 };
      counts[key].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, limit);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <LottieView
          source={require('../../assets/iso.json')}
          autoPlay
          loop={true}
          style={styles.logoAnimado}
          resizeMode="contain"
        />
      </View>
      <View style={styles.topBorder} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.titulo}>Portal de Documentación</Text>
        <Text style={styles.subtitulo}>Elegí una sección para continuar</Text>

        {OPCIONES.map(op => (
          <TouchableOpacity
            key={op.id}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(op.screen)}
          >
            <View style={styles.iconWrap}>
              <SvgIcon name={op.icon} size={26} color={COLORS.navy} />
            </View>
            <View style={styles.cardTexts}>
              <Text style={styles.cardTitulo}>{op.titulo}</Text>
              <Text style={styles.cardDesc}>{op.desc}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.card, { backgroundColor: COLORS.navy, borderColor: COLORS.navy, marginTop: 10 }]}
          activeOpacity={0.8}
          onPress={() => { setCalcMode(''); setCalcInput(''); setShowCalcModal(true); }}
        >
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={{ fontSize: 24 }}>🧮</Text>
          </View>
          <View style={styles.cardTexts}>
            <Text style={[styles.cardTitulo, { color: COLORS.white }]}>Calculadora Beta</Text>
            <Text style={[styles.cardDesc, { color: 'rgba(255,255,255,0.7)' }]}>Dimensionamiento rápido de equipos</Text>
          </View>
        </TouchableOpacity>

        {/* Tendencias de la empresa */}
        <View style={styles.analyticsSection}>
          <Text style={styles.analyticsTitulo}>Tendencias de la empresa</Text>
          <View style={styles.tabButtons}>
            <TouchableOpacity onPress={() => setTabAnalytics('vistos')} style={[styles.tabBtn, tabAnalytics === 'vistos' && styles.tabBtnActive]}>
              <Text style={[styles.tabBtnText, tabAnalytics === 'vistos' && styles.tabBtnTextActive]}>Más vistos</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTabAnalytics('buscados')} style={[styles.tabBtn, tabAnalytics === 'buscados' && styles.tabBtnActive]}>
              <Text style={[styles.tabBtnText, tabAnalytics === 'buscados' && styles.tabBtnTextActive]}>Más buscados</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTabAnalytics('compartidos')} style={[styles.tabBtn, tabAnalytics === 'compartidos' && styles.tabBtnActive]}>
              <Text style={[styles.tabBtnText, tabAnalytics === 'compartidos' && styles.tabBtnTextActive]}>Más compartidos</Text>
            </TouchableOpacity>
          </View>

          {loadingAnalytics ? (
            <ActivityIndicator size="small" color={COLORS.navy} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.analyticsList}>
              {analytics[tabAnalytics].map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.rankRow}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Productos', { 
                    openProductSku: item.sku || item.modelo,
                    contextSkus: analytics[tabAnalytics].map(a => a.sku || a.modelo)
                  })}
                >
                  <Text style={styles.rankNum}>{idx + 1}</Text>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankModelo} numberOfLines={1}>{item.modelo}</Text>
                    <Text style={styles.rankMarca}>{item.marca}</Text>
                  </View>
                  <Text style={styles.rankCount}>{item.count}</Text>
                </TouchableOpacity>
              ))}
              {analytics[tabAnalytics].length === 0 && (
                <Text style={styles.emptyText}>Sin datos suficientes aún</Text>
              )}
            </View>
          )}
        </View>

        {/* Productos recientes */}
        {recientes.length > 0 && (
          <View style={styles.recientesSection}>
            <Text style={styles.recientesTitulo}>Tus últimos vistos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recientesScroll}>
              {recientes.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.recienteCard}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Productos', { 
                    openProductSku: item.sku || item.modelo,
                    contextSkus: recientes.map(r => r.sku || r.modelo)
                  })}
                >
                  <Image
                    source={{ uri: `${LOGO_BASE}${(item.marca || '').toUpperCase().replace(/\s+/g, '_')}.jpg` }}
                    style={styles.recienteLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.recienteModelo} numberOfLines={1}>{item.modelo}</Text>
                  <Text style={styles.recienteMarca} numberOfLines={1}>{item.marca}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Modal Calculadora Beta */}
      <Modal visible={showCalcModal} animationType="slide" transparent onRequestClose={() => setShowCalcModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, minHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.navy }}>Calculadora Beta</Text>
              <TouchableOpacity onPress={() => setShowCalcModal(false)}><Text style={{ fontSize: 24, color: COLORS.gray4 }}>✕</Text></TouchableOpacity>
            </View>
            
            <Text style={{ color: COLORS.gray4, marginBottom: 15 }}>Seleccioná un tipo de equipo para hacer un cálculo rápido:</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <TouchableOpacity onPress={() => setCalcMode('gen')} style={[{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, calcMode === 'gen' && { backgroundColor: COLORS.navy, borderColor: COLORS.navy }]}>
                <Text style={{ fontSize: 20, marginBottom: 5 }}>⚡</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: calcMode === 'gen' ? COLORS.white : COLORS.navy, textAlign: 'center' }}>Generador (KVA)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCalcMode('motor')} style={[{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, calcMode === 'motor' && { backgroundColor: COLORS.navy, borderColor: COLORS.navy }]}>
                <Text style={{ fontSize: 20, marginBottom: 5 }}>⚙️</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: calcMode === 'motor' ? COLORS.white : COLORS.navy, textAlign: 'center' }}>Motor Eléctrico (HP)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCalcMode('bomba')} style={[{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, calcMode === 'bomba' && { backgroundColor: COLORS.navy, borderColor: COLORS.navy }]}>
                <Text style={{ fontSize: 20, marginBottom: 5 }}>💧</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: calcMode === 'bomba' ? COLORS.white : COLORS.navy, textAlign: 'center' }}>Bomba de Agua (HP/Caudal)</Text>
              </TouchableOpacity>
            </View>

            {calcMode ? (
              <View>
                <Text style={{ fontWeight: 'bold', color: COLORS.navy, marginBottom: 10 }}>
                  Ingresá el valor {calcMode === 'gen' ? '(1 a 3000 KVA)' : calcMode === 'motor' ? '(1 a 500 HP)' : '(Caudal L/min o HP)'}
                </Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.navy, width: 50, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      if (current > 1) setCalcInput(String(current - 1));
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: 'bold' }}>-</Text>
                  </TouchableOpacity>
                  
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, fontSize: 18, color: COLORS.black, backgroundColor: '#F0F4F8', marginHorizontal: 10, textAlign: 'center' }}
                    keyboardType="numeric"
                    placeholder="Ej: 2"
                    value={calcInput}
                    onChangeText={setCalcInput}
                  />

                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.navy, width: 50, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const current = parseFloat(calcInput) || 0;
                      const max = calcMode === 'gen' ? 3000 : 500;
                      if (current < max) setCalcInput(String(current + 1));
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: 'bold' }}>+</Text>
                  </TouchableOpacity>
                </View>

                {parseFloat(calcInput) > 0 && (
                  <View style={{ backgroundColor: '#E3FAED', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: COLORS.green }}>
                    <Text style={{ fontWeight: 'bold', color: COLORS.green, marginBottom: 10 }}>Estimación rápida:</Text>
                    {calcMode === 'gen' && (
                      <View>
                        {parseFloat(calcInput) < 2 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💡 3 Luces{'\n'}📺 1 TV{'\n'}💻 1 Notebook{'\n'}📡 1 WiFi</Text> :
                         parseFloat(calcInput) < 4 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>❄️ 1 Heladera pequeña{'\n'}💡 5 Luces{'\n'}📺 1 TV{'\n'}📡 1 WiFi</Text> :
                         parseFloat(calcInput) < 6 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🌬️ 1 Aire (12.000 BTU){'\n'}❄️ 1 Heladera{'\n'}💡 8 Luces{'\n'}📺 2 TV</Text> :
                         parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🌬️ 2 Aires (12.000 BTU){'\n'}❄️ 1 Heladera{'\n'}💡 Toda la casa{'\n'}📺 3 TV</Text> :
                         parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🏢 Capacidad para locales comerciales medianos, oficinas con varios aires acondicionados, servidores y cámaras frigoríficas.</Text> :
                         parseFloat(calcInput) <= 250 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🏭 Uso Industrial Liviano: Fábricas pequeñas, supermercados completos, estaciones de servicio, edificios residenciales enteros.</Text> :
                         parseFloat(calcInput) <= 1000 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>🏗️ Uso Industrial Pesado: Centros comerciales (Shoppings), hospitales, grandes fábricas, frigoríficos industriales.</Text> :
                         <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚡ Gran Escala: Industrias electrointensivas, minería, respaldo para barrios enteros o centros de datos masivos.</Text>}
                      </View>
                    )}
                    {calcMode === 'motor' && (
                      <View>
                        {parseFloat(calcInput) <= 1 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Hormigoneras chicas, cortadoras de fiambre, portones eléctricos residenciales, ventiladores grandes.</Text> :
                         parseFloat(calcInput) <= 3 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Compresores medianos, sierras circulares, tornos pequeños, cintas transportadoras livianas.</Text> :
                         parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Amasadoras industriales, elevadores de autos, extractores pesados, trituradoras medianas, bombas centrífugas grandes.</Text> :
                         parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Maquinaria industrial de planta, cintas transportadoras largas, molinos, prensas hidráulicas pesadas.</Text> :
                         parseFloat(calcInput) <= 200 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso: Industria pesada, grandes compresores de planta, trituradoras de piedra, maquinaria minera liviana.</Text> :
                         <Text style={{ color: COLORS.navy, fontSize: 14 }}>⚙️ Uso Extremo: Industria naviera, minería pesada, bombas de acueductos, grandes molinos industriales.</Text>}
                      </View>
                    )}
                    {calcMode === 'bomba' && (
                      <View>
                        {parseFloat(calcInput) <= 1 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso doméstico: Llenado de tanques (hasta 15m), riego de jardines chicos, circulación de agua, pozos poco profundos.</Text> :
                         parseFloat(calcInput) <= 3 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso comercial/Residencial: Edificios de 3-5 pisos, riego por aspersión mediano, llenado de piscinas rápido.</Text> :
                         parseFloat(calcInput) <= 10 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso agrícola/Edificios: Riego agrícola por goteo/aspersión, edificios altos (más de 10 pisos), sistemas contra incendios pequeños.</Text> :
                         parseFloat(calcInput) <= 50 ? <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso Industrial: Torres de refrigeración, sistemas contra incendios industriales, extracción de pozos artesianos profundos.</Text> :
                         <Text style={{ color: COLORS.navy, fontSize: 14 }}>💧 Uso Gran Escala: Plantas de tratamiento de agua, acueductos, riego agrícola masivo, drenaje de minas.</Text>}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },

  topbar: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  topBorder: { height: 1, backgroundColor: COLORS.border },
  logoAnimado: { width: 100, height: 40 },

  content: {
    padding: 24,
    paddingTop: 32,
  },

  titulo: {
    fontFamily: FONTS.heading,
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 6,
  },
  subtitulo: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    marginBottom: 28,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    padding: 18,
    marginBottom: 14,
    borderRadius: 12,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTexts: { flex: 1 },
  cardTitulo: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
  },
  cardArrow: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    color: COLORS.gray5,
  },

  // Recientes
  recientesSection: {
    marginTop: 24,
  },
  recientesTitulo: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 14,
  },
  recientesScroll: {
    flexDirection: 'row',
  },
  recienteCard: {
    width: 110,
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    alignItems: 'center',
  },
  recienteLogo: {
    width: 50,
    height: 30,
    marginBottom: 8,
  },
  recienteModelo: {
    fontFamily: FONTS.heading,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
    textAlign: 'center',
  },
  recienteMarca: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.gray4,
    textAlign: 'center',
    marginTop: 2,
  },
  analyticsSection: {
    marginTop: 28,
  },
  analyticsTitulo: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 12,
  },
  tabButtons: {
    flexDirection: 'row',
    backgroundColor: '#F0F4F8',
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: COLORS.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabBtnText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: COLORS.navy,
  },
  analyticsList: {
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    padding: 10,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  rankNum: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.green,
    width: 24,
  },
  rankInfo: { flex: 1 },
  rankModelo: {
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.navy,
  },
  rankMarca: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.gray4,
  },
  rankCount: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.gray4,
    fontStyle: 'italic',
    padding: 20,
    fontSize: 12,
  },
});
