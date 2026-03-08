import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useProjectStore } from '../store/projectStore';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';

export function ProjectsScreen() {
  const projects = useProjectStore((s) => s.projects);
  const addProject = useProjectStore((s) => s.addProject);
  const tasks = useTaskStore((s) => s.tasks);
  const currentProjects = useMemo(() => projects.filter((p) => p.isCurrent), [projects]);
  const futureProjects = useMemo(() => projects.filter((p) => !p.isCurrent), [projects]);
  const taskCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.project && !t.completed) counts[t.project] = (counts[t.project] || 0) + 1;
    }
    return counts;
  }, [tasks]);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const navigation = useNavigation<any>();
  const [newName, setNewName] = useState('');
  const [showFuture, setShowFuture] = useState(false);

  const handleAdd = (isCurrent: boolean) => {
    if (!newName.trim()) return;
    addProject(newName.trim(), isCurrent);
    setNewName('');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[styles.addRow, { backgroundColor: c.card, borderColor: c.border }]}>
        <TextInput
          style={[styles.addInput, { color: c.text }]}
          value={newName}
          onChangeText={setNewName}
          placeholder="Новый проект..."
          placeholderTextColor={c.textSecondary}
        />
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: c.primary }]} onPress={() => handleAdd(true)}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: c.text }]}>Текущие проекты</Text>
      {currentProjects.length === 0 ? (
        <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет текущих проектов</Text>
      ) : (
        currentProjects.map((project) => (
          <TouchableOpacity
            key={project.id}
            style={[styles.projectCard, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => navigation.navigate('ProjectDetail', { projectId: project.id })}
          >
            <View style={styles.projectRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.projectName, { color: c.text }]}>{project.name}</Text>
                {project.notes ? (
                  <Text style={[styles.projectNotes, { color: c.textSecondary }]} numberOfLines={1}>
                    {project.notes}
                  </Text>
                ) : null}
              </View>
              {(taskCountByProject[project.name] ?? 0) > 0 && (
                <Text style={[styles.taskCount, { color: c.textSecondary }]}>{taskCountByProject[project.name]}</Text>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity
        style={styles.futureHeader}
        onPress={() => setShowFuture(!showFuture)}
      >
        <Text style={[styles.sectionTitle, { color: c.text }]}>
          ЯЯ-ПРОЕКТЫ {showFuture ? '▼' : '▶'}
        </Text>
      </TouchableOpacity>

      {showFuture && (
        <>
          {futureProjects.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет будущих проектов</Text>
          ) : (
            futureProjects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[styles.projectCard, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: project.id })}
              >
                <View style={styles.projectRow}>
                  <Text style={[styles.projectName, { flex: 1, color: c.textSecondary }]}>{project.name}</Text>
                  {(taskCountByProject[project.name] ?? 0) > 0 && (
                    <Text style={[styles.taskCount, { color: c.textSecondary }]}>{taskCountByProject[project.name]}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity
            style={[styles.addFutureBtn, { borderColor: c.border }]}
            onPress={() => handleAdd(false)}
          >
            <Text style={[styles.addFutureBtnText, { color: c.textSecondary }]}>
              + Добавить в ЯЯ-ПРОЕКТЫ
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 4, marginBottom: 12 },
  addInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 6, fontSize: 15 },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#FFF', fontSize: 22, fontWeight: '600', marginTop: -1 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6, marginTop: 6 },
  emptyText: { fontSize: 14, marginBottom: 12 },
  projectCard: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  projectName: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  projectNotes: { fontSize: 12, marginTop: 2 },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskCount: { fontSize: 12, fontWeight: '600' },
  futureHeader: { marginTop: 12 },
  addFutureBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 6 },
  addFutureBtnText: { fontSize: 14 },
});
