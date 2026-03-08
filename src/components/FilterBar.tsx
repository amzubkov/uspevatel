import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { Task } from '../types';

interface Props {
  deadlineFilter: 'all' | 'today';
  projectFilter: string | null;
  subjectFilter?: string | null;
  onDeadlineChange: (f: 'all' | 'today') => void;
  onProjectChange: (p: string | null) => void;
  onSubjectChange?: (s: string | null) => void;
  tasks: Task[];
}

export function FilterBar({ deadlineFilter, projectFilter, subjectFilter, onDeadlineChange, onProjectChange, onSubjectChange, tasks }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const todayCount = tasks.filter((t) => t.deadline?.startsWith(todayStr)).length;

  const projectCounts = new Map<string, number>();
  const subjectCounts = new Map<string, number>();
  for (const t of tasks) {
    if (t.project) projectCounts.set(t.project, (projectCounts.get(t.project) || 0) + 1);
    if (t.subject) subjectCounts.set(t.subject, (subjectCounts.get(t.subject) || 0) + 1);
  }

  const hasFilters = todayCount > 0 || projectCounts.size > 0 || subjectCounts.size > 0;
  if (!hasFilters) return null;

  return (
    <View style={[styles.container, { backgroundColor: c.card, borderColor: c.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {todayCount > 0 && (
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: deadlineFilter === 'today' ? c.danger : 'transparent', borderColor: c.border }]}
            onPress={() => onDeadlineChange(deadlineFilter === 'today' ? 'all' : 'today')}
          >
            <Text style={[styles.chipText, { color: deadlineFilter === 'today' ? '#FFF' : c.text }]}>
              Сегодня {todayCount}
            </Text>
          </TouchableOpacity>
        )}

        {todayCount > 0 && projectCounts.size > 0 && (
          <View style={[styles.separator, { backgroundColor: c.border }]} />
        )}

        {[...projectCounts.entries()].map(([name, count]) => (
          <TouchableOpacity
            key={`p-${name}`}
            style={[styles.chip, { backgroundColor: projectFilter === name ? c.primary : 'transparent', borderColor: c.border }]}
            onPress={() => onProjectChange(projectFilter === name ? null : name)}
          >
            <Text style={[styles.chipText, { color: projectFilter === name ? '#FFF' : c.text }]}>
              {name} {count}
            </Text>
          </TouchableOpacity>
        ))}

        {subjectCounts.size > 0 && (projectCounts.size > 0 || todayCount > 0) && (
          <View style={[styles.separator, { backgroundColor: c.border }]} />
        )}

        {onSubjectChange && [...subjectCounts.entries()].map(([name, count]) => (
          <TouchableOpacity
            key={`s-${name}`}
            style={[styles.chip, { backgroundColor: subjectFilter === name ? c.warning : 'transparent', borderColor: c.border }]}
            onPress={() => onSubjectChange(subjectFilter === name ? null : name)}
          >
            <Text style={[styles.chipText, { color: subjectFilter === name ? '#FFF' : c.text }]}>
              👤{name} {count}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function applyFilters(tasks: Task[], deadlineFilter: 'all' | 'today', projectFilter: string | null, subjectFilter?: string | null): Task[] {
  let result = tasks;
  if (deadlineFilter === 'today') {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    result = result.filter((t) => t.deadline?.startsWith(todayStr));
  }
  if (projectFilter) {
    result = result.filter((t) => t.project === projectFilter);
  }
  if (subjectFilter) {
    result = result.filter((t) => t.subject === subjectFilter);
  }
  return result;
}

/** Hide completed tasks older than today. Today's completed tasks stay visible. */
export function hideOldCompleted(tasks: Task[]): Task[] {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return tasks.filter((t) => {
    if (!t.completed) return true;
    // show if completedAt is today
    if (t.completedAt?.startsWith(todayStr)) return true;
    return false;
  });
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** Sort: priority (high→normal→low), then deadline (earliest first, no deadline last) */
export function sortByPriorityDeadline(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    // both have deadline
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return 0;
  });
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  scroll: {
    paddingHorizontal: 8,
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    width: 1,
    height: 16,
  },
});
