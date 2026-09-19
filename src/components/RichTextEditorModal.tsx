import React, { useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { COLORS, FONTS } from '../theme';
import { renderMarkdown } from '../utils/renderMarkdown';

// ---------------------------------------------------------------------------
// SVG icons para la toolbar (todos inline, sin dependencias externas)
// ---------------------------------------------------------------------------
const IcBold      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>`;
const IcItalic    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`;
const IcUnderline = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`;
const IcBullet    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>`;
const IcCenter    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`;
// Mismos paths que 'edit' y 'ojo' en SvgIcon.tsx, para mantener consistencia
// con el resto de la app (no usar emojis genericos aca).
const IcEdit      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
const IcEye       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface Props {
  visible: boolean;
  initialValue: string;
  placeholder?: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

interface Selection {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Helpers de formato de texto
// ---------------------------------------------------------------------------

/** Envuelve la seleccion actual con un marcador de apertura y cierre.
 *  Si la seleccion ya esta envuelta con ese marcador, lo quita (toggle). */
function wrapSelection(text: string, sel: Selection, open: string, close: string): string {
  const before = text.slice(0, sel.start);
  const selected = text.slice(sel.start, sel.end);
  const after = text.slice(sel.end);

  // Toggle: si ya esta envuelto, lo quitamos
  if (selected.startsWith(open) && selected.endsWith(close)) {
    return before + selected.slice(open.length, selected.length - close.length) + after;
  }

  return before + open + selected + close + after;
}

/** Agrega "- " al principio de cada linea seleccionada como viñeta. */
function applyBullet(text: string, sel: Selection): string {
  const before = text.slice(0, sel.start);
  const selected = text.slice(sel.start, sel.end);
  const after = text.slice(sel.end);

  const lines = selected.split('\n');
  const allBulleted = lines.every(l => l.startsWith('- '));

  const toggled = allBulleted
    ? lines.map(l => l.replace(/^- /, '')).join('\n')
    : lines.map(l => (l.startsWith('- ') ? l : `- ${l}`)).join('\n');

  return before + toggled + after;
}

/** Agrega [[center]]...[[/center]] a la seleccion (marcador de centrado). */
function applyCenter(text: string, sel: Selection): string {
  return wrapSelection(text, sel, '[[center]]', '[[/center]]');
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function RichTextEditorModal({
  visible,
  initialValue,
  placeholder = 'Escribe aqui...',
  onConfirm,
  onCancel,
}: Props) {
  const [text, setText] = useState(initialValue);
  const [sel, setSel] = useState<Selection>({ start: 0, end: 0 });
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const inputRef = useRef<TextInput>(null);

  // Sincronizar el texto inicial cuando el modal abre con un valor distinto
  React.useEffect(() => {
    if (visible) {
      setText(initialValue);
      setMode('edit');
    }
  }, [visible, initialValue]);

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setSel(e.nativeEvent.selection);
    },
    []
  );

  const applyFormat = useCallback(
    (formatter: (t: string, s: Selection) => string) => {
      const newText = formatter(text, sel);
      setText(newText);
      // Devolver el foco al campo de texto despues de aplicar formato
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [text, sel]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Cuerpo del mensaje</Text>
            <TouchableOpacity onPress={() => onConfirm(text)} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, styles.headerBtnConfirm]}>Listo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.border} />

          {/* Toolbar de formato + toggle Editar/Previsualizar */}
          <View style={styles.toolbar}>
            {mode === 'edit' ? (
              <>
                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => applyFormat((t, s) => wrapSelection(t, s, '**', '**'))}
                  activeOpacity={0.6}
                >
                  <SvgXml xml={IcBold} width={20} height={20} color={COLORS.navy} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => applyFormat((t, s) => wrapSelection(t, s, '_', '_'))}
                  activeOpacity={0.6}
                >
                  <SvgXml xml={IcItalic} width={20} height={20} color={COLORS.navy} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => applyFormat((t, s) => wrapSelection(t, s, '__', '__'))}
                  activeOpacity={0.6}
                >
                  <SvgXml xml={IcUnderline} width={20} height={20} color={COLORS.navy} />
                </TouchableOpacity>

                <View style={styles.toolSep} />

                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => applyFormat(applyBullet)}
                  activeOpacity={0.6}
                >
                  <SvgXml xml={IcBullet} width={20} height={20} color={COLORS.navy} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => applyFormat(applyCenter)}
                  activeOpacity={0.6}
                >
                  <SvgXml xml={IcCenter} width={20} height={20} color={COLORS.navy} />
                </TouchableOpacity>

                <View style={styles.toolSep} />
              </>
            ) : null}

            {/* Toggle Editar / Vista Previa */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'edit' && styles.modeBtnActive]}
                onPress={() => {
                  setMode('edit');
                  setTimeout(() => inputRef.current?.focus(), 80);
                }}
              >
                <View style={styles.modeBtnRow}>
                  <SvgXml
                    xml={IcEdit}
                    width={14}
                    height={14}
                    color={mode === 'edit' ? COLORS.navy : COLORS.gray4}
                  />
                  <Text style={[styles.modeBtnText, mode === 'edit' && styles.modeBtnTextActive]}>
                    Editar
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'preview' && styles.modeBtnActive]}
                onPress={() => setMode('preview')}
              >
                <View style={styles.modeBtnRow}>
                  <SvgXml
                    xml={IcEye}
                    width={14}
                    height={14}
                    color={mode === 'preview' ? COLORS.navy : COLORS.gray4}
                  />
                  <Text style={[styles.modeBtnText, mode === 'preview' && styles.modeBtnTextActive]}>
                    Vista Previa
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.border} />

          {/* Contenido: editor o preview */}
          <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled">
            {mode === 'edit' ? (
              <TextInput
                ref={inputRef}
                style={styles.textArea}
                value={text}
                onChangeText={setText}
                onSelectionChange={handleSelectionChange}
                multiline
                autoFocus
                placeholder={placeholder}
                placeholderTextColor={COLORS.gray4}
                textAlignVertical="top"
                scrollEnabled={false}
              />
            ) : (
              <View style={styles.previewArea}>
                {text.trim().length === 0 ? (
                  <Text style={styles.previewEmpty}>El mensaje está vacío...</Text>
                ) : (
                  renderMarkdown(text, styles.previewText)
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  headerBtnText: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.gray4,
  },
  headerBtnConfirm: {
    color: COLORS.green,
    fontFamily: FONTS.bodySemi,
  },
  border: { height: 1, backgroundColor: COLORS.border },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    backgroundColor: COLORS.white,
    flexWrap: 'wrap',
  },
  toolBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  toolSep: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
    marginHorizontal: 4,
  },
  modeToggle: {
    flexDirection: 'row',
    marginLeft: 'auto',
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 2,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  modeBtnActive: {
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeBtnText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.gray4,
  },
  modeBtnTextActive: {
    color: COLORS.navy,
    fontFamily: FONTS.bodySemi,
  },
  textArea: {
    flex: 1,
    padding: 16,
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.navy,
    lineHeight: 24,
    minHeight: 300,
  },
  previewArea: {
    padding: 16,
    minHeight: 300,
  },
  previewText: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.navy,
    lineHeight: 24,
  },
  previewEmpty: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.gray4,
    fontStyle: 'italic',
  },
});