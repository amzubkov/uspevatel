import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { RoutineStep } from '../components/RoutineStep';
import { TaskCard } from '../components/TaskCard';
import { useNavigation } from '@react-navigation/native';
import { Category } from '../types';

const TOTAL_STEPS = 5;

export function DailyRoutineScreen() {
  const [step, setStep] = useState(1);
  const navigation = useNavigation<any>();
  const allTasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.moveTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const allProjects = useProjectStore((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => p.isCurrent), [allProjects]);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const inboxTasks = useMemo(() => allTasks.filter((t) => t.category === 'IN' && !t.completed), [allTasks]);
  const dayTasks = useMemo(() => allTasks.filter((t) => t.category === 'DAY' && !t.completed), [allTasks]);
  const laterTasks = useMemo(() => allTasks.filter((t) => t.category === 'LATER' && !t.completed), [allTasks]);
  const controlTasks = useMemo(() => allTasks.filter((t) => t.category === 'CONTROL' && !t.completed), [allTasks]);
  const currentItem = inboxTasks[0];

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(step + 1);
    else navigation.goBack();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Step 1: Process IN one by one
  if (step === 1) {
    return (
      <RoutineStep
        stepNumber={1}
        totalSteps={TOTAL_STEPS}
        title="Обработка Inbox"
        description={inboxTasks.length > 0
          ? `Осталось: ${inboxTasks.length}. Куда отправить эту запись?`
          : 'Inbox пуст! Отлично.'}
        onNext={handleNext}
        nextLabel={inboxTasks.length === 0 ? 'Далее' : 'Пропустить'}
      >
        {currentItem ? (
          <View style={styles.processCard}>
            <View style={[styles.taskBig, { backgroundColor: c.card, borderColor: c.border }]}>
              {currentItem.subject ? (
                <Text style={[styles.taskSubject, { color: c.textSecondary }]}>{currentItem.subject}</Text>
              ) : null}
              <Text style={[styles.taskAction, { color: c.text }]}>{currentItem.action}</Text>
              {currentItem.notes ? (
                <Text style={[styles.taskNotes, { color: c.textSecondary }]}>{currentItem.notes}</Text>
              ) : null}
            </View>
            <View style={styles.moveButtons}>
              {(['DAY', 'LATER', 'CONTROL', 'MAYBE'] as Category[]).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.moveBtn, { backgroundColor: cat === 'DAY' ? '#F59E0B' : cat === 'LATER' ? '#3B82F6' : cat === 'CONTROL' ? '#8B5CF6' : '#6B7280' }]}
                  onPress={() => moveTask(currentItem.id, cat)}
                >
                  <Text style={styles.moveBtnText}>{cat}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.moveBtn, { backgroundColor: '#DC2626' }]}
                onPress={() => deleteTask(currentItem.id)}
              >
                <Text style={styles.moveBtnText}>Удалить</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCenter}>
            <Text style={{ fontSize: 48 }}>✅</Text>
          </View>
        )}
      </RoutineStep>
    );
  }

  // Step 2: Review DAY
  if (step === 2) {
    return (
      <RoutineStep
        stepNumber={2} totalSteps={TOTAL_STEPS}
        title="Просмотр DAY"
        description={`${dayTasks.length} действий на сегодня. Отметьте выполненные или перенесите.`}
        onNext={handleNext} onBack={handleBack}
      >
        <FlatList
          data={dayTasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TaskCard task={item} onPress={() => {}} onComplete={() => completeTask(item.id)} />
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет задач на сегодня</Text>}
        />
      </RoutineStep>
    );
  }

  // Step 3: Review LATER
  if (step === 3) {
    return (
      <RoutineStep
        stepNumber={3} totalSteps={TOTAL_STEPS}
        title="Просмотр LATER"
        description={dayTasks.length < 5 ? 'Мало дел на сегодня — перенесите что-то из LATER.' : `${laterTasks.length} отложенных задач.`}
        onNext={handleNext} onBack={handleBack}
      >
        <FlatList
          data={laterTasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <View style={styles.laterRow}>
              <View style={{ flex: 1 }}>
                <TaskCard task={item} onPress={() => {}} />
              </View>
              <TouchableOpacity
                style={[styles.toDayBtn, { backgroundColor: '#F59E0B' }]}
                onPress={() => moveTask(item.id, 'DAY')}
              >
                <Text style={styles.moveBtnText}>→DAY</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет отложенных задач</Text>}
        />
      </RoutineStep>
    );
  }

  // Step 4: Review CONTROL
  if (step === 4) {
    return (
      <RoutineStep
        stepNumber={4} totalSteps={TOTAL_STEPS}
        title="Просмотр CONTROL"
        description={`${controlTasks.length} задач на контроле. Проверьте статусы.`}
        onNext={handleNext} onBack={handleBack}
      >
        <FlatList
          data={controlTasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TaskCard task={item} onPress={() => {}} onComplete={() => completeTask(item.id)} />
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет задач на контроле</Text>}
        />
      </RoutineStep>
    );
  }

  // Step 5: Projects overview
  return (
    <RoutineStep
      stepNumber={5} totalSteps={TOTAL_STEPS}
      title="Обзор проектов"
      description="Беглый просмотр текущих проектов."
      onNext={handleNext} onBack={handleBack}
      nextLabel="Готово"
    >
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={[styles.projectCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.projectName, { color: c.text }]}>{item.name}</Text>
            {item.notes ? <Text style={[styles.projectNotes, { color: c.textSecondary }]}>{item.notes}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет текущих проектов</Text>}
      />
    </RoutineStep>
  );
}

const styles = StyleSheet.create({
  processCard: { flex: 1, justifyContent: 'center', padding: 16 },
  taskBig: { padding: 20, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  taskSubject: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  taskAction: { fontSize: 20, fontWeight: '600' },
  taskNotes: { fontSize: 14, marginTop: 8 },
  moveButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  moveBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  moveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyMsg: { textAlign: 'center', paddingVertical: 40, fontSize: 15 },
  laterRow: { flexDirection: 'row', alignItems: 'center' },
  toDayBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 16 },
  projectCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginHorizontal: 16, marginBottom: 8 },
  projectName: { fontSize: 16, fontWeight: '700' },
  projectNotes: { fontSize: 13, marginTop: 4 },
});
