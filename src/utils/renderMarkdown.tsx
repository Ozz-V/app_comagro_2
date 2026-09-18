/**
 * renderMarkdown.tsx
 * Utilidad compartida para parsear y renderizar el Markdown basico
 * generado por RichTextEditorModal.
 *
 * Marcadores soportados:
 *   **texto**           => negrita
 *   _texto_             => cursiva
 *   __texto__           => subrayado
 *   - texto             => viñeta con punto (•) al inicio de linea
 *   [[center]]...[[/center]] => texto centrado
 */
import React from 'react';
import { View, Text } from 'react-native';

interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'underline';
  content: string;
}

function tokenizeInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Orden importa: primero __underline__, luego **bold**, luego _italic_
  const pattern = /(__(.+?)__|\*\*(.+?)\*\*|_(.+?)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: line.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined) {
      tokens.push({ type: 'underline', content: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'bold', content: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'italic', content: match[4] });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: 'text', content: line.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', content: line }];
}

export function renderMarkdown(raw: string, baseStyle: object): React.ReactNode {
  if (!raw) return null;

  const lines = raw.split('\n');

  return lines.map((line, lineIdx) => {
    const isBullet   = line.trimStart().startsWith('- ');
    const isCentered = line.includes('[[center]]');
    const cleanLine  = line
      .replace(/\[\[center\]\]/g, '')
      .replace(/\[\[\/center\]\]/g, '')
      .replace(isBullet ? /^(\s*)-\s/ : /(?:)/, '');

    const tokens = tokenizeInline(cleanLine);

    const inlineNodes = tokens.map((tok, tokIdx) => {
      if (tok.type === 'bold') {
        return (
          <Text key={tokIdx} style={[baseStyle, { fontWeight: '700' }]}>
            {tok.content}
          </Text>
        );
      }
      if (tok.type === 'italic') {
        return (
          <Text key={tokIdx} style={[baseStyle, { fontStyle: 'italic' }]}>
            {tok.content}
          </Text>
        );
      }
      if (tok.type === 'underline') {
        return (
          <Text key={tokIdx} style={[baseStyle, { textDecorationLine: 'underline' }]}>
            {tok.content}
          </Text>
        );
      }
      return <Text key={tokIdx} style={baseStyle}>{tok.content}</Text>;
    });

    return (
      <View
        key={lineIdx}
        style={[
          { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 },
          isCentered && { justifyContent: 'center' },
        ]}
      >
        {isBullet && (
          <Text style={[baseStyle, { marginRight: 6 }]}>{'\u2022'}</Text>
        )}
        <Text style={[baseStyle, { textAlign: isCentered ? 'center' : 'left', flexShrink: 1 }]}>
          {inlineNodes}
        </Text>
      </View>
    );
  });
}
