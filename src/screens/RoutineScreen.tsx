import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useRoutineStore, RoutineItem } from '../store/routineStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

export function RoutineScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const { items, addItem, removeItem, toggleComplete, isCompletedToday, getCompletedCount } = useRoutineStore();
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const updateItem = useRoutineStore((s) => s.updateItem);

  const completedCount = getCompletedCount();
  const totalCount = items.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  const handleAdd = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    addItem(trimmed);
    setNewTitle('');
  };

  const handleRemove = (item: RoutineItem) => {
    Alert.alert('Удалить?', `"${item.title}"`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeItem(item.id) },
    ]);
  };

  const startEdit = (item: RoutineItem) => {
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

  const renderItem = ({ item, index }: { item: RoutineItem; index: number }) => {
    const done = isCompletedToday(item.id);
    const isEditing = editingId === item.id;
    const bgColor = index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent';

    return (
      <View style={[styles.row, { backgroundColor: bgColor }]}>
        <TouchableOpacity
          style={[styles.checkbox, { borderColor: done ? c.success : c.border, backgroundColor: done ? c.success : 'transparent' }]}
          onPress={() => toggleComplete(item.id)}
        >
          {done && <Text style={styles.checkmark}>✓</Text>}
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
          <TouchableOpacity style={styles.titleArea} onLongPress={() => startEdit(item)}>
            <Text style={[styles.title, { color: done ? c.textSecondary : c.text, textDecorationLine: done ? 'line-through' : 'none' }]}>
              {item.title}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => handleRemove(item)} style={styles.deleteBtn}>
          <Text style={{ color: c.danger, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Progress bar */}
      {totalCount > 0 && (
        <View style={styles.progressSection}>
          <View style={[styles.progressBar, { backgroundColor: c.border }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: progress === 1 ? c.success : c.primary }]} />
          </View>
          <Text style={[styles.progressText, { color: progress === 1 ? c.success : c.textSecondary }]}>
            {completedCount}/{totalCount}{progress === 1 ? ' — Все выполнено!' : ''}
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔄</Text>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет ежедневных задач</Text>
            <Text style={[styles.emptyHint, { color: c.textSecondary }]}>Добавьте привычки которые нужно{'\n'}выполнять каждый день</Text>
          </View>
        }
      />

      {/* Add input */}
      <View style={[styles.addRow, { backgroundColor: c.card, borderTopColor: c.border }]}>
        <TextInput
          style={[styles.addInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Новая ежедневная задача..."
          placeholderTextColor={c.textSecondary}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.primary, opacity: newTitle.trim() ? 1 : 0.4 }]}
          onPress={handleAdd}
          disabled={!newTitle.trim()}
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 13, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  titleArea: { flex: 1 },
  title: { fontSize: 16 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16 },
  deleteBtn: { padding: 4 },
  addRow: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1 },
  addInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#FFF', fontSize: 24, fontWeight: '600' },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  emptyHint: { fontSize: 14, marginTop: 4, textAlign: 'center' },
});
