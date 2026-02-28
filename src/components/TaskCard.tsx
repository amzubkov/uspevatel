import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Task, CATEGORY_LABELS } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

interface Props {
  task: Task;
  onPress: () => void;
  onComplete?: () => void;
  showCategory?: boolean;
  onSubjectPress?: (subject: string) => void;
  onProjectPress?: (project: string) => void;
}

export function TaskCard({ task, onPress, onComplete, showCategory, onSubjectPress, onProjectPress }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize) ?? 15;
  const c = colors[theme];
  const smallFont = Math.max(9, fontSize - 4);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        {onComplete && (
          <TouchableOpacity
            style={[styles.checkbox, { width: fontSize + 4, height: fontSize + 4, borderRadius: (fontSize + 4) / 2 }, task.completed && { backgroundColor: c.success, borderColor: c.success }]}
            onPress={onComplete}
          >
            {task.completed && <Text style={[styles.checkmark, { fontSize: fontSize - 3 }]}>✓</Text>}
          </TouchableOpacity>
        )}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={[styles.action, { color: c.text, fontSize }, task.completed && styles.completedText]} numberOfLines={2}>
              {task.action}
            </Text>
            {task.priority === 'high' && <View style={[styles.priorityDot, { backgroundColor: c.danger }]} />}
          </View>
          <View style={styles.tags}>
            {task.subject ? (
              <TouchableOpacity onPress={() => onSubjectPress?.(task.subject)} disabled={!onSubjectPress}>
                <Text style={[styles.tagInline, { color: c.primary, fontSize: smallFont }]}>👤{task.subject}</Text>
              </TouchableOpacity>
            ) : null}
            {task.project && (
              <TouchableOpacity onPress={() => onProjectPress?.(task.project!)} disabled={!onProjectPress}>
                <Text style={[styles.tagInline, { color: c.primary, fontSize: smallFont, backgroundColor: c.primaryLight, paddingHorizontal: 4, borderRadius: 3 }]}>{task.project}</Text>
              </TouchableOpacity>
            )}
            {task.contextCategory && (
              <Text style={[styles.tagInline, { color: c.warning, fontSize: smallFont }]}>\{task.contextCategory}</Text>
            )}
            {showCategory && (
              <Text style={[styles.tagInline, { color: c.textSecondary, fontSize: smallFont }]}>{CATEGORY_LABELS[task.category]}</Text>
            )}
            {task.reminderAt && (
              <Text style={[styles.tagInline, { color: c.warning, fontSize: smallFont }]}>
                🔔{new Date(task.reminderAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
            {task.startDate && (
              <Text style={[styles.tagInline, { color: c.textSecondary, fontSize: smallFont }]}>
                📅{new Date(task.startDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    borderWidth: 2,
    borderColor: '#CCC',
    marginRight: 10,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#FFF', fontWeight: 'bold' },
  content: { flex: 1 },
  action: { fontWeight: '500', flex: 1 },
  completedText: { textDecorationLine: 'line-through', opacity: 0.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2, gap: 6, alignItems: 'center' },
  tagInline: { fontWeight: '600' },
  priorityDot: { width: 7, height: 7, borderRadius: 4, marginLeft: 6 },
});
