import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { useDailyLogStore } from '../store/dailyLogStore';
import { useSportStore } from '../store/sportStore';
import { useExerciseStore } from '../store/exerciseStore';
import { useTaskStore } from '../store/taskStore';
import { colors } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function RatingDots({ value, onChange, color }: { value: number | undefined; onChange: (v: number) => void; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(value === n ? 0 : n)}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: value && value >= n ? color : '#444', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{n}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ChipPicker({ values, value, onChange, color, suffix }: { values: number[]; value: number | undefined; onChange: (v: number) => void; color: string; suffix?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {values.map((v) => (
        <TouchableOpacity key={v} onPress={() => onChange(value === v ? 0 : v)}
          style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: value === v ? color : '#444' }}>
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{v}{suffix || ''}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function DayReviewScreen() {
  const navigation = useNavigation<any>();
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const { logs, saveLog, getLog } = useDailyLogStore();
  const sportEntries = useSportStore((s) => s.entries);
  const allTasks = useTaskStore((s) => s.tasks);

  const [date, setDate] = useState(todayStr());
  const existing = getLog(date);

  const [sleepHours, setSleepHours] = useState('');
  const [sleepQuality, setSleepQuality] = useState<number | undefined>();
  const [productivity, setProductivity] = useState<number | undefined>();
  const [motivation, setMotivation] = useState<number | undefined>();
  const [dayRating, setDayRating] = useState<number | undefined>();
  const [sportFootball, setSportFootball] = useState('');
  const [sportRun, setSportRun] = useState('');
  const [notes, setNotes] = useState('');

  // Load existing data when date changes
  useEffect(() => {
    const log = getLog(date);
    if (log) {
      setSleepHours(log.sleepHours ? String(log.sleepHours) : '');
      setSleepQuality(log.sleepQuality);
      setProductivity(log.productivity);
      setMotivation(log.motivation);
      setDayRating(log.dayRating);
      setSportFootball(log.sportFootball ? String(log.sportFootball) : '');
      setSportRun(log.sportRun ? String(log.sportRun) : '');
      setNotes(log.notes);
    } else {
      setSleepHours(''); setSleepQuality(undefined); setProductivity(undefined);
      setMotivation(undefined); setDayRating(undefined);
      setSportFootball(''); setSportRun(''); setNotes('');
    }
  }, [date]);

  const exercises = useExerciseStore((s) => s.exercises);
  const workoutLogs = useExerciseStore((s) => s.logs);

  // Auto sport data from sportStore (daily counters)
  const sportData = useMemo(() => {
    const dayEntries = sportEntries.filter((e) => e.date === date);
    return {
      pullups: dayEntries.filter((e) => e.type === 'pullups').reduce((s, e) => s + e.count, 0),
      abs: dayEntries.filter((e) => e.type === 'abs').reduce((s, e) => s + e.count, 0),
      triceps: dayEntries.filter((e) => e.type === 'triceps').reduce((s, e) => s + e.count, 0),
      squats: dayEntries.filter((e) => e.type === 'squats').reduce((s, e) => s + e.count, 0),
      run: dayEntries.filter((e) => e.type === 'run').reduce((s, e) => s + e.count, 0),
    };
  }, [sportEntries, date]);

  // Workout logs from exerciseStore (gym exercises)
  const dayWorkouts = useMemo(() => {
    const dayLogs = workoutLogs.filter((l) => l.date === date);
    const grouped = new Map<number, { name: string; sets: number; totalReps: number; maxWeight: number; calories: number }>();
    for (const log of dayLogs) {
      const ex = exercises.find((e) => e.id === log.exerciseId);
      if (!ex) continue;
      const g = grouped.get(log.exerciseId) || { name: ex.name, sets: 0, totalReps: 0, maxWeight: 0, calories: 0 };
      g.sets++;
      g.totalReps += log.reps;
      if (log.weight > g.maxWeight) g.maxWeight = log.weight;
      if (ex.caloriesPerRep) g.calories += log.reps * ex.caloriesPerRep;
      grouped.set(log.exerciseId, g);
    }
    return [...grouped.values()];
  }, [workoutLogs, exercises, date]);

  // Goals & tasks
  const goalsData = useMemo(() => {
    const dayGoalsTotal = allTasks.filter((t) => t.goalType === 'day').length;
    const dayGoalsDone = allTasks.filter((t) => t.goalType === 'day' && t.completed && t.completedAt?.startsWith(date)).length;
    const weekGoalsTotal = allTasks.filter((t) => t.goalType === 'week').length;
    const weekGoalsDone = allTasks.filter((t) => t.goalType === 'week' && t.completed && t.completedAt?.startsWith(date)).length;
    const tasksDone = allTasks.filter((t) => t.completed && t.completedAt?.startsWith(date)).length;
    return { dayGoalsTotal, dayGoalsDone, weekGoalsTotal, weekGoalsDone, tasksDone };
  }, [allTasks, date]);

  const handleSave = async () => {
    await saveLog(date, {
      sleepHours: sleepHours ? parseFloat(sleepHours.replace(',', '.')) : undefined,
      sleepQuality, productivity, motivation, dayRating,
      sportFootball: parseInt(sportFootball) || 0,
      sportRun: parseInt(sportRun) || 0,
      notes,
    });
    Alert.alert('Сохранено');
  };

  const changeDate = (offset: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const hasSport = sportData.pullups > 0 || sportData.abs > 0 || sportData.triceps > 0 || sportData.squats > 0;

  return (
    <ScrollView style={[s.container, { backgroundColor: c.background }]} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Date selector */}
      <View style={s.dateRow}>
        <TouchableOpacity onPress={() => changeDate(-1)}><Text style={[s.dateArrow, { color: c.primary }]}>{'<'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setDate(todayStr())}>
          <Text style={[s.dateText, { color: c.text }]}>{fmtDate(date)} {date === todayStr() ? '(сегодня)' : date.substring(0, 4)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeDate(1)}><Text style={[s.dateArrow, { color: c.primary }]}>{'>'}</Text></TouchableOpacity>
      </View>

      {/* Notes */}
      <TextInput
        style={[s.notesInput, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={notes} onChangeText={setNotes}
        placeholder="Заметки к дню..." placeholderTextColor={c.textSecondary}
        multiline numberOfLines={2}
      />

      {/* Sleep */}
      <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>😴</Text>
          <ChipPicker values={[5, 5.5, 6, 6.5, 7, 7.5, 8]} value={sleepHours ? parseFloat(sleepHours) : undefined} onChange={(h) => setSleepHours(String(h))} color="#3B82F6" suffix="ч" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>💤</Text>
          <ChipPicker values={[70, 75, 80, 85, 90]} value={sleepQuality} onChange={setSleepQuality} color="#60A5FA" suffix="%" />
        </View>
      </View>

      {/* Ratings */}
      <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.ratingRow}>
          <Text style={[s.label, { color: c.text }]}>Работоспособность</Text>
          <RatingDots value={productivity} onChange={setProductivity} color="#22C55E" />
        </View>
        <View style={s.ratingRow}>
          <Text style={[s.label, { color: c.text }]}>Мотивация</Text>
          <RatingDots value={motivation} onChange={setMotivation} color="#F59E0B" />
        </View>
        <View style={s.ratingRow}>
          <Text style={[s.label, { color: c.text }]}>Оценка дня</Text>
          <RatingDots value={dayRating} onChange={setDayRating} color="#8B5CF6" />
        </View>
      </View>

      {/* Sport */}
      {(sportData.pullups > 0 || sportData.abs > 0 || sportData.triceps > 0 || sportData.squats > 0 || sportData.run > 0 || dayWorkouts.length > 0 || sportFootball === '1' || sportRun) && (
        <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Спорт</Text>
          {/* Daily counters */}
          {(sportData.pullups > 0 || sportData.abs > 0 || sportData.triceps > 0 || sportData.squats > 0 || sportData.run > 0) && (
            <View style={s.sportAutoRow}>
              {sportData.pullups > 0 && <Text style={[s.sportChip, { color: c.text }]}>🏋️ {sportData.pullups}</Text>}
              {sportData.abs > 0 && <Text style={[s.sportChip, { color: c.text }]}>🔥 {sportData.abs}</Text>}
              {sportData.triceps > 0 && <Text style={[s.sportChip, { color: c.text }]}>💪 {sportData.triceps}</Text>}
              {sportData.squats > 0 && <Text style={[s.sportChip, { color: c.text }]}>🦵 {sportData.squats}</Text>}
              {sportData.run > 0 && <Text style={[s.sportChip, { color: c.text }]}>🏃 {sportData.run}</Text>}
            </View>
          )}
          {/* Gym exercises */}
          {dayWorkouts.length > 0 && (
            <View style={{ gap: 2, marginTop: sportData.pullups > 0 || sportData.abs > 0 ? 4 : 0 }}>
              {dayWorkouts.map((w, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: c.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{w.name}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>{w.sets}×{Math.round(w.totalReps / w.sets)}</Text>
                  {w.maxWeight > 0 && <Text style={{ color: c.primary, fontSize: 12 }}>{w.maxWeight}кг</Text>}
                  {w.calories > 0 && <Text style={{ color: '#F59E0B', fontSize: 11 }}>{Math.round(w.calories)}ккал</Text>}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Football & Run manual */}
      <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => setSportFootball(sportFootball === '1' ? '' : '1')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 14 }}>{sportFootball === '1' ? '☑' : '☐'}</Text>
            <Text style={{ color: c.text, fontSize: 12 }}>⚽</Text>
          </TouchableOpacity>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>🏃</Text>
          {[5, 10, 15, 20].map((m) => (
            <TouchableOpacity key={m} onPress={() => setSportRun(sportRun === String(m) ? '' : String(m))}
              style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: sportRun === String(m) ? '#22C55E' : '#444' }}>
              <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Goals & tasks */}
      <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Цели и задачи</Text>
        <Text style={{ color: c.text, fontSize: 14 }}>🎯 Цели дня: {goalsData.dayGoalsDone}/{goalsData.dayGoalsTotal}</Text>
        <Text style={{ color: c.text, fontSize: 14 }}>🎯 Цели недели: {goalsData.weekGoalsDone}/{goalsData.weekGoalsTotal}</Text>
        <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>✅ Задач выполнено: {goalsData.tasksDone}</Text>
      </View>

      {/* Save */}
      <TouchableOpacity style={[s.saveBtn, { backgroundColor: c.primary }]} onPress={handleSave}>
        <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Сохранить</Text>
      </TouchableOpacity>

      {/* History */}
      {logs.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[s.sectionTitle, { color: c.textSecondary }]}>История</Text>
          {logs.slice(0, 30).map((log) => (
            <TouchableOpacity key={log.id} style={[s.historyRow, { borderColor: c.border }]}
              onPress={() => setDate(log.date)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: log.date === date ? c.primary : c.text, fontSize: 13, fontWeight: '600', width: 55 }}>{fmtDate(log.date)}</Text>
                {log.dayRating != null && <Text style={{ color: '#8B5CF6', fontSize: 13, fontWeight: '700' }}>📊{log.dayRating}</Text>}
                {log.sleepHours != null && <Text style={{ color: c.textSecondary, fontSize: 12 }}>😴{log.sleepHours}</Text>}
                {log.sleepQuality != null && <Text style={{ color: '#3B82F6', fontSize: 12 }}>💤{log.sleepQuality}%</Text>}
                {log.productivity != null && <Text style={{ color: '#22C55E', fontSize: 12 }}>💪{log.productivity}</Text>}
                {log.motivation != null && <Text style={{ color: '#F59E0B', fontSize: 12 }}>🔥{log.motivation}</Text>}
              </View>
              {log.notes ? <Text style={{ color: c.textSecondary, fontSize: 11, paddingLeft: 55 }} numberOfLines={1}>{log.notes}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 },
  dateArrow: { fontSize: 24, fontWeight: '700', paddingHorizontal: 8 },
  dateText: { fontSize: 18, fontWeight: '700' },
  section: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, fontWeight: '600', flex: 1 },
  smallInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 14, width: 45, textAlign: 'center' },
  sportAutoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sportChip: { fontSize: 14, fontWeight: '600' },
  sportInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top', marginBottom: 12 },
  saveBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 0.5 },
});
