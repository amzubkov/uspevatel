import React, { useMemo, useState } from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProjectStore } from '../store/projectStore';
import { colors } from '../utils/theme';
import { TaskCard } from '../components/TaskCard';
import { SearchBar } from '../components/SearchBar';
import { FilterBar, applyFilters, hideOldCompleted, sortByPriorityDeadline } from '../components/FilterBar';
import { useNavigation } from '@react-navigation/native';

export function AllScreen() {
  const allTasks = useTaskStore((s) => s.tasks);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const navigation = useNavigation<any>();
  const projects = useProjectStore((s) => s.projects);
  const [searchQuery, setSearchQuery] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'today'>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const tasks = useMemo(() => {
    let filtered = applyFilters(hideOldCompleted(allTasks), deadlineFilter, projectFilter, subjectFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.action.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.project || '').toLowerCase().includes(q) ||
          t.notes.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }
    return sortByPriorityDeadline(filtered);
  }, [allTasks, searchQuery, deadlineFilter, projectFilter, subjectFilter]);

  const navigateSubject = (subject: string) => navigation.navigate('SubjectTasks', { subject });
  const navigateProject = (projectName: string) => {
    const proj = projects.find((p) => p.name === projectName);
    if (proj) navigation.navigate('ProjectDetail', { projectId: proj.id });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
      {tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>📋</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет задач</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item, index }) => (
            <View style={{ backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }}>
              <TaskCard
                task={item}
                onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
                onSubjectPress={navigateSubject}
                onProjectPress={navigateProject}
                showCategory
              />
            </View>
          )}
        />
      )}
      <FilterBar deadlineFilter={deadlineFilter} projectFilter={projectFilter} subjectFilter={subjectFilter} onDeadlineChange={setDeadlineFilter} onProjectChange={setProjectFilter} onSubjectChange={setSubjectFilter} tasks={allTasks} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 12 },
});
