import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Поиск...' }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  return (
    <View style={[styles.container, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={[styles.input, { color: c.text }]}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clear}>
          <Text style={[styles.clearText, { color: c.textSecondary }]}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  icon: { fontSize: 14, marginRight: 6 },
  input: { flex: 1, fontSize: 14, paddingVertical: 8 },
  clear: { padding: 4 },
  clearText: { fontSize: 16, fontWeight: '600' },
});
