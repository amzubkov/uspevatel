import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

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
        style={[styles.input, { color: c.text }]}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleAdd}
        returnKeyType="done"
      />
      <TouchableOpacity style={[styles.button, { backgroundColor: c.primary }]} onPress={handleAdd}>
        <Text style={styles.buttonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 8,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  input: { flex: 1, fontSize: 15, paddingHorizontal: 12, paddingVertical: 8 },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFF', fontSize: 24, fontWeight: '600', marginTop: -2 },
});
