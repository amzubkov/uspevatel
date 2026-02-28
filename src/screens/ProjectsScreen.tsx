import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';

export function ProjectsScreen() {
  const projects = useProjectStore((s) => s.projects);
  const addProject = useProjectStore((s) => s.addProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const currentProjects = useMemo(() => projects.filter((p) => p.isCurrent), [projects]);
  const futureProjects = useMemo(() => projects.filter((p) => !p.isCurrent), [projects]);
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
    <View style={[styles.container, { backgroundColor: c.background }]}>
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
            <Text style={[styles.projectName, { color: c.text }]}>{project.name}</Text>
            {project.notes ? (
              <Text style={[styles.projectNotes, { color: c.textSecondary }]} numberOfLines={1}>
                {project.notes}
              </Text>
            ) : null}
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
                <Text style={[styles.projectName, { color: c.textSecondary }]}>{project.name}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  addRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 4, marginBottom: 16 },
  addInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#FFF', fontSize: 22, fontWeight: '600', marginTop: -1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  emptyText: { fontSize: 14, marginBottom: 16 },
  projectCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  projectName: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  projectNotes: { fontSize: 13, marginTop: 4 },
  futureHeader: { marginTop: 16 },
  addFutureBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  addFutureBtnText: { fontSize: 14 },
});
