import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProjectStore } from '../store/projectStore';
import { colors } from '../utils/theme';
import { TaskCard } from '../components/TaskCard';
import { SwipeableTask } from '../components/SwipeableTask';
import { QuickAddBar } from '../components/QuickAddBar';
import { SearchBar } from '../components/SearchBar';
import { FilterBar, applyFilters, hideOldCompleted, sortByPriorityDeadline } from '../components/FilterBar';
import { useNavigation } from '@react-navigation/native';

export function DayScreen() {
  const allTasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const { completeTask, uncompleteTask, moveTask } = useTaskStore();
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const navigation = useNavigation<any>();
  const projects = useProjectStore((s) => s.projects);
  const [searchQuery, setSearchQuery] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'today'>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const categoryTasks = useMemo(() => hideOldCompleted(allTasks.filter((t) => t.category === 'DAY')), [allTasks]);

  const dayTasks = useMemo(() => {
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
    return filtered;
  }, [categoryTasks, searchQuery, deadlineFilter, projectFilter, subjectFilter]);

  const urgent = sortByPriorityDeadline(dayTasks.filter((t) => t.startDate && !t.completed));
  const normal = sortByPriorityDeadline(dayTasks.filter((t) => !t.startDate && !t.completed));
  const completed = dayTasks.filter((t) => t.completed);

  const sections = [
    ...(urgent.length > 0 ? [{ title: 'Срочные', data: urgent }] : []),
    ...(normal.length > 0 ? [{ title: 'Действия на сегодня', data: normal }] : []),
    ...(completed.length > 0 ? [{ title: 'Выполнено', data: completed }] : []),
  ];

  let globalIndex = 0;

  const navigateSubject = (subject: string) => navigation.navigate('SubjectTasks', { subject });
  const navigateProject = (projectName: string) => {
    const proj = projects.find((p) => p.name === projectName);
    if (proj) navigation.navigate('ProjectDetail', { projectId: proj.id });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <QuickAddBar
        placeholder="Добавить в DAY..."
        onAdd={(action) => addTask({ subject: '', action, category: 'DAY', notes: '', priority: 'normal', isRecurring: false })}
      />
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>☀️</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет задач на сегодня</Text>
          <Text style={[styles.emptyHint, { color: c.textSecondary }]}>Переместите задачи из IN или LATER</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionHeader, { color: c.textSecondary, backgroundColor: c.background }]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const idx = globalIndex++;
            return (
              <View style={{ backgroundColor: idx % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }}>
                <SwipeableTask
                  rightActions={[
                    { label: 'LATER', color: '#3B82F6', onPress: () => moveTask(item.id, 'LATER') },
                    { label: 'CTRL', color: '#8B5CF6', onPress: () => moveTask(item.id, 'CONTROL') },
                  ]}
                >
                  <TaskCard
                    task={item}
                    onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
                    onComplete={() => (item.completed ? uncompleteTask(item.id) : completeTask(item.id))}
                    onSubjectPress={navigateSubject}
                    onProjectPress={navigateProject}
                  />
                </SwipeableTask>
              </View>
            );
          }}
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
  emptyHint: { fontSize: 14, marginTop: 4 },
  sectionHeader: { fontSize: 12, fontWeight: '600', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2, textTransform: 'uppercase' },
});
