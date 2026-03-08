import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { RoutineStep } from '../components/RoutineStep';
import { TaskCard } from '../components/TaskCard';
import { useNavigation } from '@react-navigation/native';

const TOTAL_STEPS = 5;

export function WeeklyRoutineScreen() {
  const [step, setStep] = useState(1);
  const [diary, setDiary] = useState('');
  const navigation = useNavigation<any>();
  const tasks = useTaskStore((s) => s.tasks);
  const { moveTask, deleteTask, addWeekStats } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const maybeTasks = tasks.filter((t) => t.category === 'MAYBE' && !t.completed);
  const currentProjects = projects.filter((p) => p.isCurrent);
  const futureProjects = projects.filter((p) => !p.isCurrent);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const completedThisWeek = tasks.filter(
    (t) => t.completed && t.completedAt && new Date(t.completedAt) >= weekStart
  );
  const projectCompleted = completedThisWeek.filter((t) => t.project).length;
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

  // Step 1: Review current projects
  if (step === 1) {
    return (
      <RoutineStep
        stepNumber={1} totalSteps={TOTAL_STEPS}
        title="Обзор текущих проектов"
        description="Подробно просмотрите каждый текущий проект."
        onNext={handleNext}
      >
        <FlatList
          data={currentProjects}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => {
            const projTasks = tasks.filter((t) => t.project === item.name && !t.completed);
            return (
              <TouchableOpacity
                style={[styles.projectCard, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
              >
                <Text style={[styles.projectName, { color: c.text }]}>{item.name}</Text>
                <Text style={[styles.projCount, { color: c.textSecondary }]}>
                  {projTasks.length} активных задач
                </Text>
                {projTasks.slice(0, 3).map((t) => (
                  <Text key={t.id} style={[styles.projTaskPreview, { color: c.textSecondary }]} numberOfLines={1}>
                    • {t.action}
                  </Text>
                ))}
                {projTasks.length > 3 && (
                  <Text style={[styles.projTaskPreview, { color: c.textSecondary }]}>...ещё {projTasks.length - 3}</Text>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет текущих проектов</Text>}
        />
      </RoutineStep>
    );
  }

  // Step 2: Process MAYBE
  if (step === 2) {
    return (
      <RoutineStep
        stepNumber={2} totalSteps={TOTAL_STEPS}
        title="Обработка MAYBE"
        description={`${maybeTasks.length} идей. Актуализируйте или удалите неактуальные.`}
        onNext={handleNext} onBack={handleBack}
      >
        <FlatList
          data={maybeTasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <View style={styles.maybeRow}>
              <View style={{ flex: 1 }}>
                <TaskCard task={item} onPress={() => {}} />
              </View>
              <View style={styles.maybeActions}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: '#3B82F6' }]}
                  onPress={() => moveTask(item.id, 'LATER')}
                >
                  <Text style={styles.smallBtnText}>LATER</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: '#DC2626' }]}
                  onPress={() => deleteTask(item.id)}
                >
                  <Text style={styles.smallBtnText}>Удалить</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет идей в MAYBE</Text>}
        />
      </RoutineStep>
    );
  }

  // Step 3: Review future projects
  if (step === 3) {
    return (
      <RoutineStep
        stepNumber={3} totalSteps={TOTAL_STEPS}
        title="ЯЯ-ПРОЕКТЫ"
        description="Просмотрите будущие проекты. Пора ли что-то активировать?"
        onNext={handleNext} onBack={handleBack}
      >
        <FlatList
          data={futureProjects}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.projectCard, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
            >
              <Text style={[styles.projectName, { color: c.textSecondary }]}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { color: c.textSecondary }]}>Нет ЯЯ-проектов</Text>}
        />
      </RoutineStep>
    );
  }

  // Step 4: Stats
  if (step === 4) {
    return (
      <RoutineStep
        stepNumber={4} totalSteps={TOTAL_STEPS}
        title="Статистика недели"
        description="Итоги за эту неделю."
        onNext={handleNext} onBack={handleBack}
      >
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
            <Text style={[styles.statNumber, { color: c.warning }]}>{Math.round(ratio * 100)}%</Text>
            <Text style={[styles.statLabel, { color: c.textSecondary }]}>Доля проектов</Text>
          </View>
        </View>
      </RoutineStep>
    );
  }

  // Step 5: Diary
  return (
    <RoutineStep
      stepNumber={5} totalSteps={TOTAL_STEPS}
      title="Дневник достижений"
      description="Запишите, чем гордитесь на этой неделе."
      onNext={handleNext} onBack={handleBack}
      nextLabel="Завершить"
    >
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
  projectCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginHorizontal: 16, marginBottom: 8 },
  projectName: { fontSize: 16, fontWeight: '700' },
  projCount: { fontSize: 13, marginTop: 4 },
  projTaskPreview: { fontSize: 12, marginTop: 2 },
  emptyMsg: { textAlign: 'center', paddingVertical: 40, fontSize: 15 },
  maybeRow: { flexDirection: 'row', alignItems: 'center' },
  maybeActions: { marginRight: 16, gap: 6 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  smallBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  statsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, padding: 16 },
  statCard: { width: '45%', padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statNumber: { fontSize: 36, fontWeight: '800' },
  statLabel: { fontSize: 13, marginTop: 4 },
  diaryContainer: { flex: 1, padding: 16 },
  diaryInput: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 15, minHeight: 200 },
});
