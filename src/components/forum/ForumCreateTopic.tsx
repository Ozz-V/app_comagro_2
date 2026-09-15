import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { COLORS } from '../../theme';
import SvgIcon from '../SvgIcon';
import { styles } from './ForumStyles';

interface Props {
  newTopicTitle: string;
  setNewTopicTitle: (v: string) => void;
  newTopicDesc: string;
  setNewTopicDesc: (v: string) => void;
  newTopicImg: string | null;
  setNewTopicImg: (v: string | null) => void;
  editingTopicId: string | null;
  loading: boolean;
  onPickImage: (setImg: (uri: string | null) => void) => void;
  onSubmit: () => void;
}

export default function ForumCreateTopic({
  newTopicTitle, setNewTopicTitle,
  newTopicDesc, setNewTopicDesc,
  newTopicImg, setNewTopicImg,
  editingTopicId, loading,
  onPickImage, onSubmit,
}: Props) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.createContainer}>
        <Text style={styles.label}>Título del Tema</Text>
        <TextInput style={styles.input} value={newTopicTitle} onChangeText={setNewTopicTitle} placeholder="Ej. Mejorar el filtro de calculadoras" placeholderTextColor={COLORS.gray1} maxLength={100} />

        <Text style={styles.label}>Descripción (máx 450 caracteres)</Text>
        <TextInput style={[styles.input, styles.textArea]} value={newTopicDesc} onChangeText={setNewTopicDesc} placeholder="Explica tu sugerencia... (usa *texto* para negrita)" placeholderTextColor={COLORS.gray1} multiline maxLength={450} textAlignVertical="top" />

        <View style={styles.imgPickerRow}>
          <TouchableOpacity style={styles.imgPickerBtn} onPress={() => onPickImage(setNewTopicImg)}>
            <SvgIcon name="camera" size={20} color={COLORS.navy} />
            <Text style={styles.imgPickerTxt}>{newTopicImg ? 'Cambiar Foto' : 'Adjuntar Foto'}</Text>
          </TouchableOpacity>

          {newTopicImg && (
            <View style={styles.imgPreviewCont}>
              <Image source={{ uri: newTopicImg }} style={styles.imgPreview} />
              <TouchableOpacity style={styles.imgRemoveBtn} onPress={() => setNewTopicImg(null)}>
                <Text style={styles.imgRemoveTxt}>X</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnTxt}>{editingTopicId ? 'Guardar Cambios' : 'Publicar Sugerencia'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
