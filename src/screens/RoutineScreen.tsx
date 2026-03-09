import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { QuickAddBar } from '../components/QuickAddBar';
import { useRoutineStore, RoutineItem } from '../store/routineStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

export function RoutineScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const items = useRoutineStore((s) => s.items);
  const completedToday = useRoutineStore((s) => s.completedToday);
  const addItem = useRoutineStore((s) => s.addItem);
  const removeItem = useRoutineStore((s) => s.removeItem);
  const toggleComplete = useRoutineStore((s) => s.toggleComplete);
  const reorderItems = useRoutineStore((s) => s.reorderItems);
  const updateItem = useRoutineStore((s) => s.updateItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const isCompletedToday = useCallback((id: string) => completedToday[id] === today, [completedToday, today]);

  const completedCount = useMemo(() => Object.values(completedToday).filter((d) => d === today).length, [completedToday, today]);
  const totalCount = items.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  // Sort: uncompleted first (preserve order), completed at bottom
  const sortedItems = useMemo(() => {
    const uncompleted = items.filter((i) => !isCompletedToday(i.id));
    const completed = items.filter((i) => isCompletedToday(i.id));
    return [...uncompleted, ...completed];
  }, [items, completedToday, isCompletedToday]);

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

  const handleDragEnd = useCallback(({ data }: { data: RoutineItem[] }) => {
    const reordered = data.map((item, index) => ({ ...item, order: index }));
    reorderItems(reordered);
  }, [reorderItems]);

  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<RoutineItem>) => {
    const done = isCompletedToday(item.id);
    const index = getIndex() ?? 0;
    const bgColor = index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent';

    return (
      <ScaleDecorator>
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={drag}
          disabled={isActive}
          style={[styles.row, { backgroundColor: isActive ? (theme === 'dark' ? '#333' : '#E0E0E0') : bgColor }]}
        >
          <TouchableOpacity
            style={[styles.checkbox, { borderColor: done ? c.success : c.border, backgroundColor: done ? c.success : 'transparent' }]}
            onPress={() => toggleComplete(item.id)}
          >
            {done && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>

          {editingId === item.id ? (
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

          <Text style={[styles.dragHandle, { color: c.textSecondary }]}>⠿</Text>

          <TouchableOpacity onPress={() => handleRemove(item)} style={styles.deleteBtn}>
            <Text style={{ color: c.danger, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [editingId, editText, theme, c, completedToday, isCompletedToday, toggleComplete]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <QuickAddBar
        placeholder="Новая ежедневная задача..."
        onAdd={(title) => addItem(title)}
      />
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

      {/* Draggable List */}
      <DraggableFlatList
        data={sortedItems}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : { paddingBottom: 80 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔄</Text>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет ежедневных задач</Text>
            <Text style={[styles.emptyHint, { color: c.textSecondary }]}>Добавьте привычки которые нужно{'\n'}выполнять каждый день</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  titleArea: { flex: 1 },
  title: { fontSize: 15 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 15 },
  dragHandle: { fontSize: 18, paddingHorizontal: 4 },
  deleteBtn: { padding: 4 },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  emptyHint: { fontSize: 14, marginTop: 4, textAlign: 'center' },
});
