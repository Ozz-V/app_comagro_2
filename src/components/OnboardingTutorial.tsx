import React, { useState, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions, FlatList } from 'react-native';
import { COLORS, FONTS } from '../theme';
import SvgIcon from './SvgIcon';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85;

const SLIDES = [
  {
    id: '1',
    title: 'Todos los productos',
    desc: 'Buscá cualquier producto, mirá sus fotos, ficha y características. Podés generar PDFs o copiar el resumen en un clic para mandarlo por WhatsApp.',
    icon: 'buscar'
  },
  {
    id: '2',
    title: 'Fichas y Catálogos',
    desc: 'Accedé a catálogos generales o fichas técnicas específicas. Siempre disponibles, incluso sin internet si ya los abriste antes.',
    icon: 'doc'
  },
  {
    id: '3',
    title: 'Calculadora de Equipos',
    desc: 'Calculá rápidamente qué bomba, generador o motor eléctrico necesita tu cliente según los requerimientos técnicos.',
    icon: 'calculadora'
  },
  {
    id: '4',
    title: 'Chat IA',
    desc: '¿Tenés una duda técnica o de ventas? Preguntale a la Inteligencia Artificial de Comagro en tiempo real.',
    icon: 'agenteIA'
  },
  {
    id: '5',
    title: 'Configuraciones',
    desc: 'Configurá tu perfil, mirá qué productos son los más buscados, y accedé al directorio de contactos de la empresa.',
    icon: 'config'
  }
];

interface OnboardingTutorialProps {
  visible: boolean;
  onClose: () => void;
}

export default function OnboardingTutorial({ visible, onClose }: OnboardingTutorialProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  function nextSlide() {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      onClose();
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <FlatList
            ref={flatListRef}
            data={SLIDES}
            keyExtractor={item => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentIndex(idx);
            }}
            renderItem={({ item }) => (
              <View style={styles.slide}>
                <View style={styles.iconCircle}>
                  <SvgIcon name={item.icon} size={40} color={COLORS.navy} />
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.desc}>{item.desc}</Text>
              </View>
            )}
          />

          {/* Dots Indicator */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
            ))}
          </View>

          {/* Botones */}
          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onClose} style={styles.btnSkip}>
              <Text style={styles.btnSkipText}>Saltar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={nextSlide} style={styles.btnNext}>
              <Text style={styles.btnNextText}>
                {currentIndex === SLIDES.length - 1 ? 'Comenzar' : 'Siguiente'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: width,
    height: height,
    backgroundColor: COLORS.white,
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f7f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8ECF0',
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: 20,
    color: COLORS.navy,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  desc: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.gray4,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
    marginBottom: 30,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8ECF0',
  },
  dotActive: {
    width: 14,
    backgroundColor: COLORS.navy,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  btnSkip: {
    padding: 10,
  },
  btnSkipText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.gray4,
    opacity: 0.7,
  },
  btnNext: {
    backgroundColor: COLORS.navy,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  btnNextText: {
    fontFamily: FONTS.bodySemi,
    fontSize: 14,
    color: COLORS.white,
  },
});
