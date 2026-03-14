import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSportStore, SportEntry } from '../store/sportStore';
import { ExercisesScreen } from './ExercisesScreen';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

const SportTab = createBottomTabNavigator();

function useTodayStr() {
  return useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
}

// ─── Reusable exercise tab ───
function ExerciseTab({ type, unit, quickCounts }: { type: SportEntry['type']; unit: string; quickCounts: number[] }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const entries = useSportStore((s) => s.entries);
  const addEntry = useSportStore((s) => s.addEntry);
  const removeEntry = useSportStore((s) => s.removeEntry);
  const today = useTodayStr();

  const todayEntries = useMemo(() => entries.filter((e) => e.type === type && e.date === today), [entries, today, type]);
  const todayTotal = useMemo(() => todayEntries.reduce((sum, e) => sum + e.count, 0), [todayEntries]);

  const groupedByDate = useMemo(() => {
    const filtered = entries.filter((e) => e.type === type);
    const map = new Map<string, SportEntry[]>();
    for (const e of filtered) {
      const arr = map.get(e.date) || [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries, type]);

  const handleRemove = (entry: SportEntry) => {
    Alert.alert('Удалить?', `${entry.count} ${unit} в ${entry.time}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(entry.id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Today counter */}
      <View style={[styles.todayCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.todayLabel, { color: c.textSecondary }]}>Сегодня</Text>
        <Text style={[styles.todayCount, { color: c.primary }]}>{todayTotal}</Text>
        <Text style={[styles.todayUnit, { color: c.textSecondary }]}>{unit}</Text>
      </View>

      {/* Quick add buttons */}
      <View style={styles.quickRow}>
        {quickCounts.map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.quickBtn, { backgroundColor: c.primary }]}
            onPress={() => addEntry(type, n)}
          >
            <Text style={styles.quickBtnText}>+{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Today's entries */}
      {todayEntries.length > 0 && (
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Сегодня по подходам</Text>
      )}
      <FlatList
        data={todayEntries}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onLongPress={() => handleRemove(item)}
            style={[styles.entryRow, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
          >
            <Text style={[styles.entryTime, { color: c.textSecondary }]}>{item.time}</Text>
            <Text style={[styles.entryCount, { color: c.text }]}>{item.count} {unit}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListFooterComponent={
          groupedByDate.length > 1 ? (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>История</Text>
              {groupedByDate.filter(([date]) => date !== today).slice(0, 14).map(([date, dayEntries]) => {
                const total = dayEntries.reduce((s, e) => s + e.count, 0);
                return (
                  <View key={date} style={[styles.historyRow, { borderColor: c.border }]}>
                    <Text style={[styles.historyDate, { color: c.text }]}>{date}</Text>
                    <Text style={[styles.historyTotal, { color: c.primary }]}>{total}</Text>
                  </View>
                );
              })}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const DAILY_MODES = [
  { key: 'pullups' as const, label: 'Подтяг.', icon: '🏋️', unit: 'подт.', quickCounts: [1, 2, 3, 5, 10] },
  { key: 'abs' as const, label: 'Пресс', icon: '🔥', unit: 'раз', quickCounts: [1, 5, 10, 20] },
  { key: 'triceps' as const, label: 'Трицепс', icon: '💪', unit: 'раз', quickCounts: [1, 5, 10, 20] },
  { key: 'run' as const, label: 'Бег', icon: '🏃', unit: '', quickCounts: [] },
];

function DailyTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [mode, setMode] = useState<'pullups' | 'abs' | 'triceps' | 'run'>('pullups');
  const current = DAILY_MODES.find((m) => m.key === mode)!;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Mode selector */}
      <View style={styles.modeRow}>
        {DAILY_MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[
              styles.modeBtn,
              { backgroundColor: mode === m.key ? c.primary : c.card, borderColor: c.border, borderWidth: 1 },
            ]}
            onPress={() => setMode(m.key)}
          >
            <Text style={{ fontSize: 16 }}>{m.icon}</Text>
            <Text style={[styles.modeBtnText, { color: mode === m.key ? '#FFF' : c.text }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {mode === 'run' ? (
        <RunContent />
      ) : (
        <ExerciseTab type={current.key as 'pullups' | 'abs' | 'triceps'} unit={current.unit} quickCounts={current.quickCounts} />
      )}
    </View>
  );
}

function RunContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const entries = useSportStore((s) => s.entries);
  const addEntry = useSportStore((s) => s.addEntry);
  const removeEntry = useSportStore((s) => s.removeEntry);
  const today = useTodayStr();

  const todayRuns = useMemo(() => entries.filter((e) => e.type === 'run' && e.date === today), [entries, today]);
  const allRuns = useMemo(() => entries.filter((e) => e.type === 'run'), [entries]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, SportEntry[]>();
    for (const e of allRuns) {
      const arr = map.get(e.date) || [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [allRuns]);

  const handleRemove = (entry: SportEntry) => {
    Alert.alert('Удалить?', `${entry.label || 'бег'} в ${entry.time}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(entry.id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.todayCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.todayLabel, { color: c.textSecondary }]}>Сегодня</Text>
        <Text style={[styles.todayCount, { color: c.primary }]}>{todayRuns.length}</Text>
        <Text style={[styles.todayUnit, { color: c.textSecondary }]}>тренировок</Text>
      </View>

      <View style={styles.quickRow}>
        {RUN_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.runBtn, { backgroundColor: c.primary }]}
            onPress={() => addEntry('run', 1, opt.value)}
          >
            <Text style={styles.runBtnText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {todayRuns.length > 0 && (
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Сегодня</Text>
      )}
      <FlatList
        data={todayRuns}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onLongPress={() => handleRemove(item)}
            style={[styles.entryRow, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
          >
            <Text style={[styles.entryTime, { color: c.textSecondary }]}>{item.time}</Text>
            <Text style={[styles.entryCount, { color: c.text }]}>
              {RUN_OPTIONS.find((o) => o.value === item.label)?.label || item.label}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListFooterComponent={
          groupedByDate.length > 1 ? (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>История</Text>
              {groupedByDate.filter(([date]) => date !== today).slice(0, 14).map(([date, dayEntries]) => (
                <View key={date} style={[styles.historyRow, { borderColor: c.border }]}>
                  <Text style={[styles.historyDate, { color: c.text }]}>{date}</Text>
                  <Text style={[styles.historyTotal, { color: c.primary }]}>
                    {dayEntries.map((e) => RUN_OPTIONS.find((o) => o.value === e.label)?.label || e.label).join(', ')}
                  </Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

function WeightTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const entries = useSportStore((s) => s.entries);
  const addEntry = useSportStore((s) => s.addEntry);
  const removeEntry = useSportStore((s) => s.removeEntry);
  const today = useTodayStr();
  const [weightInput, setWeightInput] = useState('');

  const weightEntries = useMemo(() => entries.filter((e) => e.type === 'weight'), [entries]);
  const todayWeight = useMemo(() => weightEntries.find((e) => e.date === today), [weightEntries, today]);
  const last14 = useMemo(() => {
    const seen = new Set<string>();
    return weightEntries.filter((e) => { if (seen.has(e.date)) return false; seen.add(e.date); return true; }).slice(0, 14);
  }, [weightEntries]);

  const handleAdd = () => {
    const val = parseFloat(weightInput.replace(',', '.'));
    if (!val || val < 20 || val > 300) return;
    addEntry('weight', val);
    setWeightInput('');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.todayCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.todayLabel, { color: c.textSecondary }]}>Сегодня</Text>
        <Text style={[styles.todayCount, { color: c.primary }]}>{todayWeight ? todayWeight.count : '—'}</Text>
        <Text style={[styles.todayUnit, { color: c.textSecondary }]}>кг</Text>
      </View>

      <View style={[styles.weightInputRow]}>
        <TextInput
          style={[styles.weightInput, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
          value={weightInput}
          onChangeText={setWeightInput}
          placeholder="Вес, кг"
          placeholderTextColor={c.textSecondary}
          keyboardType="decimal-pad"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity style={[styles.quickBtn, { backgroundColor: c.primary }]} onPress={handleAdd}>
          <Text style={styles.quickBtnText}>✓</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>История</Text>
      <FlatList
        data={last14}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onLongPress={() => Alert.alert('Удалить?', `${item.count} кг`, [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(item.id) },
            ])}
            style={[styles.entryRow, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
          >
            <Text style={[styles.entryTime, { color: c.textSecondary }]}>{item.date}</Text>
            <Text style={[styles.entryCount, { color: c.text }]}>{item.count} кг</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 80 }}
      />
    </View>
  );
}

const RUN_OPTIONS = [
  { label: '⚽ Футбол', value: 'football' },
  { label: '5 км', value: '5km' },
  { label: '10 км', value: '10km' },
  { label: '20 км', value: '20km' },
];

const TYPE_LABELS: Record<string, string> = { pullups: 'подтяг.', abs: 'пресс', triceps: 'трицепс', run: 'бег', weight: 'вес' };

// Расчёт калорий по MET (Metabolic Equivalent of Task) и весу тела
// Формула: kcal = MET × вес(кг) × время(ч)
// Подтягивания: MET 8.0 (vigorous calisthenics), ~4сек/повтор → 0.005 kcal/кг/повтор
// Пресс: MET 3.8 (moderate calisthenics), ~2сек/повтор → 0.003 kcal/кг/повтор
// Трицепс (отжимания/брусья): MET 8.0, ~3сек/повтор → 0.004 kcal/кг/повтор
// Бег: ~1 kcal/кг/км (общепринятая формула), футбол MET 7.0 × 1ч
const CAL_PER_REP_PER_KG: Record<string, number> = { pullups: 0.005, abs: 0.003, triceps: 0.004 };
const CAL_RUN_PER_KG: Record<string, number> = { football: 7, '5km': 5, '10km': 10, '20km': 20 };

function calcCalories(entry: SportEntry, weightKg: number): number {
  if (entry.type === 'run') {
    const perKg = CAL_RUN_PER_KG[entry.label || ''] || 5;
    return Math.round(perKg * weightKg);
  }
  const perRepPerKg = CAL_PER_REP_PER_KG[entry.type];
  if (perRepPerKg) return Math.round(entry.count * perRepPerKg * weightKg);
  return 0;
}

function calcCaloriesForEntries(entries: SportEntry[], weightKg: number): number {
  return entries.reduce((sum, e) => sum + calcCalories(e, weightKg), 0);
}

function formatEntryLabel(e: SportEntry): string {
  if (e.type === 'run') return RUN_OPTIONS.find((o) => o.value === e.label)?.label || e.label || 'бег';
  if (e.type === 'weight') return `${e.count} кг`;
  return `${e.count} ${TYPE_LABELS[e.type] || ''}`;
}

function handleEditEntry(entry: SportEntry, updateEntry: (id: string, fields: Partial<Pick<SportEntry, 'count' | 'label'>>) => void, removeEntry: (id: string) => void) {
  if (entry.type === 'run') {
    const buttons = RUN_OPTIONS.map((opt) => ({
      text: opt.label,
      onPress: () => updateEntry(entry.id, { label: opt.value }),
    }));
    buttons.push({ text: 'Удалить', onPress: () => removeEntry(entry.id) });
    buttons.push({ text: 'Отмена', onPress: () => {} });
    Alert.alert('Изменить тип', `Сейчас: ${formatEntryLabel(entry)}`, buttons);
  } else if (entry.type === 'weight') {
    Alert.prompt('Изменить вес', `Сейчас: ${entry.count} кг`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(entry.id) },
      { text: 'OK', onPress: (val?: string) => {
        const n = parseFloat((val || '').replace(',', '.'));
        if (n && n >= 20 && n <= 300) updateEntry(entry.id, { count: n });
      }},
    ], 'plain-text', String(entry.count));
  } else {
    Alert.prompt('Изменить кол-во', `Сейчас: ${entry.count}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(entry.id) },
      { text: 'OK', onPress: (val?: string) => {
        const n = parseInt(val || '', 10);
        if (n && n > 0) updateEntry(entry.id, { count: n });
      }},
    ], 'plain-text', String(entry.count));
  }
}

// ─── Stats tab ───
function StatsTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const entries = useSportStore((s) => s.entries);
  const updateEntry = useSportStore((s) => s.updateEntry);
  const removeEntry = useSportStore((s) => s.removeEntry);
  const today = useTodayStr();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Последний записанный вес (по умолчанию 80 кг)
  const lastWeight = useMemo(() => {
    const w = entries.find((e) => e.type === 'weight');
    return w ? w.count : 80;
  }, [entries]);

  const todayEntries = useMemo(() => entries.filter((e) => e.date === today && e.type !== 'weight'), [entries, today]);
  const todayPullUps = useMemo(() => todayEntries.filter((e) => e.type === 'pullups').reduce((s, e) => s + e.count, 0), [todayEntries]);
  const todayAbs = useMemo(() => todayEntries.filter((e) => e.type === 'abs').reduce((s, e) => s + e.count, 0), [todayEntries]);
  const todayTriceps = useMemo(() => todayEntries.filter((e) => e.type === 'triceps').reduce((s, e) => s + e.count, 0), [todayEntries]);
  const todayRuns = useMemo(() => todayEntries.filter((e) => e.type === 'run').length, [todayEntries]);
  const todayCal = useMemo(() => calcCaloriesForEntries(todayEntries, lastWeight), [todayEntries, lastWeight]);

  // Last 7 days
  const last7 = useMemo(() => {
    const days: { date: string; pullups: number; abs: number; triceps: number; runs: number; cal: number; entries: SportEntry[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayEntries = entries.filter((e) => e.date === ds && e.type !== 'weight');
      const pullups = dayEntries.filter((e) => e.type === 'pullups').reduce((s, e) => s + e.count, 0);
      const abs = dayEntries.filter((e) => e.type === 'abs').reduce((s, e) => s + e.count, 0);
      const triceps = dayEntries.filter((e) => e.type === 'triceps').reduce((s, e) => s + e.count, 0);
      const runs = dayEntries.filter((e) => e.type === 'run').length;
      const cal = calcCaloriesForEntries(dayEntries, lastWeight);
      days.push({ date: ds, pullups, abs, triceps, runs, cal, entries: dayEntries });
    }
    return days;
  }, [entries, lastWeight]);

  const weekPullUps = last7.reduce((s, d) => s + d.pullups, 0);
  const weekAbs = last7.reduce((s, d) => s + d.abs, 0);
  const weekTriceps = last7.reduce((s, d) => s + d.triceps, 0);
  const weekRuns = last7.reduce((s, d) => s + d.runs, 0);
  const weekCal = last7.reduce((s, d) => s + d.cal, 0);

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={{ padding: 12 }}>
      <Text style={[styles.statsHeader, { color: c.text }]}>Сегодня</Text>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{todayPullUps}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>подтяг.</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{todayAbs}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>пресс</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{todayTriceps}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>трицепс</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{todayRuns}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>бег</Text>
        </View>
      </View>
      <View style={[styles.calCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.statNum, { color: '#FF6B35' }]}>{todayCal}</Text>
        <Text style={[styles.statLabel, { color: c.textSecondary }]}> kcal (~{lastWeight} кг)</Text>
      </View>

      <Text style={[styles.statsHeader, { color: c.text, marginTop: 16 }]}>За неделю</Text>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{weekPullUps}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>подтяг.</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{weekAbs}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>пресс</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{weekTriceps}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>трицепс</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{weekRuns}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>бег</Text>
        </View>
      </View>
      <View style={[styles.calCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.statNum, { color: '#FF6B35' }]}>{weekCal}</Text>
        <Text style={[styles.statLabel, { color: c.textSecondary }]}> kcal за неделю</Text>
      </View>

      <Text style={[styles.statsHeader, { color: c.text, marginTop: 16 }]}>Последние 7 дней</Text>
      {last7.map((day) => (
        <View key={day.date}>
          <TouchableOpacity
            style={[styles.dayRow, { borderColor: c.border }]}
            onPress={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
          >
            <Text style={[styles.dayDate, { color: c.text }]}>{day.date}</Text>
            <Text style={[styles.dayVal, { color: c.primary }]}>{day.pullups} подт.</Text>
            <Text style={[styles.dayVal, { color: c.primary }]}>{day.abs} пр.</Text>
            <Text style={[styles.dayVal, { color: c.primary }]}>{day.triceps} тр.</Text>
            {day.cal > 0 && <Text style={[styles.dayVal, { color: '#FF6B35', width: 50 }]}>{day.cal}</Text>}
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{expandedDay === day.date ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {expandedDay === day.date && day.entries.length > 0 && (
            <View style={[styles.expandedDay, { backgroundColor: c.card, borderColor: c.border }]}>
              {day.entries.sort((a, b) => a.time.localeCompare(b.time)).map((entry) => (
                <TouchableOpacity
                  key={entry.id}
                  style={[styles.expandedEntry, { borderColor: c.border }]}
                  onPress={() => handleEditEntry(entry, updateEntry, removeEntry)}
                >
                  <Text style={[styles.entryTime, { color: c.textSecondary }]}>{entry.time}</Text>
                  <Text style={[{ color: c.textSecondary, fontSize: 12 }]}>{TYPE_LABELS[entry.type]}</Text>
                  <Text style={[styles.entryCount, { color: c.text, flex: 1 }]}>{formatEntryLabel(entry)}</Text>
                  <Text style={{ color: '#FF6B35', fontSize: 12 }}>{calcCalories(entry, lastWeight)} kcal</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Main Sport Screen with bottom tabs ───
export function SportScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  return (
    <SportTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <SportTab.Screen
        name="Daily"
        component={DailyTab}
        options={{
          title: 'Daily',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>🔥</Text>,
        }}
      />
      <SportTab.Screen
        name="Weight"
        component={WeightTab}
        options={{
          title: 'Вес',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>⚖️</Text>,
        }}
      />
      <SportTab.Screen
        name="Exercises"
        component={ExercisesScreen}
        options={{
          title: 'Упражнения',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>📋</Text>,
        }}
      />
      <SportTab.Screen
        name="SportStats"
        component={StatsTab}
        options={{
          title: 'Статистика',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>📊</Text>,
        }}
      />
    </SportTab.Navigator>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  todayCard: { alignItems: 'center', marginHorizontal: 12, marginTop: 12, paddingVertical: 20, borderRadius: 12, borderWidth: 1 },
  todayLabel: { fontSize: 13, fontWeight: '600' },
  todayCount: { fontSize: 48, fontWeight: '800', marginVertical: 4 },
  todayUnit: { fontSize: 13 },
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16, marginBottom: 16 },
  quickBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingBottom: 4, textTransform: 'uppercase' },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 12 },
  entryTime: { fontSize: 14, fontWeight: '500', width: 50 },
  entryCount: { fontSize: 15, fontWeight: '600' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5 },
  historyDate: { fontSize: 14 },
  historyTotal: { fontSize: 14, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10 },
  modeBtnText: { fontSize: 12, fontWeight: '700' },
  runBtn: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  runBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 16, marginBottom: 16 },
  weightInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 18 },
  statsHeader: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 10, borderWidth: 1 },
  calCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  statNum: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 0.5 },
  dayDate: { fontSize: 14, flex: 1 },
  dayVal: { fontSize: 14, fontWeight: '600', width: 60, textAlign: 'right' },
  expandedDay: { marginHorizontal: 4, marginBottom: 8, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  expandedEntry: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 0.5 },
});
