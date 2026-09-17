import React from 'react';
import { Text } from 'react-native';
import { styles } from './ForumStyles';

interface Props {
  text: string;
}

export default function FormattedText({ text }: Props) {
  const parts = text.split(/(\*.*?\*)/g);

  return (
    <Text style={styles.msgText}>
      {parts.map((part, index) => (part.startsWith('*') && part.endsWith('*') && part.length > 2) ? (
        <Text key={index} style={{ fontWeight: 'bold' }}>{part.substring(1, part.length - 1)}</Text>
      ) : (<Text key={index}>{part}</Text>))}
    </Text>
  );
}
