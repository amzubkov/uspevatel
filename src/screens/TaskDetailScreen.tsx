import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, FlatList } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { Category, CATEGORY_LABELS } from '../types';
import { useNavigation, useRoute } from '@react-navigation/native';
import { scheduleTaskReminder, cancelTaskReminder } from '../utils/notifications';

const CATEGORIES: Category[] = ['IN', 'DAY', 'LATER', 'CONTROL', 'MAYBE'];

export function TaskDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { taskId } = route.params;
  const allTasks = useTaskStore((s) => s.tasks);
  const task = useMemo(() => allTasks.find((t) => t.id === taskId), [allTasks, taskId]);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const projects = useProjectStore((s) => s.projects);
  const addProject = useProjectStore((s) => s.addProject);
  const contextCategories = useSettingsStore((s) => s.contextCategories);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const [subject, setSubject] = useState(task?.subject || '');
  const [action, setAction] = useState(task?.action || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [category, setCategory] = useState<Category>(task?.category || 'IN');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>(task?.priority || 'normal');
  const [project, setProject] = useState<string | undefined>(task?.project);
  const [contextCategory, setContextCategory] = useState<string | undefined>(task?.contextCategory);
  const [deadline, setDeadline] = useState<string | undefined>(task?.deadline);
  const [showSubjectList, setShowSubjectList] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [showCustomReminder, setShowCustomReminder] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [customDeadlineDate, setCustomDeadlineDate] = useState('');
  const [customDeadlineTime, setCustomDeadlineTime] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const deletedRef = useRef(false);

  // Unique subjects from all tasks
  const knownSubjects = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach((t) => { if (t.subject?.trim()) set.add(t.subject.trim()); });
    const arr = Array.from(set).sort();
    if (!subject.trim()) return arr;
    const q = subject.toLowerCase();
    return arr.filter((s) => s.toLowerCase().includes(q));
  }, [allTasks, subject]);

  // Filter projects by typing
  const filteredProjects = useMemo(() => {
    if (!project?.trim()) return projects;
    const q = project.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, project]);

  // Auto-save when leaving the screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (!deletedRef.current && task) {
        ensureProjectExists(project);
        updateTask(taskId, { subject, action, notes, category, priority, project: project || undefined, contextCategory: contextCategory || undefined, deadline: deadline || undefined });
      }
    });
    return unsubscribe;
  }, [navigation, taskId, subject, action, notes, category, project, contextCategory, deadline]);

  if (!task) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: c.textSecondary }}>Задача не найдена</Text>
      </View>
    );
  }

  const ensureProjectExists = (name: string | undefined) => {
    if (!name?.trim()) return;
    const exists = projects.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (!exists) addProject(name.trim());
  };

  const handleSave = () => {
    deletedRef.current = true;
    ensureProjectExists(project);
    updateTask(taskId, { subject, action, notes, category, priority, project: project || undefined, contextCategory: contextCategory || undefined, deadline: deadline || undefined });
    navigation.goBack();
  };

  const doDelete = async () => {
    deletedRef.current = true;
    await cancelTaskReminder(taskId);
    deleteTask(taskId);
    navigation.goBack();
  };

  const handleDelete = () => {
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Удалить задачу? Это действие нельзя отменить')) {
        doDelete();
      }
    } else {
      Alert.alert('Удалить задачу?', 'Это действие нельзя отменить', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleSetReminder = (minutes: number, label: string) => {
    const date = new Date(Date.now() + minutes * 60 * 1000);
    scheduleTaskReminder(taskId, task.action, date).then((id) => {
      if (id) {
        updateTask(taskId, { reminderAt: date.toISOString() });
        Alert.alert('🔔 Напоминание', `Установлено: ${label}`);
      } else {
        Alert.alert('Ошибка', 'Нет разрешения на уведомления');
      }
    });
  };

  const openCustomReminder = () => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    setCustomDate(`${dd}.${mm}.${yyyy}`);
    setCustomTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setShowCustomReminder(true);
  };

  const handleCustomReminderSave = () => {
    const dateMatch = customDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const timeMatch = customTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!dateMatch) { Alert.alert('Ошибка', 'Формат даты: ДД.ММ.ГГГГ'); return; }
    if (!timeMatch) { Alert.alert('Ошибка', 'Формат времени: ЧЧ:ММ'); return; }
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const year = parseInt(dateMatch[3], 10);
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    if (h > 23 || m > 59) { Alert.alert('Ошибка', 'Неверное время'); return; }
    const target = new Date(year, month, day, h, m, 0, 0);
    if (target <= new Date()) { Alert.alert('Ошибка', 'Дата должна быть в будущем'); return; }
    setShowCustomReminder(false);
    scheduleTaskReminder(taskId, task.action, target).then((id) => {
      if (id) {
        updateTask(taskId, { reminderAt: target.toISOString() });
        Alert.alert('🔔', `${customDate} ${customTime}`);
      }
    });
  };

  const handleCancelReminder = async () => {
    await cancelTaskReminder(taskId);
    updateTask(taskId, { reminderAt: undefined });
    Alert.alert('Напоминание снято');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} keyboardShouldPersistTaps="handled">
      <Text style={[styles.createdDate, { color: c.textSecondary }]}>
        {new Date(task.createdAt).toLocaleDateString('ru-RU')}
      </Text>
      {/* Человек с автодополнением */}
      <Text style={[styles.label, { color: c.textSecondary }]}>👤 Человек</Text>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={subject}
        onChangeText={(t) => { setSubject(t); setShowSubjectList(true); }}
        onFocus={() => setShowSubjectList(true)}
        onBlur={() => setTimeout(() => setShowSubjectList(false), 200)}
        placeholder="Кто делает / для кого"
        placeholderTextColor={c.textSecondary}
      />
      {showSubjectList && knownSubjects.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: c.card, borderColor: c.border }]}>
          {knownSubjects.slice(0, 6).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.dropdownItem, { borderColor: c.border }]}
              onPress={() => { setSubject(s); setShowSubjectList(false); }}
            >
              <Text style={[styles.dropdownText, { color: c.text }]}>👤 {s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Действие */}
      <Text style={[styles.label, { color: c.textSecondary }]}>Действие</Text>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={action}
        onChangeText={setAction}
        multiline
      />

      {/* Проект с автодополнением */}
      <Text style={[styles.label, { color: c.textSecondary }]}>📂 Проект</Text>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={project || ''}
        onChangeText={(t) => { setProject(t || undefined); setShowProjectList(true); }}
        onFocus={() => setShowProjectList(true)}
        onBlur={() => setTimeout(() => setShowProjectList(false), 200)}
        placeholder="Выберите или введите проект"
        placeholderTextColor={c.textSecondary}
      />
      {showProjectList && filteredProjects.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: c.card, borderColor: c.border }]}>
          {project?.trim() && (
            <TouchableOpacity
              style={[styles.dropdownItem, { borderColor: c.border }]}
              onPress={() => { setProject(undefined); setShowProjectList(false); }}
            >
              <Text style={[styles.dropdownText, { color: c.danger }]}>✕ Убрать проект</Text>
            </TouchableOpacity>
          )}
          {filteredProjects.slice(0, 6).map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.dropdownItem, { borderColor: c.border }]}
              onPress={() => { setProject(p.name); setShowProjectList(false); }}
            >
              <Text style={[styles.dropdownText, { color: c.text }]}>
                📂 {p.name} {p.isCurrent ? '(текущий)' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Контекст */}
      {contextCategories.length > 0 && (
        <>
          <Text style={[styles.label, { color: c.textSecondary }]}>🏷 Контекст</Text>
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
                <Text style={[styles.chipText, { color: contextCategory === ctx ? '#FFF' : c.text }]}>\{ctx}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Категория */}
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

      {/* Приоритет */}
      <Text style={[styles.label, { color: c.textSecondary }]}>Приоритет</Text>
      <View style={styles.chips}>
        {(['high', 'normal', 'low'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, {
              backgroundColor: priority === p
                ? (p === 'high' ? '#DC2626' : p === 'normal' ? '#16A34A' : '#EAB308')
                : c.card,
              borderWidth: 1, borderColor: c.border,
            }]}
            onPress={() => setPriority(p)}
          >
            <Text style={[styles.chipText, { color: priority === p ? '#FFF' : c.text }]}>
              {p === 'high' ? 'Высокий' : p === 'normal' ? 'Обычный' : 'Низкий'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {task.completedAt && (
        <View style={[styles.infoRow, { borderColor: c.border }]}>
          <Text style={[styles.infoLabel, { color: c.textSecondary }]}>Выполнено</Text>
          <Text style={[styles.infoValue, { color: c.text }]}>
            {new Date(task.completedAt).toLocaleDateString('ru-RU')}
          </Text>
        </View>
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
        <View style={styles.reminderOptions}>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {
            const d = new Date(); d.setHours(23, 59, 0, 0);
            setDeadline(d.toISOString());
          }}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>Сегодня</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {
            const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0);
            setDeadline(d.toISOString());
          }}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>Завтра</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {
            const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(23, 59, 0, 0);
            setDeadline(d.toISOString());
          }}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>Послезавтра</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {
            const now = new Date();
            setCustomDeadlineDate(`${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`);
            setCustomDeadlineTime('23:59');
            setShowDeadlinePicker(true);
          }}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>Кастом</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Заметки */}
      <Text style={[styles.label, { color: c.textSecondary }]}>Заметки</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={notes}
        onChangeText={setNotes}
        onFocus={() => {
          const today = new Date().toLocaleDateString('ru-RU');
          if (notes.startsWith(today)) return;
          if (notes.trim()) {
            setNotes(today + '\n' + notes);
          } else {
            setNotes(today + ' ');
          }
        }}
        multiline
        numberOfLines={4}
      />

      {/* Напоминание */}
      <Text style={[styles.label, { color: c.textSecondary }]}>🔔 Напоминание</Text>
      {task.reminderAt ? (
        <View style={styles.reminderRow}>
          <Text style={[styles.reminderText, { color: c.text }]}>
            {new Date(task.reminderAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
          <TouchableOpacity style={[styles.reminderBtn, { backgroundColor: c.danger }]} onPress={handleCancelReminder}>
            <Text style={styles.reminderBtnText}>Снять</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.reminderOptions}>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => handleSetReminder(60, 'через 1 час')}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>⏰ 1ч</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => handleSetReminder(180, 'через 3 часа')}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>⏰ 3ч</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);
            scheduleTaskReminder(taskId, task.action, tomorrow).then((id) => {
              if (id) {
                updateTask(taskId, { reminderAt: tomorrow.toISOString() });
                Alert.alert('🔔', 'Завтра 10:00');
              }
            });
          }}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>📅 Завтра</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reminderChip, { backgroundColor: c.card, borderColor: c.border }]} onPress={openCustomReminder}>
            <Text style={[styles.reminderChipText, { color: c.text }]}>🕐 Кастом</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Действия */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: task.completed ? c.warning : c.success }]}
          onPress={() => {
            task.completed ? uncompleteTask(taskId) : completeTask(taskId);
            navigation.goBack();
          }}
        >
          <Text style={styles.actionBtnText}>{task.completed ? 'Вернуть' : 'Выполнено'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: c.primary }]} onPress={handleSave}>
          <Text style={styles.actionBtnText}>Сохранить</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
        <Text style={[styles.deleteBtnText, { color: c.danger }]}>Удалить задачу</Text>
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

      <Modal visible={showCustomReminder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Напоминание</Text>
            <Text style={[styles.modalLabel, { color: c.textSecondary }]}>Дата (ДД.ММ.ГГГГ)</Text>
            <TextInput
              style={[styles.modalInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
              value={customDate}
              onChangeText={setCustomDate}
              placeholder="01.03.2026"
              placeholderTextColor={c.textSecondary}
              keyboardType="numeric"
            />
            <Text style={[styles.modalLabel, { color: c.textSecondary }]}>Время (ЧЧ:ММ)</Text>
            <TextInput
              style={[styles.modalInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
              value={customTime}
              onChangeText={setCustomTime}
              placeholder="14:30"
              placeholderTextColor={c.textSecondary}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: c.border }]} onPress={() => setShowCustomReminder(false)}>
                <Text style={[styles.modalBtnText, { color: c.text }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: c.primary }]} onPress={handleCustomReminderSave}>
                <Text style={styles.modalBtnText}>Установить</Text>
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
  createdDate: { fontSize: 11, textAlign: 'right', marginBottom: -8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  dropdown: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginTop: -4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  dropdownText: { fontSize: 14, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, marginTop: 8 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  reminderText: { fontSize: 15, fontWeight: '500' },
  reminderBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  reminderBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  reminderOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  reminderChipText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  deleteBtn: { marginTop: 16, marginBottom: 40, paddingVertical: 14, alignItems: 'center' },
  deleteBtnText: { fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  modalInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
