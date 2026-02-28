import React, { useMemo, useState } from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProjectStore } from '../store/projectStore';
import { colors } from '../utils/theme';
import { TaskCard } from '../components/TaskCard';
import { SearchBar } from '../components/SearchBar';
import { useNavigation, useRoute } from '@react-navigation/native';

export function SubjectTasksScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { subject } = route.params;
  const allTasks = useTaskStore((s) => s.tasks);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const projects = useProjectStore((s) => s.projects);
  const [searchQuery, setSearchQuery] = useState('');

  const tasks = useMemo(() => {
    const subjectTasks = allTasks.filter((t) => t.subject === subject);
    if (!searchQuery.trim()) return subjectTasks;
    const q = searchQuery.toLowerCase();
    return subjectTasks.filter(
      (t) =>
        t.action.toLowerCase().includes(q) ||
        (t.project || '').toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q)
    );
  }, [allTasks, subject, searchQuery]);

  const active = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const completed = useMemo(() => tasks.filter((t) => t.completed), [tasks]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.header, { color: c.text }]}>{subject}</Text>
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
      {active.length === 0 && completed.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет задач для этого человека</Text>
        </View>
      ) : (
        <FlatList
          data={[...active, ...completed]}
          keyExtractor={(t) => t.id}
          renderItem={({ item, index }) => (
            <View style={{ backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }}>
              <TaskCard
                task={item}
                showCategory
                onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
                onProjectPress={(p) => {
                  const proj = projects.find((pr) => pr.name === p);
                  if (proj) navigation.navigate('ProjectDetail', { projectId: proj.id });
                }}
              />
            </View>
          )}
          ListHeaderComponent={
            active.length > 0 ? (
              <Text style={[styles.section, { color: c.textSecondary }]}>Активные ({active.length})</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 22, fontWeight: '800', paddingHorizontal: 16, paddingTop: 12 },
  section: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, textTransform: 'uppercase' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
});
