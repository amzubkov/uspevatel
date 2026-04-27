import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { RoutineStep } from '../components/RoutineStep';
import { TaskCard } from '../components/TaskCard';
import { useNavigation } from '@react-navigation/native';
import { Category } from '../types';

const TOTAL_STEPS = 9;

export function DailyRoutineScreen() {
  const [step, setStep] = useState(1);
  const [diary, setDiary] = useState('');
  const navigation = useNavigation<any>();
  const allTasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.moveTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const addWeekStats = useTaskStore((s) => s.addWeekStats);
  const projects = useProjectStore((s) => s.projects);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const inboxTasks = useMemo(() => allTasks.filter((t) => t.category === 'IN' && !t.completed), [allTasks]);
  const dayTasks = useMemo(() => allTasks.filter((t) => t.category === 'DAY' && !t.completed), [allTasks]);
  const laterTasks = useMemo(() => allTasks.filter((t) => t.category === 'LATER' && !t.completed), [allTasks]);
  const controlTasks = useMemo(() => allTasks.filter((t) => t.category === 'CONTROL' && !t.completed), [allTasks]);
  const maybeTasks = useMemo(() => allTasks.filter((t) => t.category === 'MAYBE' && !t.completed), [allTasks]);
  const currentItem = inboxTasks[0];

  const currentProjects = useMemo(() => projects.filter((p) => p.isCurrent), [projects]);
  const futureProjects = useMemo(() => projects.filter((p) => !p.isCurrent), [projects]);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const completedThisWeek = useMemo(() =>
    allTasks.filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= weekStart),
    [allTasks, weekStart]);
  const projectCompleted = useMemo(() => completedThisWeek.filter((t) => t.project).length, [completedThisWeek]);
  const ratio = completedThisWeek.length > 0 ? projectCompleted / completedThisWeek.length : 0;

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      addWeekStats({
        totalCompleted: completedThisWeek.length,
        projectCompleted,
        ratio,
        diaryEntry: diary,
      });
      navigation.goBack();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // ── Daily steps 1-4 ──

  if (step === 1) {
    return (
      <RoutineStep
        stepNumber={1} totalSteps={TOTAL_STEPS}
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

  if (step === 2) {
    return (
      <RoutineStep stepNumber={2} totalSteps={TOTAL_STEPS}
        title="Просмотр DAY"
        description={`${dayTasks.length} действий на сегодня. Отметьте выполненные или перенесите.`}
        onNext={handleNext} onBack={handleBack}>
        <FlatList data={dayTasks} keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TaskCard task={item} onPress={() => {}} onComplete={() => completeTask(item.id)} />}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет задач на сегодня</Text>} />
      </RoutineStep>
    );
  }

  if (step === 3) {
    return (
      <RoutineStep stepNumber={3} totalSteps={TOTAL_STEPS}
        title="Просмотр LATER"
        description={dayTasks.length < 5 ? 'Мало дел на сегодня — перенесите что-то из LATER.' : `${laterTasks.length} отложенных задач.`}
        onNext={handleNext} onBack={handleBack}>
        <FlatList data={laterTasks} keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <View style={styles.laterRow}>
              <View style={{ flex: 1 }}><TaskCard task={item} onPress={() => {}} /></View>
              <TouchableOpacity style={[styles.toDayBtn, { backgroundColor: '#F59E0B' }]} onPress={() => moveTask(item.id, 'DAY')}>
                <Text style={styles.moveBtnText}>→DAY</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет отложенных задач</Text>} />
      </RoutineStep>
    );
  }

  if (step === 4) {
    return (
      <RoutineStep stepNumber={4} totalSteps={TOTAL_STEPS}
        title="Просмотр CONTROL"
        description={`${controlTasks.length} задач на контроле. Проверьте статусы.`}
        onNext={handleNext} onBack={handleBack}>
        <FlatList data={controlTasks} keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TaskCard task={item} onPress={() => {}} onComplete={() => completeTask(item.id)} />}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет задач на контроле</Text>} />
      </RoutineStep>
    );
  }

  // ── Weekly steps 5-9 ──

  if (step === 5) {
    return (
      <RoutineStep stepNumber={5} totalSteps={TOTAL_STEPS}
        title="Обзор текущих проектов"
        description="Подробно просмотрите каждый текущий проект."
        onNext={handleNext} onBack={handleBack}>
        <FlatList data={currentProjects} keyExtractor={(p) => p.id}
          renderItem={({ item }) => {
            const projTasks = allTasks.filter((t) => t.project === item.name && !t.completed);
            return (
              <TouchableOpacity style={[styles.projectCard, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}>
                <Text style={[styles.projectName, { color: c.text }]}>{item.name}</Text>
                <Text style={[styles.projCount, { color: c.textSecondary }]}>{projTasks.length} активных задач</Text>
                {projTasks.slice(0, 3).map((t) => (
                  <Text key={t.id} style={[styles.projTaskPreview, { color: c.textSecondary }]} numberOfLines={1}>• {t.action}</Text>
                ))}
                {projTasks.length > 3 && <Text style={[styles.projTaskPreview, { color: c.textSecondary }]}>...ещё {projTasks.length - 3}</Text>}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет текущих проектов</Text>} />
      </RoutineStep>
    );
  }

  if (step === 6) {
    return (
      <RoutineStep stepNumber={6} totalSteps={TOTAL_STEPS}
        title="Обработка MAYBE"
        description={`${maybeTasks.length} идей. Актуализируйте или удалите неактуальные.`}
        onNext={handleNext} onBack={handleBack}>
        <FlatList data={maybeTasks} keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <View style={styles.laterRow}>
              <View style={{ flex: 1 }}><TaskCard task={item} onPress={() => {}} /></View>
              <View style={{ marginRight: 16, gap: 6 }}>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#3B82F6' }]} onPress={() => moveTask(item.id, 'LATER')}>
                  <Text style={styles.smallBtnText}>LATER</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#DC2626' }]} onPress={() => deleteTask(item.id)}>
                  <Text style={styles.smallBtnText}>Удалить</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет идей в MAYBE</Text>} />
      </RoutineStep>
    );
  }

  if (step === 7) {
    return (
      <RoutineStep stepNumber={7} totalSteps={TOTAL_STEPS}
        title="ЯЯ-ПРОЕКТЫ"
        description="Просмотрите будущие проекты. Пора ли что-то активировать?"
        onNext={handleNext} onBack={handleBack}>
        <FlatList data={futureProjects} keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.projectCard, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}>
              <Text style={[styles.projectName, { color: c.textSecondary }]}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет ЯЯ-проектов</Text>} />
      </RoutineStep>
    );
  }

  if (step === 8) {
    return (
      <RoutineStep stepNumber={8} totalSteps={TOTAL_STEPS}
        title="Статистика недели"
        description="Итоги за эту неделю."
        onNext={handleNext} onBack={handleBack}>
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.statNumber, { color: c.primary }]}>{completedThisWeek.length}</Text>
            <Text style={[styles.statLabel, { color: c.textSecondary }]}>Выполнено задач</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.statNumber, { color: c.success }]}>{projectCompleted}</Text>
            <Text style={[styles.statLabel, { color: c.textSecondary }]}>По проектам</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{Math.round(ratio * 100)}%</Text>
            <Text style={[styles.statLabel, { color: c.textSecondary }]}>Доля проектов</Text>
          </View>
        </View>
      </RoutineStep>
    );
  }

  // Step 9: Diary
  return (
    <RoutineStep stepNumber={9} totalSteps={TOTAL_STEPS}
      title="Дневник достижений"
      description="Запишите, чем гордитесь на этой неделе."
      onNext={handleNext} onBack={handleBack}
      nextLabel="Завершить">
      <View style={styles.diaryContainer}>
        <TextInput
          style={[styles.diaryInput, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
          value={diary}
          onChangeText={setDiary}
          placeholder="Мои достижения за эту неделю..."
          placeholderTextColor={c.textSecondary}
          multiline
          textAlignVertical="top"
        />
      </View>
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
  projCount: { fontSize: 13, marginTop: 4 },
  projTaskPreview: { fontSize: 12, marginTop: 2 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  smallBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  statsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, padding: 16 },
  statCard: { width: '45%', padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statNumber: { fontSize: 36, fontWeight: '800' },
  statLabel: { fontSize: 13, marginTop: 4 },
  diaryContainer: { flex: 1, padding: 16 },
  diaryInput: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 15, minHeight: 200 },
});
