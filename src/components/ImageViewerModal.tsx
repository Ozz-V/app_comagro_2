import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Text, ActivityIndicator } from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import SvgIcon from './SvgIcon';

interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  onShareRequest?: () => void;
}

export default function ImageViewerModal({ visible, images, initialIndex = 0, onClose, onShareRequest }: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Sync state if initialIndex changes when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  if (!visible || !images || images.length === 0) return null;

  const formattedImages = images.map(url => ({ url }));

  const handleShare = () => {
    if (onShareRequest) {
      onShareRequest();
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
          <TouchableOpacity onPress={handleShare} style={styles.iconButton}>
            <SvgIcon name="share" color="#fff" size={24} />
          </TouchableOpacity>
        </View>

        {/* Swipeable & Zoomable Viewer */}
        <ImageViewer
          imageUrls={formattedImages}
          index={currentIndex}
          onChange={(index) => setCurrentIndex(index || 0)}
          enableSwipeDown={true}
          onSwipeDown={onClose}
          renderIndicator={() => <></>} // We render our own indicator in top bar
          renderHeader={() => <View />} // Remove default header
          backgroundColor="transparent"
          loadingRender={() => <ActivityIndicator size="large" color="#fff" />}
        />
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
});
