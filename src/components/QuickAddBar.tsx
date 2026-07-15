import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { VoiceInputButton } from './VoiceInputButton';
import { PolishTextButton } from './PolishTextButton';

interface Props {
  onAdd: (action: string) => void;
  placeholder?: string;
}

export function QuickAddBar({ onAdd, placeholder = 'Быстрое добавление...' }: Props) {
  const [text, setText] = useState('');
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.card, borderColor: c.border }]}>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleAdd}
        returnKeyType="done"
      />
      <VoiceInputButton size={18} onText={(t) => setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))} />
      <PolishTextButton size={16} text={text} onText={setText} />
      <TouchableOpacity
        style={[styles.button, { backgroundColor: c.primary, opacity: text.trim() ? 1 : 0.4 }]}
        onPress={handleAdd}
        disabled={!text.trim()}
      >
        <Text style={styles.buttonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderRadius: 6 },
  button: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: '600', marginTop: -1 },
});
