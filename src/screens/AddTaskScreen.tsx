import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { Category, CATEGORY_LABELS } from '../types';
import { useNavigation, useRoute } from '@react-navigation/native';

const CATEGORIES: Category[] = ['IN', 'DAY', 'LATER', 'CONTROL', 'MAYBE'];
const PRIORITIES = ['high', 'normal', 'low'] as const;

export function AddTaskScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const addTask = useTaskStore((s) => s.addTask);
  const projects = useProjectStore((s) => s.projects);
  const contextCategories = useSettingsStore((s) => s.contextCategories);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const initialCategory = route.params?.category || 'IN';

  const [subject, setSubject] = useState('');
  const [action, setAction] = useState('');
  const [category, setCategory] = useState<Category>(initialCategory);
  const [project, setProject] = useState<string | undefined>();
  const [contextCategory, setContextCategory] = useState<string | undefined>();
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');

  const handleSave = () => {
    if (!action.trim()) return;
    addTask({
      subject: subject.trim(),
      action: action.trim(),
      category,
      project,
      contextCategory,
      startDate: startDate || undefined,
      notes,
      priority,
      isRecurring: false,
    });
    navigation.goBack();
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} keyboardShouldPersistTaps="handled">
      <Text style={[styles.label, { color: c.textSecondary }]}>Человек (кто)</Text>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={subject}
        onChangeText={setSubject}
        placeholder="Виктор, Я, Жена..."
        placeholderTextColor={c.textSecondary}
      />

      <Text style={[styles.label, { color: c.textSecondary }]}>Действие *</Text>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={action}
        onChangeText={setAction}
        placeholder="Элементарное действие"
        placeholderTextColor={c.textSecondary}
        multiline
      />

      <Text style={[styles.label, { color: c.textSecondary }]}>Категория</Text>
      <View style={styles.chips}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.chip, category === cat && { backgroundColor: c.primary }]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.chipText, { color: category === cat ? '#FFF' : c.text }]}>
              {CATEGORY_LABELS[cat]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, { color: c.textSecondary }]}>Приоритет</Text>
      <View style={styles.chips}>
        {PRIORITIES.map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.chip,
              priority === p && {
                backgroundColor: p === 'high' ? '#DC2626' : p === 'normal' ? c.primary : '#6B7280',
              },
            ]}
            onPress={() => setPriority(p)}
          >
            <Text style={[styles.chipText, { color: priority === p ? '#FFF' : c.text }]}>
              {p === 'high' ? 'Высокий' : p === 'normal' ? 'Обычный' : 'Низкий'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {projects.length > 0 && (
        <>
          <Text style={[styles.label, { color: c.textSecondary }]}>Проект</Text>
          <View style={styles.chips}>
            <TouchableOpacity
              style={[styles.chip, !project && { backgroundColor: c.border }]}
              onPress={() => setProject(undefined)}
            >
              <Text style={[styles.chipText, { color: c.text }]}>Нет</Text>
            </TouchableOpacity>
            {projects.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, project === p.name && { backgroundColor: c.primary }]}
                onPress={() => setProject(p.name)}
              >
                <Text style={[styles.chipText, { color: project === p.name ? '#FFF' : c.text }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {contextCategories.length > 0 && (
        <>
          <Text style={[styles.label, { color: c.textSecondary }]}>Контекст</Text>
          <View style={styles.chips}>
            <TouchableOpacity
              style={[styles.chip, !contextCategory && { backgroundColor: c.border }]}
              onPress={() => setContextCategory(undefined)}
            >
              <Text style={[styles.chipText, { color: c.text }]}>Нет</Text>
            </TouchableOpacity>
            {contextCategories.map((ctx) => (
              <TouchableOpacity
                key={ctx}
                style={[styles.chip, contextCategory === ctx && { backgroundColor: c.warning }]}
                onPress={() => setContextCategory(ctx)}
              >
                <Text style={[styles.chipText, { color: contextCategory === ctx ? '#FFF' : c.text }]}>\\{ctx}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {(category === 'CONTROL' || category === 'DAY') && (
        <>
          <Text style={[styles.label, { color: c.textSecondary }]}>Дата (ГГГГ-ММ-ДД)</Text>
          <TextInput
            style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-03-01"
            placeholderTextColor={c.textSecondary}
          />
        </>
      )}

      <Text style={[styles.label, { color: c.textSecondary }]}>Заметки</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Дополнительная информация..."
        placeholderTextColor={c.textSecondary}
        multiline
        numberOfLines={4}
      />

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: c.primary, opacity: action.trim() ? 1 : 0.5 }]}
        onPress={handleSave}
        disabled={!action.trim()}
      >
        <Text style={styles.saveBtnText}>Сохранить</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#E5E7EB' },
  chipText: { fontSize: 13, fontWeight: '600' },
  saveBtn: { marginTop: 24, marginBottom: 40, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
