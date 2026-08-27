import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Text, Share, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import SvgIcon from './SvgIcon';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ImageViewerModal({ visible, images, initialIndex = 0, onClose }: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isSharing, setIsSharing] = useState(false);

  // Sync state if initialIndex changes when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  if (!visible || !images || images.length === 0) return null;

  const currentImage = images[currentIndex];

  const handleNext = () => {
    if (currentIndex < images.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleShare = async () => {
    try {
      setIsSharing(true);
      const fileName = `imagen_${currentIndex + 1}.jpg`;
      const localUri = FileSystem.cacheDirectory + fileName;
      
      // Download the image to cache first to share the actual file
      const { uri } = await FileSystem.downloadAsync(currentImage, localUri);
      
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri });
      } else {
        await Sharing.shareAsync(uri, {
          dialogTitle: 'Compartir imagen',
          mimeType: 'image/jpeg',
        });
      }
    } catch (error) {
      console.error('Error sharing image:', error);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.iconButton}>
            <SvgIcon name="close" color="#fff" size={28} />
          </TouchableOpacity>
          <Text style={styles.counterText}>
            {images.length > 1 ? `${currentIndex + 1} / ${images.length}` : ''}
          </Text>
          <TouchableOpacity onPress={handleShare} style={styles.iconButton} disabled={isSharing}>
            {isSharing ? <ActivityIndicator color="#fff" /> : <SvgIcon name="share" color="#fff" size={24} />}
          </TouchableOpacity>
        </View>

        {/* Image Viewer with Zoom (ScrollView) */}
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          centerContent
        >
          <Image 
            source={{ uri: currentImage }} 
            style={styles.image} 
            contentFit="contain" 
          />
        </ScrollView>

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            {currentIndex > 0 && (
              <TouchableOpacity style={[styles.navButton, styles.navLeft]} onPress={handlePrev}>
                <SvgIcon name="chevronLeft" color="#fff" size={36} />
              </TouchableOpacity>
            )}
            {currentIndex < images.length - 1 && (
              <TouchableOpacity style={[styles.navButton, styles.navRight]} onPress={handleNext}>
                <SvgIcon name="chevronRight" color="#fff" size={36} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 15,
    zIndex: 10,
  },
  iconButton: {
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
  },
  counterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -25,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 50,
  },
  navLeft: {
    left: 20,
  },
  navRight: {
    right: 20,
  },
});
