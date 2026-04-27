import React, { useMemo, useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProjectStore } from '../store/projectStore';
import { colors } from '../utils/theme';
import { TaskCard } from '../components/TaskCard';
import { QuickAddBar } from '../components/QuickAddBar';
import { SearchBar } from '../components/SearchBar';
import { FilterBar, applyFilters, sortByPriorityDeadline } from '../components/FilterBar';
import { useNavigation } from '@react-navigation/native';

export function LaterScreen() {
  const allTasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const moveTask = useTaskStore((s) => s.moveTask);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const navigation = useNavigation<any>();
  const projects = useProjectStore((s) => s.projects);
  const [searchQuery, setSearchQuery] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'today'>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const categoryTasks = useMemo(() => allTasks.filter((t) => t.category === 'LATER' && !t.completed), [allTasks]);

  const monthGoals = useMemo(() => sortByPriorityDeadline(allTasks.filter((t) => t.goalType === 'month' && !t.completed)), [allTasks]);
  const quarterGoals = useMemo(() => sortByPriorityDeadline(allTasks.filter((t) => t.goalType === 'quarter' && !t.completed)), [allTasks]);
  const yearGoals = useMemo(() => sortByPriorityDeadline(allTasks.filter((t) => t.goalType === 'year' && !t.completed)), [allTasks]);

  const tasks = useMemo(() => {
    let filtered = applyFilters(categoryTasks, deadlineFilter, projectFilter, subjectFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.action.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.project || '').toLowerCase().includes(q) ||
          t.notes.toLowerCase().includes(q)
      );
    }
    return sortByPriorityDeadline(filtered);
  }, [categoryTasks, searchQuery, deadlineFilter, projectFilter, subjectFilter]);

  const navigateSubject = (subject: string) => navigation.navigate('SubjectTasks', { subject });
  const navigateProject = (projectName: string) => {
    const proj = projects.find((p) => p.name === projectName);
    if (proj) navigation.navigate('ProjectDetail', { projectId: proj.id });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <QuickAddBar
        placeholder="Добавить в LATER..."
        onAdd={(action) => addTask({ subject: '', action, category: 'LATER', notes: '', priority: 'normal', isRecurring: false })}
      />
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
      {tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>📋</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет отложенных задач</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={(monthGoals.length > 0 || quarterGoals.length > 0 || yearGoals.length > 0) ? (
            <View style={[styles.goalsSection, { borderColor: c.border }]}>
              {monthGoals.map((g) => (
                <TouchableOpacity key={g.id} style={styles.goalRow} onPress={() => navigation.navigate('TaskDetail', { taskId: g.id })}>
                  <Text style={styles.goalLabel}>🎯 Месяц</Text>
                  <Text style={[styles.goalText, { color: c.text }]} numberOfLines={1}>{g.action}</Text>
                </TouchableOpacity>
              ))}
              {quarterGoals.map((g) => (
                <TouchableOpacity key={g.id} style={styles.goalRow} onPress={() => navigation.navigate('TaskDetail', { taskId: g.id })}>
                  <Text style={styles.goalLabel}>🎯 Квартал</Text>
                  <Text style={[styles.goalText, { color: c.text }]} numberOfLines={1}>{g.action}</Text>
                </TouchableOpacity>
              ))}
              {yearGoals.map((g) => (
                <TouchableOpacity key={g.id} style={styles.goalRow} onPress={() => navigation.navigate('TaskDetail', { taskId: g.id })}>
                  <Text style={styles.goalLabel}>🎯 Год</Text>
                  <Text style={[styles.goalText, { color: c.text }]} numberOfLines={1}>{g.action}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          renderItem={({ item, index }) => (
            <View style={{ backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }}>
              <TaskCard
                task={item}
                onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
                onSubjectPress={navigateSubject}
                onProjectPress={navigateProject}
              />
            </View>
          )}
        />
      )}
      <FilterBar deadlineFilter={deadlineFilter} projectFilter={projectFilter} subjectFilter={subjectFilter} onDeadlineChange={setDeadlineFilter} onProjectChange={setProjectFilter} onSubjectChange={setSubjectFilter} tasks={categoryTasks} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  goalsSection: { borderBottomWidth: 2, paddingBottom: 2, marginBottom: 2 },
  goalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5 },
  goalLabel: { color: '#7C3AED', fontSize: 12, fontWeight: '700', marginRight: 8, width: 80 },
  goalText: { flex: 1, fontSize: 14, fontWeight: '500' },
});
