import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useProjectStore } from '../store/projectStore';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { TaskCard } from '../components/TaskCard';
import { useNavigation, useRoute } from '@react-navigation/native';

export function ProjectDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { projectId } = route.params;
  const allProjects = useProjectStore((s) => s.projects);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const toggleCurrent = useProjectStore((s) => s.toggleCurrent);
  const project = useMemo(() => allProjects.find((p) => p.id === projectId), [allProjects, projectId]);
  const projectName = project?.name || '';
  const allTasks = useTaskStore((s) => s.tasks);
  const tasks = useMemo(() => allTasks.filter((t) => t.project === projectName), [allTasks, projectName]);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [notes, setNotes] = useState(project?.notes || '');

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: c.textSecondary }}>Проект не найден</Text>
      </View>
    );
  }

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: c.text }]}>{project.name}</Text>
        <TouchableOpacity
          style={[styles.statusBadge, { backgroundColor: project.isCurrent ? c.successLight : c.border }]}
          onPress={() => toggleCurrent(projectId)}
        >
          <Text style={[styles.statusText, { color: project.isCurrent ? c.success : c.textSecondary }]}>
            {project.isCurrent ? 'Текущий' : 'ЯЯ-проект'}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.notesInput, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={notes}
        onChangeText={setNotes}
        onBlur={() => updateProject(projectId, { notes })}
        placeholder="Заметки к проекту..."
        placeholderTextColor={c.textSecondary}
        multiline
      />

      <Text style={[styles.section, { color: c.textSecondary }]}>
        Активные задачи ({activeTasks.length})
      </Text>
      <FlatList
        data={activeTasks}
        keyExtractor={(t) => t.id}
        renderItem={({ item, index }) => (
          <View style={{ backgroundColor: index % 2 === 1 ? '#F0F0F0' : 'transparent' }}>
            <TaskCard
              task={item}
              showCategory
              onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
              onSubjectPress={(s) => navigation.navigate('SubjectTasks', { subject: s })}
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет активных задач</Text>
        }
      />

      {completedTasks.length > 0 && (
        <Text style={[styles.section, { color: c.textSecondary }]}>
          Выполнено ({completedTasks.length})
        </Text>
      )}

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() =>
          Alert.alert('Удалить проект?', 'Задачи проекта останутся', [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: () => { deleteProject(projectId); navigation.goBack(); } },
          ])
        }
      >
        <Text style={[styles.deleteBtnText, { color: c.danger }]}>Удалить проект</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  name: { fontSize: 24, fontWeight: '800', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  notesInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top', marginBottom: 16 },
  section: { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  deleteBtn: { marginTop: 24, marginBottom: 40, paddingVertical: 14, alignItems: 'center' },
  deleteBtnText: { fontSize: 16, fontWeight: '600' },
});
