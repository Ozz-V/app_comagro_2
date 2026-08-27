import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Text, ScrollView, Platform } from 'react-native';
import { Image } from 'expo-image';
import SvgIcon from './SvgIcon';

interface ImageSelectionModalProps {
  visible: boolean;
  images: string[];
  onClose: () => void;
  onConfirm: (selectedImages: string[]) => void;
}

export default function ImageSelectionModal({ visible, images, onClose, onConfirm }: ImageSelectionModalProps) {
  const MAX_IMAGES = 4;
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Reset selection when modal opens (select up to MAX_IMAGES by default)
  React.useEffect(() => {
    if (visible) {
      const initialSelection = new Set<number>();
      for (let i = 0; i < Math.min(images.length, MAX_IMAGES); i++) {
        initialSelection.add(i);
      }
      setSelectedIndices(initialSelection);
    }
  }, [visible, images]);

  if (!visible || !images || images.length === 0) return null;

  const toggleSelection = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      if (next.size >= MAX_IMAGES) {
        // We reached limit, ignore or show alert
        // (Could trigger a toast, but keeping it simple: just don't add)
        return;
      }
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const handleConfirm = () => {
    const selectedUrls = Array.from(selectedIndices).sort().map(i => images[i]);
    onConfirm(selectedUrls);
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Compartir Ficha</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <SvgIcon name="close" color="#666" size={24} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.subtitle}>
            Selecciona hasta {MAX_IMAGES} imágenes para incluir en el documento (límite por diseño y memoria).
          </Text>
          
          <ScrollView contentContainerStyle={styles.grid}>
            {images.map((img, i) => (
              <TouchableOpacity 
                key={i} 
                style={[styles.imageContainer, selectedIndices.has(i) && styles.imageContainerSelected]}
                onPress={() => toggleSelection(i)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: img }} style={styles.image} contentFit="contain" />
                <View style={[styles.checkbox, selectedIndices.has(i) && styles.checkboxSelected]}>
                  {selectedIndices.has(i) && <SvgIcon name="check" color="#fff" size={16} />}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity 
            style={[styles.confirmBtn, selectedIndices.size === 0 && styles.confirmBtnDisabled]} 
            onPress={handleConfirm}
            disabled={selectedIndices.size === 0}
          >
            <Text style={styles.confirmBtnText}>
              Compartir con {selectedIndices.size} imagen{selectedIndices.size !== 1 ? 'es' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      }
    })
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeBtn: {
    padding: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingBottom: 20,
  },
  imageContainer: {
    width: '30%',
    aspectRatio: 1,
    margin: '1.5%',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#eee',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f9f9f9',
  },
  imageContainerSelected: {
    borderColor: '#3b82f6', // Comagro Blue or similar active color
  },
  image: {
    width: '100%',
    height: '100%',
  },
  checkbox: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  confirmBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  confirmBtnDisabled: {
    backgroundColor: '#ccc',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
