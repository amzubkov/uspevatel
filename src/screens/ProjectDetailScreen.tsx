import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useProjectStore } from '../store/projectStore';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { TaskCard } from '../components/TaskCard';
import { QuickAddBar } from '../components/QuickAddBar';
import { sortByPriorityDeadline } from '../components/FilterBar';
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
  const addTask = useTaskStore((s) => s.addTask);
  const tasks = useMemo(() => allTasks.filter((t) => t.project === projectName), [allTasks, projectName]);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: c.textSecondary }}>Проект не найден</Text>
      </View>
    );
  }

  const activeTasks = sortByPriorityDeadline(tasks.filter((t) => !t.completed));
  const completedTasks = tasks.filter((t) => t.completed);

  const startEdit = () => {
    setEditName(project.name);
    setEditNotes(project.notes);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!editName.trim()) { Alert.alert('Ошибка', 'Введите название'); return; }
    updateProject(projectId, { name: editName.trim(), notes: editNotes.trim() });
    setEditing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {editing ? (
        <View style={[styles.editCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.editTitle, { color: c.text }]}>Редактировать проект</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Название"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="characters"
          />
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, minHeight: 60 }]}
            value={editNotes}
            onChangeText={setEditNotes}
            placeholder="Заметки к проекту..."
            placeholderTextColor={c.textSecondary}
            multiline
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={saveEdit}>
              <Text style={styles.btnText}>Сохранить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={() => setEditing(false)}>
              <Text style={styles.btnText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: c.text }]}>{project.name}</Text>
              {project.notes ? (
                <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{project.notes}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.statusBadge, { backgroundColor: project.isCurrent ? c.successLight : c.border }]}
              onPress={() => toggleCurrent(projectId)}
            >
              <Text style={[styles.statusText, { color: project.isCurrent ? c.success : c.textSecondary }]}>
                {project.isCurrent ? 'Текущий' : 'ЯЯ'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editIcon} onPress={startEdit}>
              <Text style={{ fontSize: 18 }}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteIcon}
              onPress={() =>
                Alert.alert('Удалить проект?', 'Задачи проекта останутся', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Удалить', style: 'destructive', onPress: () => { deleteProject(projectId); navigation.goBack(); } },
                ])
              }
            >
              <Text style={{ color: c.danger, fontSize: 18 }}>🗑</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <QuickAddBar
        placeholder={`Новая задача в ${projectName}...`}
        onAdd={(action) => addTask({ subject: '', action, category: 'IN', notes: '', priority: 'normal', isRecurring: false, project: projectName })}
      />

      <Text style={[styles.section, { color: c.textSecondary }]}>
        Активные задачи ({activeTasks.length})
      </Text>
      <FlatList
        data={activeTasks}
        keyExtractor={(t) => t.id}
        renderItem={({ item, index }) => (
          <View style={{ backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }}>
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  editIcon: { padding: 6, marginTop: 2 },
  deleteIcon: { padding: 6, marginTop: 2 },
  editCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  editTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14 },
  btn: { paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  section: { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
});
