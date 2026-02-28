import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet } from 'react-native';
import { SyncConflict, Task } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

interface Props {
  conflicts: SyncConflict[];
  currentIndex: number;
  onKeepLocal: (conflict: SyncConflict) => void;
  onTakeRemote: (conflict: SyncConflict) => void;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  subject: 'Кому',
  action: 'Действие',
  category: 'Категория',
  contextCategory: 'Контекст',
  project: 'Проект',
  notes: 'Заметки',
  startDate: 'Дата начала',
  priority: 'Приоритет',
  isRecurring: 'Повторяющаяся',
  completed: 'Завершена',
  completedAt: 'Завершена в',
  createdAt: 'Создана',
  reminderAt: 'Напоминание',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (key === 'isRecurring' || key === 'completed') {
    return value === true || value === 'true' ? 'Да' : 'Нет';
  }
  return String(value);
}

export function SyncConflictModal({ conflicts, currentIndex, onKeepLocal, onTakeRemote, onClose }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  if (conflicts.length === 0) return null;
  const conflict = conflicts[currentIndex];
  if (!conflict) return null;

  const { localTask, remoteTask, diffFields } = conflict;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: c.card }]}>
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <Text style={[styles.headerText, { color: c.text }]}>
              Конфликт {currentIndex + 1}/{conflicts.length}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.closeBtn, { color: c.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.taskName, { color: c.text }]}>
            {localTask.subject || remoteTask.subject}: {localTask.action || remoteTask.action}
          </Text>

          <ScrollView style={styles.tableScroll}>
            <View style={[styles.tableHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.colLabel, { color: c.textSecondary }]}>Поле</Text>
              <Text style={[styles.colLocal, { color: '#4FC3F7' }]}>Телефон</Text>
              <Text style={[styles.colRemote, { color: '#FFB74D' }]}>Таблица</Text>
            </View>
            {diffFields.map((field) => (
              <View key={field} style={[styles.row, { borderBottomColor: c.border }]}>
                <Text style={[styles.colLabel, { color: c.textSecondary }]}>
                  {FIELD_LABELS[field] || field}
                </Text>
                <Text style={[styles.colLocal, { color: '#4FC3F7' }]}>
                  {formatValue(field, localTask[field as keyof Task])}
                </Text>
                <Text style={[styles.colRemote, { color: '#FFB74D' }]}>
                  {formatValue(field, remoteTask[field as keyof Task])}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#1565C0' }]}
              onPress={() => onKeepLocal(conflict)}
            >
              <Text style={styles.btnText}>Оставить из телефона</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#E65100' }]}
              onPress={() => onTakeRemote(conflict)}
            >
              <Text style={styles.btnText}>Взять из таблицы</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerText: { fontSize: 17, fontWeight: '700' },
  closeBtn: { fontSize: 20, padding: 4 },
  taskName: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tableScroll: { paddingHorizontal: 16 },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colLabel: { flex: 1, fontSize: 12 },
  colLocal: { flex: 1, fontSize: 12 },
  colRemote: { flex: 1, fontSize: 12 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
