import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useChecklistStore, CheckItem } from '../store/checklistStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { QuickAddBar } from '../components/QuickAddBar';

export function CheckScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const { items, addItem, removeItem, toggleItem, updateItem } = useChecklistStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const undone = useMemo(() => items.filter((i) => !i.done), [items]);
  const done = useMemo(() => items.filter((i) => i.done), [items]);
  const sorted = useMemo(() => [...undone, ...done], [undone, done]);

  const doneCount = done.length;
  const totalCount = items.length;

  const startEdit = (item: CheckItem) => {
    setEditingId(item.id);
    setEditText(item.title);
  };

  const saveEdit = () => {
    if (editingId && editText.trim()) {
      updateItem(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText('');
  };

  const handleRemove = (item: CheckItem) => {
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Удалить "${item.title}"?`)) removeItem(item.id);
    } else {
      Alert.alert('Удалить?', `"${item.title}"`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => removeItem(item.id) },
      ]);
    }
  };

  const renderItem = ({ item, index }: { item: CheckItem; index: number }) => {
    const isEditing = editingId === item.id;
    const bgColor = index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent';

    return (
      <View style={[styles.row, { backgroundColor: bgColor }]}>
        <TouchableOpacity
          style={[styles.checkbox, { borderColor: item.done ? c.success : c.border, backgroundColor: item.done ? c.success : 'transparent' }]}
          onPress={() => toggleItem(item.id)}
        >
          {item.done && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>

        {isEditing ? (
          <TextInput
            style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
            value={editText}
            onChangeText={setEditText}
            onSubmitEditing={saveEdit}
            onBlur={saveEdit}
            autoFocus
          />
        ) : (
          <TouchableOpacity style={styles.titleArea} onLongPress={() => startEdit(item)} onPress={() => toggleItem(item.id)}>
            <Text style={[styles.title, { color: item.done ? c.textSecondary : c.text, textDecorationLine: item.done ? 'line-through' : 'none' }]}>
              {item.title}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => handleRemove(item)} style={styles.deleteBtn}>
          <Text style={{ color: c.danger, fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <QuickAddBar placeholder="Новый пункт..." onAdd={(title) => addItem(title)} />

      {totalCount > 0 && (
        <View style={styles.progressSection}>
          <View style={[styles.progressBar, { backgroundColor: c.border }]}>
            <View style={[styles.progressFill, { width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`, backgroundColor: doneCount === totalCount ? c.success : c.primary }]} />
          </View>
          <Text style={[styles.progressText, { color: doneCount === totalCount ? c.success : c.textSecondary }]}>
            {doneCount}/{totalCount}{doneCount === totalCount && totalCount > 0 ? ' ✓' : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={sorted}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>✅</Text>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>Чеклист пуст</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  titleArea: { flex: 1 },
  title: { fontSize: 15 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 15 },
  deleteBtn: { padding: 4 },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 12 },
});
