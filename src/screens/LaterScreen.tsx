import React, { useMemo, useState } from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProjectStore } from '../store/projectStore';
import { colors } from '../utils/theme';
import { TaskCard } from '../components/TaskCard';
import { SwipeableTask } from '../components/SwipeableTask';
import { SearchBar } from '../components/SearchBar';
import { useNavigation } from '@react-navigation/native';

export function LaterScreen() {
  const allTasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.moveTask);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const navigation = useNavigation<any>();
  const projects = useProjectStore((s) => s.projects);
  const [searchQuery, setSearchQuery] = useState('');

  const tasks = useMemo(() => {
    let filtered = allTasks.filter((t) => t.category === 'LATER' && !t.completed);
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
  }, [allTasks, searchQuery]);

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
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет отложенных задач</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item, index }) => (
            <View style={{ backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }}>
              <SwipeableTask
                rightActions={[
                  { label: 'DAY', color: '#F59E0B', onPress: () => moveTask(item.id, 'DAY') },
                  { label: 'CTRL', color: '#8B5CF6', onPress: () => moveTask(item.id, 'CONTROL') },
                ]}
                leftActions={[
                  { label: 'MAYBE', color: '#6B7280', onPress: () => moveTask(item.id, 'MAYBE') },
                ]}
              >
                <TaskCard
                  task={item}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
                  onSubjectPress={navigateSubject}
                  onProjectPress={navigateProject}
                />
              </SwipeableTask>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 12 },
});
