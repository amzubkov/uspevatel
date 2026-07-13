import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Task, Category } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { parseStoredDate } from '../utils/date';

const CATEGORY_EMOJI: Record<Category, string> = {
  IN: '📥', DAY: '☀️', LATER: '📋', CONTROL: '👁', MAYBE: '💭',
};

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

  const dayAge = task.category === 'DAY' && !task.completed && task.updatedAt
    ? Math.floor((Date.now() - new Date(task.updatedAt).getTime()) / 86400000)
    : 0;

  const vPad = Math.max(2, fontSize - 11);

  const isSuper = task.priority === 'super' && !task.completed;

  return (
    <TouchableOpacity style={[styles.card, { paddingVertical: vPad }, isSuper && { backgroundColor: '#DC2626', borderRadius: 8, marginHorizontal: 4, marginVertical: 2 }]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        {onComplete && (
          <TouchableOpacity
            style={[styles.checkbox, { width: fontSize + 4, height: fontSize + 4, borderRadius: (fontSize + 4) / 2 }, isSuper && { borderColor: '#FFF' }, task.completed && { backgroundColor: c.success, borderColor: c.success }]}
            onPress={onComplete}
          >
            {task.completed && <Text style={[styles.checkmark, { fontSize: fontSize - 3 }]}>✓</Text>}
          </TouchableOpacity>
        )}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={[styles.action, { color: isSuper ? '#FFF' : c.text, fontSize }, task.completed && styles.completedText]} numberOfLines={2}>
              {task.goalType ? '🎯 ' : ''}{showCategory ? CATEGORY_EMOJI[task.category] : ''}{dayAge > 2 ? <Text style={{ color: c.danger, fontSize: smallFont }}>{dayAge}д </Text> : ''}{task.deadline ? <Text style={{ color: c.danger }}>{parseStoredDate(task.deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} </Text> : null}{task.project ? <Text style={{ color: c.primary }}>{task.project} </Text> : null}{task.subject ? <Text style={{ color: c.textSecondary }}>{task.subject} </Text> : null}{task.action}
            </Text>
            {(task.priority === 'high' || task.priority === 'super') && <View style={[styles.priorityDot, { backgroundColor: isSuper ? '#FFF' : c.danger }]} />}
          </View>
          <View style={styles.tags}>
            {task.contextCategory && (
              <Text style={[styles.tagInline, { color: c.warning, fontSize: smallFont }]}>\{task.contextCategory}</Text>
            )}
            {task.reminderAt && (
              <Text style={[styles.tagInline, { color: c.warning, fontSize: smallFont }]}>
                🔔{new Date(task.reminderAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
            {task.startDate && (
              <Text style={[styles.tagInline, { color: c.textSecondary, fontSize: smallFont }]}>
                📅{parseStoredDate(task.startDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </Text>
            )}
          </View>
        </View>
        {task.imageBase64 ? (
          <Image source={{ uri: task.imageBase64 }} style={styles.thumb} />
        ) : null}
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
  thumb: { width: 40, height: 40, borderRadius: 6, marginLeft: 8 },
});
