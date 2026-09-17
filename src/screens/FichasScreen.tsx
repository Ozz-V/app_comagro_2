import React from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Image, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Platform, BackHandler,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { COLORS, FONTS } from '../theme';
import SvgIcon from '../components/SvgIcon';
import PdfViewerModal from '../components/PdfViewerModal';
import { useFichasLogic, Ficha, ListItem } from '../hooks/useFichasLogic';
import { styles } from './FichasStyles';

const ANIMATION_ISO = require('../../assets/iso.json');
const LOGO = { uri: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png' };
const BUCKET = 'Fichas';

export default function FichasScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void; goBack: () => void; [key: string]: unknown } }) {
  const {
    allFiles, categorias, catActual, setCatActual, busqueda, setBusqueda,
    cargando, refreshing, error, abriendo, pdfModal, setPdfModal,
    manifest, isOnline, onRefresh, cargarTodo, abrirFicha
  } = useFichasLogic();

  const listaFiltrada = React.useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    const items: ListItem[] = [];

    if (catActual === 'TODAS' && !q) {
      categorias.forEach(cat => {
        items.push({ type: 'folder', key: `folder-${cat}`, cat });
      });
      return items;
    }

    const cats = catActual === 'TODAS' ? categorias : [catActual];
    cats.forEach(cat => {
      const files = allFiles[cat] || [];
      const filtrados = q ? files.filter(f => f.name.toLowerCase().includes(q)) : files;
      if (catActual === 'TODAS' && filtrados.length) {
        items.push({ type: 'label', key: `label-${cat}`, cat });
      }
      filtrados.forEach(f => items.push({ type: 'file', key: f.path, ...f }));
    });
    return items;
  }, [allFiles, catActual, busqueda, categorias]);

  function renderItem({ item }: { item: ListItem }) {
    if (item.type === 'folder') {
      return (
        <TouchableOpacity style={styles.folderBtn} onPress={() => { setCatActual(item.cat!); setBusqueda(''); }} activeOpacity={0.8}>
          <Text style={styles.folderBtnText}>{item.cat}</Text>
          <Text style={{ fontSize: 24, color: COLORS.gray4, marginTop: -4 }}>›</Text>
        </TouchableOpacity>
      );
    }
    if (item.type === 'label') {
      return <Text style={styles.catLabel}>{item.cat}</Text>;
    }
    const descargado = !!(manifest && item.path && manifest[item.path]);
    const offlineDisabled = !descargado && !isOnline;
    return (
      <TouchableOpacity
        style={[styles.fileItem, offlineDisabled && { opacity: 0.45 }]}
        onPress={() => (descargado || isOnline) && item.path ? abrirFicha(item.path, item.name || '') : null}
        disabled={!!abriendo || offlineDisabled}
        activeOpacity={0.7}
      >
        <View style={[styles.fileIcon, descargado && { backgroundColor: COLORS.green }]}>
          <Text style={[styles.fileBadge, descargado && { color: COLORS.white }]}>PDF</Text>
        </View>
        <Text style={[styles.fileName, offlineDisabled && { color: COLORS.gray4 }]} numberOfLines={2}>{item.name}</Text>
        {descargado
          ? <Text style={{ fontSize: 11, color: COLORS.green, fontFamily: FONTS.body, marginLeft: 4 }}>✓</Text>
          : (!isOnline ? null : <SvgIcon name="cloud" size={14} color={COLORS.navy} />)
        }
        {!descargado && item.size ? <Text style={[styles.fileSize, {marginLeft: 6}]}>{Math.round(item.size / 1024)} KB</Text> : null}
        {abriendo === item.path
          ? <ActivityIndicator size="small" color={COLORS.navy} />
          : null
        }
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Topbar */}
      <View style={styles.topbar}>
        <View style={styles.topbarHeader}>
          <LottieView
            source={ANIMATION_ISO}
            autoPlay
            loop={true}
            style={styles.logoAnimado}
            resizeMode="contain"
          />
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar ficha…"
            placeholderTextColor={COLORS.gray4}
            value={busqueda}
            onChangeText={setBusqueda}
          />
        </View>
      </View>
      <View style={styles.topBorder} />

      {/* Aviso de reconexión si no hay red */}
      {!isOnline && !cargando ? (
        <View style={{ backgroundColor: '#fdf2f2', paddingVertical: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: '#e74c3c', fontFamily: FONTS.body }}>Sin conexión. Tira de la lista hacia abajo para reconectar.</Text>
        </View>
      ) : null}

      {/* Contenido */}
      {cargando ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.navy} />
          <Text style={styles.centerText}>Cargando fichas…</Text>
        </View>
      ) : listaFiltrada.length > 0 ? (
        <FlatList
          data={listaFiltrada}
          renderItem={renderItem}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.navy]}
              tintColor={COLORS.navy}
            />
          }
        />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {!isOnline ? 'No hay conexión. Conéctate a internet para cargar los datos por primera vez.' : error}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => cargarTodo(true)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.centerText}>Sin fichas para esta búsqueda</Text>
        </View>
      )}

      <PdfViewerModal
        visible={pdfModal.visible}
        url={pdfModal.url}
        title={pdfModal.title}
        onClose={() => setPdfModal({ visible: false, url: null, title: null })}
      />
    </SafeAreaView>
  );
}

