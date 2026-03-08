import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal, Alert } from 'react-native';
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
  const [deadline, setDeadline] = useState<string | undefined>();
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [customDeadlineDate, setCustomDeadlineDate] = useState('');
  const [customDeadlineTime, setCustomDeadlineTime] = useState('');

  const handleSave = () => {
    if (!action.trim()) return;
    addTask({
      subject: subject.trim(),
      action: action.trim(),
      category,
      project,
      contextCategory,
      startDate: startDate || undefined,
      deadline,
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
            style={[styles.chip, { backgroundColor: category === cat ? c.primary : c.card, borderWidth: 1, borderColor: c.border }]}
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
              {
                backgroundColor: priority === p
                  ? (p === 'high' ? '#DC2626' : p === 'normal' ? '#16A34A' : '#EAB308')
                  : c.card,
                borderWidth: 1,
                borderColor: c.border,
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
              style={[styles.chip, { backgroundColor: !project ? c.border : c.card, borderWidth: 1, borderColor: c.border }]}
              onPress={() => setProject(undefined)}
            >
              <Text style={[styles.chipText, { color: c.text }]}>Нет</Text>
            </TouchableOpacity>
            {projects.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, { backgroundColor: project === p.name ? c.primary : c.card, borderWidth: 1, borderColor: c.border }]}
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
              style={[styles.chip, { backgroundColor: !contextCategory ? c.border : c.card, borderWidth: 1, borderColor: c.border }]}
              onPress={() => setContextCategory(undefined)}
            >
              <Text style={[styles.chipText, { color: c.text }]}>Нет</Text>
            </TouchableOpacity>
            {contextCategories.map((ctx) => (
              <TouchableOpacity
                key={ctx}
                style={[styles.chip, { backgroundColor: contextCategory === ctx ? c.warning : c.card, borderWidth: 1, borderColor: c.border }]}
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

      {/* Дедлайн */}
      <Text style={[styles.label, { color: c.textSecondary }]}>Дедлайн</Text>
      {deadline ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 15 }}>
            ⏳ {new Date(deadline).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
          <TouchableOpacity onPress={() => setDeadline(undefined)}>
            <Text style={{ color: c.danger, fontSize: 14, fontWeight: '600' }}>Убрать</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chips}>
          <TouchableOpacity style={[styles.chip, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={() => {
            const d = new Date(); d.setHours(23, 59, 0, 0);
            setDeadline(d.toISOString());
          }}>
            <Text style={[styles.chipText, { color: c.text }]}>Сегодня</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={() => {
            const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0);
            setDeadline(d.toISOString());
          }}>
            <Text style={[styles.chipText, { color: c.text }]}>Завтра</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={() => {
            const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(23, 59, 0, 0);
            setDeadline(d.toISOString());
          }}>
            <Text style={[styles.chipText, { color: c.text }]}>Послезавтра</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={() => {
            const now = new Date();
            const dd = String(now.getDate()).padStart(2, '0');
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            setCustomDeadlineDate(`${dd}.${mm}.${now.getFullYear()}`);
            setCustomDeadlineTime('23:59');
            setShowDeadlinePicker(true);
          }}>
            <Text style={[styles.chipText, { color: c.text }]}>Кастом</Text>
          </TouchableOpacity>
        </View>
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

      <Modal visible={showDeadlinePicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Дедлайн</Text>
            <Text style={[styles.modalLabel, { color: c.textSecondary }]}>Дата (ДД.ММ.ГГГГ)</Text>
            <TextInput
              style={[styles.modalInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
              value={customDeadlineDate}
              onChangeText={setCustomDeadlineDate}
              placeholder="01.03.2026"
              placeholderTextColor={c.textSecondary}
              keyboardType="numeric"
            />
            <Text style={[styles.modalLabel, { color: c.textSecondary }]}>Время (ЧЧ:ММ)</Text>
            <TextInput
              style={[styles.modalInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
              value={customDeadlineTime}
              onChangeText={setCustomDeadlineTime}
              placeholder="23:59"
              placeholderTextColor={c.textSecondary}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: c.border }]} onPress={() => setShowDeadlinePicker(false)}>
                <Text style={[styles.modalBtnText, { color: c.text }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: c.primary }]} onPress={() => {
                const dateMatch = customDeadlineDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                const timeMatch = customDeadlineTime.match(/^(\d{1,2}):(\d{2})$/);
                if (!dateMatch) { Alert.alert('Ошибка', 'Формат даты: ДД.ММ.ГГГГ'); return; }
                if (!timeMatch) { Alert.alert('Ошибка', 'Формат времени: ЧЧ:ММ'); return; }
                const target = new Date(
                  parseInt(dateMatch[3], 10),
                  parseInt(dateMatch[2], 10) - 1,
                  parseInt(dateMatch[1], 10),
                  parseInt(timeMatch[1], 10),
                  parseInt(timeMatch[2], 10), 0, 0
                );
                setDeadline(target.toISOString());
                setShowDeadlinePicker(false);
              }}>
                <Text style={styles.modalBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  saveBtn: { marginTop: 24, marginBottom: 40, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  modalInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
