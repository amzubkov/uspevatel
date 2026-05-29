import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSportStore, SportEntry } from '../store/sportStore';
import { useExerciseStore, Exercise, WorkoutLog } from '../store/exerciseStore';
import { ExercisesScreen } from './ExercisesScreen';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { calcDailyEntryKcal as utilCalcCalories, calcDailyEntriesKcal as utilCalcCaloriesForEntries, exerciseKcal, getBodyWeightAt } from '../utils/calories';

const SportTab = createBottomTabNavigator();

function useTodayStr() {
  return useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
}

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function weekdayOf(d: string): string { return WEEKDAYS_SHORT[new Date(d).getDay()]; }

// ─── Reusable exercise tab ───
function ExerciseTab({ type, unit, quickCounts }: { type: SportEntry['type']; unit: string; quickCounts: number[] }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const entries = useSportStore((s) => s.entries);
  const addEntry = useSportStore((s) => s.addEntry);
  const removeEntry = useSportStore((s) => s.removeEntry);
  const today = useTodayStr();
  const [selectedDate, setSelectedDate] = useState(today);

  // Reset date when switching types
  useEffect(() => { setSelectedDate(today); }, [type]);

  // Run tab also shows football entries (added via ⚽ quick button)
  const includeFootball = type === 'run';
  const matchesType = (e: SportEntry) => e.type === type || (includeFootball && e.type === 'football');

  const dateEntries = useMemo(() => entries.filter((e) => matchesType(e) && e.date === selectedDate), [entries, selectedDate, type]);
  const dateTotal = useMemo(() => dateEntries.filter((e) => e.type === type).reduce((sum, e) => sum + e.count, 0), [dateEntries, type]);

  const groupedByDate = useMemo(() => {
    const filtered = entries.filter(matchesType);
    const map = new Map<string, SportEntry[]>();
    for (const e of filtered) {
      const arr = map.get(e.date) || [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries, type]);

  const entryUnit = (e: SportEntry) => (e.type === 'football' ? 'мин' : unit);
  const entryPrefix = (e: SportEntry) => (e.type === 'football' ? '⚽ ' : '');

  const handleRemove = (entry: SportEntry) => {
    Alert.alert('Удалить?', `${entryPrefix(entry)}${entry.count} ${entryUnit(entry)} в ${entry.time}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(entry.id) },
    ]);
  };

  const changeDate = (offset: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };
  const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const fmtD = (d: string) => { const [,m,day] = d.split('-').map(Number); return `${day} ${MONTHS_SHORT[m-1]}`; };

  return (
    <View style={{ flex: 1 }}>
      {/* Date + counter */}
      <View style={[styles.todayCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <TouchableOpacity
            onPress={() => changeDate(-1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingHorizontal: 18, paddingVertical: 6 }}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>{'‹'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(today)} style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
              {selectedDate === today ? 'Сегодня' : `${fmtD(selectedDate)} ${weekdayOf(selectedDate)}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => changeDate(1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingHorizontal: 18, paddingVertical: 6 }}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>{'›'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.todayCount, { color: c.primary }]}>{dateTotal}</Text>
        <Text style={[styles.todayUnit, { color: c.textSecondary }]}>{unit}</Text>
      </View>

      {/* Quick add buttons */}
      <View style={styles.quickRow}>
        {type === 'run' && (
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: c.primary }]}
            onPress={() => addEntry('football', 90, undefined, selectedDate)}
          >
            <Text style={styles.quickBtnText}>⚽</Text>
          </TouchableOpacity>
        )}
        {quickCounts.map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.quickBtn, { backgroundColor: c.primary }]}
            onPress={() => addEntry(type, n, undefined, selectedDate)}
          >
            <Text style={styles.quickBtnText}>+{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Day entries */}
      {dateEntries.length > 0 && (
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{selectedDate === today ? 'Сегодня' : fmtD(selectedDate)} по подходам</Text>
      )}
      <FlatList
        data={dateEntries}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onLongPress={() => handleRemove(item)}
            style={[styles.entryRow, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
          >
            <Text style={[styles.entryTime, { color: c.textSecondary }]}>{item.time}</Text>
            <Text style={[styles.entryCount, { color: c.text }]}>{entryPrefix(item)}{item.count} {entryUnit(item)}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListFooterComponent={
          groupedByDate.length > 1 ? (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>История</Text>
              {groupedByDate.filter(([date]) => date !== today).slice(0, 14).map(([date, dayEntries]) => {
                const runTotal = dayEntries.filter((e) => e.type === type).reduce((s, e) => s + e.count, 0);
                const footballMin = dayEntries.filter((e) => e.type === 'football').reduce((s, e) => s + e.count, 0);
                const parts: string[] = [];
                if (runTotal > 0) parts.push(`${runTotal} ${unit}`);
                if (footballMin > 0) parts.push(`⚽ ${footballMin} мин`);
                return (
                  <TouchableOpacity
                    key={date}
                    onPress={() => setSelectedDate(date)}
                    onLongPress={() => Alert.alert('Удалить день?', `${date}: ${parts.join(' · ')}`, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Удалить', style: 'destructive', onPress: () => dayEntries.forEach((e) => removeEntry(e.id)) },
                    ])}
                    style={[styles.historyRow, { borderColor: c.border }]}
                  >
                    <Text style={[styles.historyDate, { color: c.text }]}>{date} {weekdayOf(date)}</Text>
                    <Text style={[styles.historyTotal, { color: c.primary }]}>{parts.join(' · ') || '—'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const DAILY_MODES_ROW1 = [
  { key: 'pullups' as const, label: 'Подтяг.', icon: '🏋️', unit: 'подт.', quickCounts: [1, 2, 3, 5, 10] },
  { key: 'abs' as const, label: 'Пресс', icon: '🔥', unit: 'раз', quickCounts: [1, 5, 10, 20] },
  { key: 'triceps' as const, label: 'Трицепс', icon: '💪', unit: 'раз', quickCounts: [1, 5, 10, 20] },
  { key: 'squats' as const, label: 'Присед', icon: '🦵', unit: 'раз', quickCounts: [5, 10, 20, 30] },
];
const DAILY_MODES_ROW2 = [
  { key: 'run' as const, label: 'Бег', icon: '🏃', unit: 'км', quickCounts: [5, 10, 15, 20] },
  { key: 'bike' as const, label: 'Вело', icon: '🚴', unit: 'км', quickCounts: [5, 10, 15, 20, 25, 30] },
  { key: 'swim' as const, label: 'Плавание', icon: '🏊', unit: 'мин', quickCounts: [15, 30, 45, 60] },
  { key: 'water' as const, label: 'Вода', icon: '💧', unit: 'мл', quickCounts: [200, 500] },
];
const DAILY_MODES = [...DAILY_MODES_ROW1, ...DAILY_MODES_ROW2];

function DailyTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [mode, setMode] = useState<'pullups' | 'abs' | 'triceps' | 'squats' | 'football' | 'run' | 'bike' | 'swim' | 'water'>('pullups');
  const current = DAILY_MODES.find((m) => m.key === mode)!;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Mode selector */}
      <View style={styles.modeRow}>
        {DAILY_MODES_ROW1.map((m) => (
          <TouchableOpacity key={m.key}
            style={[styles.modeBtn, { flex: 1, backgroundColor: mode === m.key ? c.primary : c.card, borderColor: c.border, borderWidth: 1 }]}
            onPress={() => setMode(m.key)}>
            <Text style={{ fontSize: 14 }}>{m.icon}</Text>
            <Text style={[styles.modeBtnText, { color: mode === m.key ? '#FFF' : c.text }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.modeRow}>
        {DAILY_MODES_ROW2.map((m) => (
          <TouchableOpacity key={m.key}
            style={[styles.modeBtn, { flex: 1, backgroundColor: mode === m.key ? c.primary : c.card, borderColor: c.border, borderWidth: 1 }]}
            onPress={() => setMode(m.key)}>
            <Text style={{ fontSize: 14 }}>{m.icon}</Text>
            <Text style={[styles.modeBtnText, { color: mode === m.key ? '#FFF' : c.text }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ExerciseTab type={current.key as SportEntry['type']} unit={current.unit} quickCounts={current.quickCounts} />
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
                  <Text style={[styles.historyDate, { color: c.text }]}>{date} {weekdayOf(date)}</Text>
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
            <Text style={[styles.entryTime, { color: c.textSecondary, width: 130 }]}>{item.date} {weekdayOf(item.date)}</Text>
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

const TYPE_LABELS: Record<string, string> = { pullups: 'подтяг.', abs: 'пресс', triceps: 'трицепс', run: 'бег', bike: 'вело', weight: 'вес', water: 'вода' };

// Calorie calc moved to ../utils/calories. Thin aliases for callsite stability.
const calcCalories = utilCalcCalories;
const calcCaloriesForEntries = utilCalcCaloriesForEntries;

function formatEntryLabel(e: SportEntry): string {
  if (e.type === 'run') return RUN_OPTIONS.find((o) => o.value === e.label)?.label || e.label || 'бег';
  if (e.type === 'bike') return `🚴 ${e.count} км`;
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

// ─── Workout quick-entry parser ───
const NUM_PAT = '\\d+(?:[.,]\\d+)?';
const LINE_RE = new RegExp(`^(.+?)\\s+(${NUM_PAT}(?:-${NUM_PAT})*)(?:\\s*\\((${NUM_PAT}(?:-${NUM_PAT})*)\\))?\\s*$`);
const LIST_PREFIX_RE = /^\d+[.)]\s*/;

function matchExerciseExact(name: string, exercises: Exercise[]): Exercise | null {
  const q = name.toLowerCase().trim();
  if (!q) return null;
  let m = exercises.find((e) => e.name.toLowerCase() === q);
  if (m) return m;
  m = exercises.find((e) => e.name.toLowerCase().startsWith(q));
  if (m) return m;
  m = exercises.find((e) => e.name.toLowerCase().includes(q));
  return m || null;
}

function rankExerciseCandidates(name: string, exercises: Exercise[], limit = 3): Exercise[] {
  const q = name.toLowerCase().trim();
  if (!q) return [];
  const scored = exercises.map((e) => {
    const en = e.name.toLowerCase();
    let score = 0;
    if (en === q) score = 100;
    else if (en.startsWith(q)) score = 80;
    else if (q.length >= 3 && q.startsWith(en) && en.length >= 3) score = 70;
    else if (en.includes(q)) score = 50;
    else if (q.length >= 3 && q.includes(en) && en.length >= 3) score = 40;
    else {
      const qWords = q.split(/\s+/).filter(Boolean);
      const eWords = en.split(/\s+/).filter(Boolean);
      let matches = 0;
      for (const qw of qWords) {
        if (qw.length < 2) continue;
        if (eWords.some((ew) => ew.startsWith(qw) || qw.startsWith(ew))) matches++;
      }
      if (matches > 0) score = 20 + matches * 5;
    }
    return { ex: e, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.ex);
}

type DailyType = SportEntry['type'];

const DAILY_ALIASES: { type: DailyType; patterns: string[]; label: string; unit: string; isBodyweight: boolean }[] = [
  { type: 'pullups', patterns: ['подтягивания', 'подтяг', 'подтяг.'], label: 'Подтягивания', unit: 'повт.', isBodyweight: true },
  { type: 'abs', patterns: ['пресс'], label: 'Пресс', unit: 'повт.', isBodyweight: true },
  { type: 'triceps', patterns: ['трицепс'], label: 'Трицепс', unit: 'повт.', isBodyweight: true },
  { type: 'squats', patterns: ['присед', 'приседания'], label: 'Приседания', unit: 'повт.', isBodyweight: true },
  { type: 'football', patterns: ['футбол'], label: 'Футбол', unit: 'мин', isBodyweight: false },
  { type: 'run', patterns: ['бег'], label: 'Бег', unit: 'км', isBodyweight: false },
  { type: 'bike', patterns: ['вело', 'велосипед'], label: 'Вело', unit: 'км', isBodyweight: false },
  { type: 'swim', patterns: ['плавание'], label: 'Плавание', unit: 'мин', isBodyweight: false },
  { type: 'water', patterns: ['вода'], label: 'Вода', unit: 'мл', isBodyweight: false },
];

const BODYWEIGHT_DAILY_TYPES: DailyType[] = ['pullups', 'abs', 'triceps', 'squats'];

function getDailyAlias(type: DailyType) {
  return DAILY_ALIASES.find((a) => a.type === type);
}

function matchDailyType(name: string): DailyType | null {
  const q = name.toLowerCase().trim();
  if (!q) return null;
  for (const alias of DAILY_ALIASES) {
    for (const p of alias.patterns) {
      if (q === p) return alias.type;
    }
  }
  for (const alias of DAILY_ALIASES) {
    for (const p of alias.patterns) {
      if (q.startsWith(p) && (q.length === p.length || q[p.length] === ' ')) return alias.type;
    }
  }
  return null;
}

interface ParsedLine {
  lineIdx: number;
  raw: string;
  name: string;
  nums: number[];
  reps: number[];
  hasNumbers: boolean;
  matched: Exercise | null;
  matchedDaily: DailyType | null;
  candidates: Exercise[];
}

function parseLine(rawLine: string, lineIdx: number, exercises: Exercise[]): ParsedLine | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(LIST_PREFIX_RE, '').trim();
  if (!cleaned) return null;
  const m = cleaned.match(LINE_RE);
  let name: string;
  let nums: number[] = [];
  let reps: number[] = [];
  let hasNumbers = false;
  if (m) {
    name = m[1].trim();
    nums = m[2].split('-').map((s) => parseFloat(s.replace(',', '.'))).filter((n) => !isNaN(n));
    if (m[3]) reps = m[3].split('-').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
    hasNumbers = nums.length > 0;
  } else {
    name = cleaned;
  }
  // Daily aliases take priority — short fixed names that map to Daily counters
  const matchedDaily = matchDailyType(name);
  if (matchedDaily) {
    return { lineIdx, raw: trimmed, name, nums, reps, hasNumbers, matched: null, matchedDaily, candidates: [] };
  }
  const matched = matchExerciseExact(name, exercises);
  const candidates = matched ? [] : rankExerciseCandidates(name, exercises);
  return { lineIdx, raw: trimmed, name, nums, reps, hasNumbers, matched, matchedDaily: null, candidates };
}

function getLastReps(exId: number, logs: WorkoutLog[]): number {
  const last = logs.find((l) => l.exerciseId === exId);
  return last?.reps || 10;
}

interface SetEntry { weight: number; reps: number }

function buildSets(parsed: ParsedLine, defaultReps: number): SetEntry[] {
  if (!parsed.matched || !parsed.hasNumbers) return [];
  if (parsed.matched.weightType === 0) {
    return parsed.nums.map((n) => ({ weight: 0, reps: Math.round(n) }));
  }
  return parsed.nums.map((w, i) => {
    const r = parsed.reps[i] ?? parsed.reps[parsed.reps.length - 1] ?? defaultReps;
    return { weight: w, reps: r };
  });
}

function groupSets(sets: SetEntry[]): { weight: number; reps: number; count: number }[] {
  const groups: { weight: number; reps: number; count: number }[] = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.weight === s.weight && last.reps === s.reps) last.count++;
    else groups.push({ ...s, count: 1 });
  }
  return groups;
}

function formatGroupedCounts(nums: number[]): string {
  if (nums.length === 0) return '';
  const groups: { val: number; count: number }[] = [];
  for (const n of nums) {
    const last = groups[groups.length - 1];
    if (last && last.val === n) last.count++;
    else groups.push({ val: n, count: 1 });
  }
  return groups.map((g) => (g.count > 1 ? `${g.val}×${g.count}` : `${g.val}`)).join(' / ');
}

function formatDailyLabel(matchedDaily: DailyType, nums: number[]): string {
  if (nums.length === 0) return '';
  const alias = getDailyAlias(matchedDaily);
  if (!alias) return '';
  return `${formatGroupedCounts(nums)} ${alias.unit}`;
}

function formatSetsLabel(sets: SetEntry[], weightType: number): string {
  if (sets.length === 0) return '';
  const grouped = groupSets(sets);
  if (weightType === 0) {
    return grouped.map((g) => (g.count > 1 ? `${g.reps}×${g.count}` : `${g.reps}`)).join(' / ') + ' повт.';
  }
  const allSameReps = sets.every((s) => s.reps === sets[0].reps);
  const weightsPart = grouped.map((g) => (g.count > 1 ? `${g.weight}кг×${g.count}` : `${g.weight}кг`)).join(' / ');
  if (allSameReps) return `${weightsPart} (${sets[0].reps} повт.)`;
  const repsPart = sets.map((s) => s.reps).join('/');
  return `${weightsPart} (${repsPart})`;
}

function replaceLineExercise(text: string, lineIdx: number, exercise: Exercise): string {
  const lines = text.split('\n');
  if (lineIdx < 0 || lineIdx >= lines.length) return text;
  const oldLine = lines[lineIdx];
  const trailingSpaces = oldLine.match(/\s*$/)?.[0] || '';
  const trimmed = oldLine.trim();
  const listPrefix = trimmed.match(LIST_PREFIX_RE)?.[0] || '';
  const stripped = trimmed.replace(LIST_PREFIX_RE, '');
  const m = stripped.match(LINE_RE);
  let rebuilt: string;
  if (m) {
    const numsPart = m[2];
    const repsPart = m[3] ? `(${m[3]})` : '';
    rebuilt = `${listPrefix}${exercise.name} ${numsPart}${repsPart ? ' ' + repsPart : ''}`;
  } else {
    rebuilt = `${listPrefix}${exercise.name}`;
  }
  lines[lineIdx] = rebuilt + trailingSpaces;
  return lines.join('\n');
}

// ─── Workout tab (quick entry + stats) ───
function WorkoutTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const exercises = useExerciseStore((s) => s.exercises);
  const exLogs = useExerciseStore((s) => s.logs);
  const addLog = useExerciseStore((s) => s.addLog);
  const entries = useSportStore((s) => s.entries);
  const addEntry = useSportStore((s) => s.addEntry);
  const updateEntry = useSportStore((s) => s.updateEntry);
  const removeEntry = useSportStore((s) => s.removeEntry);
  const removeLog = useExerciseStore((s) => s.removeLog);
  const updateLog = useExerciseStore((s) => s.updateLog);
  const today = useTodayStr();
  const [text, setText] = useState('');
  const [editTarget, setEditTarget] = useState<
    | { kind: 'gym'; date: string; exId: number }
    | { kind: 'daily'; date: string; type: DailyType }
    | null
  >(null);
  const [inlineEditLog, setInlineEditLog] = useState<{ id: number; weight: string; reps: string; setNum: string } | null>(null);
  const [inlineEditEntry, setInlineEditEntry] = useState<{ id: string; count: string } | null>(null);

  // Weight entries sorted desc by date (and time)
  const weightEntries = useMemo(
    () => entries.filter((e) => e.type === 'weight').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [entries]
  );
  const lastWeight = weightEntries[0]?.count ?? 90;
  const weightAtDate = (date: string): number => {
    const at = weightEntries.find((w) => w.date <= date);
    if (at) return at.count;
    const earliest = weightEntries[weightEntries.length - 1];
    return earliest?.count ?? 90;
  };

  const parsedLines = useMemo(() => {
    const lines = text.split('\n');
    const result: ParsedLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const p = parseLine(lines[i], i, exercises);
      if (p) result.push(p);
    }
    return result;
  }, [text, exercises]);

  const matchedReady = useMemo(
    () => parsedLines.filter((p) => (p.matched || p.matchedDaily) && p.hasNumbers),
    [parsedLines]
  );

  const handlePickCandidate = (lineIdx: number, ex: Exercise) => {
    setText((prev) => replaceLineExercise(prev, lineIdx, ex));
  };

  const handleSave = async () => {
    if (matchedReady.length === 0) return;
    let totalSets = 0;
    for (const p of matchedReady) {
      if (p.matched) {
        const defReps = getLastReps(p.matched.id, exLogs);
        const sets = buildSets(p, defReps);
        const grouped = groupSets(sets);
        for (const g of grouped) {
          await addLog(p.matched.id, g.weight, g.reps, g.count);
          totalSets += g.count;
        }
      } else if (p.matchedDaily) {
        for (const num of p.nums) {
          await addEntry(p.matchedDaily, Math.round(num), undefined, today);
          totalSets++;
        }
      }
    }
    setText('');
    Alert.alert('Сохранено', `${matchedReady.length} упражн., ${totalSets} подх.`);
  };

  // Today's gym logs grouped by exercise
  const todayGymByEx = useMemo(() => {
    const todayLogs = exLogs.filter((l) => l.date === today);
    const map = new Map<number, WorkoutLog[]>();
    for (const l of todayLogs) {
      const arr = map.get(l.exerciseId) || [];
      arr.push(l);
      map.set(l.exerciseId, arr);
    }
    return Array.from(map.entries()).map(([exId, logs]) => ({
      exercise: exercises.find((e) => e.id === exId),
      logs: logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    })).filter((g) => g.exercise);
  }, [exLogs, exercises, today]);

  const todayExCal = useMemo(() => {
    const todayLogs = exLogs.filter((l) => l.date === today);
    let cal = 0;
    for (const l of todayLogs) {
      const ex = exercises.find((e) => e.id === l.exerciseId);
      if (ex) cal += exerciseKcal(ex, l.reps * l.setNum, lastWeight);
    }
    return Math.round(cal);
  }, [exLogs, exercises, today, lastWeight]);

  const todayDailyEntries = useMemo(() => entries.filter((e) => e.date === today && e.type !== 'weight'), [entries, today]);
  const todayDailyCal = useMemo(() => calcCaloriesForEntries(todayDailyEntries, lastWeight), [todayDailyEntries, lastWeight]);
  const todayCal = todayDailyCal + todayExCal;

  // All days with any activity (sorted desc)
  const allDays = useMemo(() => {
    const logsByDate = new Map<string, WorkoutLog[]>();
    for (const l of exLogs) {
      const arr = logsByDate.get(l.date) || [];
      arr.push(l);
      logsByDate.set(l.date, arr);
    }
    const dailyByDate = new Map<string, SportEntry[]>();
    for (const e of entries) {
      if (e.type === 'weight') continue;
      const arr = dailyByDate.get(e.date) || [];
      arr.push(e);
      dailyByDate.set(e.date, arr);
    }
    const dateSet = new Set<string>([...logsByDate.keys(), ...dailyByDate.keys()]);
    const days = Array.from(dateSet).map((ds) => {
      const dayLogs = logsByDate.get(ds) || [];
      const dayDaily = dailyByDate.get(ds) || [];
      const exIds = new Set(dayLogs.map((l) => l.exerciseId));
      const dailyTypes = new Set(dayDaily.map((e) => e.type));
      const exerciseCount = exIds.size + dailyTypes.size;
      const gymSets = dayLogs.reduce((s, l) => s + l.setNum, 0);
      const dailySets = dayDaily.length;
      const sets = gymSets + dailySets;
      const gymVolume = dayLogs.reduce((s, l) => s + l.weight * l.reps * l.setNum, 0);
      const dayWeight = weightAtDate(ds);
      const dailyVolume = dayDaily
        .filter((e) => BODYWEIGHT_DAILY_TYPES.includes(e.type))
        .reduce((s, e) => s + dayWeight * e.count, 0);
      const volume = gymVolume + dailyVolume;
      let exCal = 0;
      for (const l of dayLogs) {
        const ex = exercises.find((e) => e.id === l.exerciseId);
        if (ex) exCal += exerciseKcal(ex, l.reps * l.setNum, dayWeight);
      }
      const cal = Math.round(exCal + calcCaloriesForEntries(dayDaily, dayWeight));
      return { date: ds, exerciseCount, sets, volume, cal, logs: dayLogs, daily: dayDaily };
    });
    return days.sort((a, b) => b.date.localeCompare(a.date));
  }, [exLogs, exercises, entries, weightEntries]);

  const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const currentYear = new Date().getFullYear();
  const fmtD = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return y !== currentYear ? `${day} ${MONTHS_SHORT[m-1]} ${y}` : `${day} ${MONTHS_SHORT[m-1]}`;
  };

  const totalLines = text.split('\n').filter((l) => l.trim()).length;
  const unmatched = parsedLines.filter((p) => !p.matched && !p.matchedDaily);

  // Edit modal data
  const editLogs: WorkoutLog[] = editTarget?.kind === 'gym'
    ? exLogs.filter((l) => l.date === editTarget.date && l.exerciseId === editTarget.exId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];
  const editEntries: SportEntry[] = editTarget?.kind === 'daily'
    ? entries.filter((e) => e.date === editTarget.date && e.type === editTarget.type).sort((a, b) => a.time.localeCompare(b.time))
    : [];
  const editTitle = !editTarget ? '' : editTarget.kind === 'gym'
    ? (exercises.find((e) => e.id === editTarget.exId)?.name || 'Упражнение')
    : (getDailyAlias(editTarget.type)?.label || editTarget.type);
  const editDateLabel = editTarget ? (editTarget.date === today ? 'сегодня' : fmtD(editTarget.date)) : '';

  const startInlineEditLog = (log: WorkoutLog) => {
    setInlineEditEntry(null);
    setInlineEditLog({ id: log.id, weight: String(log.weight), reps: String(log.reps), setNum: String(log.setNum) });
  };

  const saveInlineEditLog = () => {
    if (!inlineEditLog) return;
    const w = parseFloat(inlineEditLog.weight.replace(',', '.'));
    const r = parseInt(inlineEditLog.reps, 10);
    const s = parseInt(inlineEditLog.setNum, 10);
    if (isNaN(r) || r <= 0) return;
    updateLog(inlineEditLog.id, {
      weight: isNaN(w) ? 0 : w,
      reps: r,
      setNum: isNaN(s) || s < 1 ? 1 : s,
    });
    setInlineEditLog(null);
  };

  const startInlineEditEntry = (entry: SportEntry) => {
    setInlineEditLog(null);
    setInlineEditEntry({ id: entry.id, count: String(entry.count) });
  };

  const saveInlineEditEntry = () => {
    if (!inlineEditEntry) return;
    const n = parseFloat(inlineEditEntry.count.replace(',', '.'));
    if (!isNaN(n) && n > 0) updateEntry(inlineEditEntry.id, { count: Math.round(n) });
    setInlineEditEntry(null);
  };

  const confirmDeleteLog = (log: WorkoutLog) => {
    Alert.alert('Удалить подход?', `${log.weight > 0 ? log.weight + 'кг ' : ''}${log.reps} повт ×${log.setNum}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeLog(log.id) },
    ]);
  };

  const confirmDeleteEntry = (entry: SportEntry) => {
    const alias = getDailyAlias(entry.type);
    Alert.alert('Удалить запись?', `${entry.count} ${alias?.unit || ''} в ${entry.time}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(entry.id) },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={[styles.container, { backgroundColor: c.background }]}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Quick entry */}
        <View style={[styles.entryBlock, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.entryTitle, { color: c.text }]}>Быстрый ввод</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>
              {totalLines > 0 ? `${matchedReady.length}/${totalLines} распознано` : `${exercises.length} упр. в базе`}
            </Text>
          </View>
          <TextInput
            style={[styles.entryInput, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
            value={text}
            onChangeText={setText}
            placeholder={'Жим 50-70-70-70\nРазводка 22.5-22.5-22.5\nТрицепс 30-40-40(15-10-10)\nПодтягивания 10-8-6'}
            placeholderTextColor={c.textSecondary}
            multiline
            autoCorrect={false}
            autoCapitalize="sentences"
            textAlignVertical="top"
          />

          {/* Preview */}
          {parsedLines.length > 0 && (
            <View style={{ marginTop: 8, gap: 6 }}>
              {parsedLines.map((p) => {
                const isMatched = !!(p.matched || p.matchedDaily);
                const dailyAlias = p.matchedDaily ? getDailyAlias(p.matchedDaily) : null;
                const displayName = p.matched ? p.matched.name : (dailyAlias ? dailyAlias.label : p.name);
                let setsLabel = '';
                if (p.matched) {
                  const defReps = getLastReps(p.matched.id, exLogs);
                  const sets = buildSets(p, defReps);
                  setsLabel = formatSetsLabel(sets, p.matched.weightType);
                } else if (p.matchedDaily && p.hasNumbers) {
                  setsLabel = formatDailyLabel(p.matchedDaily, p.nums);
                }
                return (
                  <View key={p.lineIdx} style={[styles.previewCard, { borderColor: isMatched ? c.primary : (c.danger || '#FF3B30') }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, color: isMatched ? c.primary : (c.danger || '#FF3B30'), fontWeight: '700' }}>
                        {isMatched ? '✓' : '?'}
                      </Text>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.text }} numberOfLines={1}>
                        {displayName}
                      </Text>
                      {p.matched && p.matched.tag && (
                        <Text style={{ fontSize: 11, color: c.textSecondary }}>{p.matched.tag}</Text>
                      )}
                      {p.matchedDaily && (
                        <Text style={{ fontSize: 11, color: c.textSecondary }}>daily</Text>
                      )}
                    </View>
                    {setsLabel ? (
                      <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 2, marginLeft: 18 }}>{setsLabel}</Text>
                    ) : isMatched && !p.hasNumbers ? (
                      <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2, marginLeft: 18, fontStyle: 'italic' }}>
                        {p.matchedDaily && !getDailyAlias(p.matchedDaily)?.isBodyweight ? 'добавьте минуты' : 'добавьте веса/повторы'}
                      </Text>
                    ) : null}
                    {p.candidates.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 6 }}>
                        {p.candidates.map((cand) => (
                          <TouchableOpacity
                            key={cand.id}
                            style={[styles.candidateChip, { backgroundColor: c.primary }]}
                            onPress={() => handlePickCandidate(p.lineIdx, cand)}
                          >
                            <Text style={styles.candidateChipText}>{cand.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Save */}
          {matchedReady.length > 0 && (
            <TouchableOpacity
              style={[styles.saveWorkoutBtn, { backgroundColor: c.primary }]}
              onPress={handleSave}
            >
              <Text style={styles.saveWorkoutBtnText}>
                Сохранить тренировку ({matchedReady.length} упр.)
              </Text>
            </TouchableOpacity>
          )}

          {unmatched.length > 0 && matchedReady.length === 0 && (
            <Text style={{ fontSize: 11, color: c.textSecondary, marginTop: 8, textAlign: 'center' }}>
              Тапни по подсказке, чтобы выбрать упражнение
            </Text>
          )}
        </View>

        {/* Today's gym log */}
        {todayGymByEx.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.statsHeader, { color: c.text, marginBottom: 6 }]}>Сегодня</Text>
            {todayGymByEx.map(({ exercise, logs }) => (
              <View key={exercise!.id} style={[styles.todayExCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{exercise!.name}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {logs.map((l) => {
                    const w = l.weight > 0 ? `${l.weight}кг` : '';
                    const r = `${l.reps}`;
                    const s = l.setNum > 1 ? `×${l.setNum}` : '';
                    return w ? `${w} ${r}${s}` : `${r}${s}`;
                  }).join(' / ')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Today's daily entries grouped by type */}
        {(() => {
          const todayDaily = todayDailyEntries;
          if (todayDaily.length === 0) return null;
          const byType = new Map<DailyType, SportEntry[]>();
          for (const e of todayDaily) {
            const arr = byType.get(e.type) || [];
            arr.push(e);
            byType.set(e.type, arr);
          }
          return (
            <View style={{ marginTop: todayGymByEx.length > 0 ? 8 : 16 }}>
              {todayGymByEx.length === 0 && (
                <Text style={[styles.statsHeader, { color: c.text, marginBottom: 6 }]}>Сегодня</Text>
              )}
              {Array.from(byType.entries()).map(([type, items]) => {
                const alias = getDailyAlias(type);
                if (!alias) return null;
                const total = items.reduce((s, e) => s + e.count, 0);
                return (
                  <View key={type} style={[styles.todayExCard, { backgroundColor: c.card, borderColor: c.border }]}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{alias.label}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>
                      {formatGroupedCounts(items.map((e) => e.count))} {alias.unit}
                      {items.length > 1 ? ` · всего ${total}` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* All-time history */}
        <Text style={[styles.statsHeader, { color: c.text, marginTop: 16 }]}>История ({allDays.length})</Text>
        {allDays.map((day) => {
          const hasGym = day.logs.length > 0;
          const hasDaily = day.daily.length > 0;
          if (!hasGym && !hasDaily) return null;
          // Group gym logs by exercise (preserving time order)
          const gymByEx = new Map<number, WorkoutLog[]>();
          for (const l of [...day.logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
            const arr = gymByEx.get(l.exerciseId) || [];
            arr.push(l);
            gymByEx.set(l.exerciseId, arr);
          }
          // Group daily entries by type
          const dailyByType = new Map<DailyType, SportEntry[]>();
          for (const e of [...day.daily].sort((a, b) => a.time.localeCompare(b.time))) {
            const arr = dailyByType.get(e.type) || [];
            arr.push(e);
            dailyByType.set(e.type, arr);
          }
          return (
            <View key={day.date}>
              <View style={[styles.dayRow, { borderColor: c.border }]}>
                <Text style={[styles.dayDate, { color: c.text }]}>{day.date === today ? 'сегодня' : `${fmtD(day.date)} ${weekdayOf(day.date)}`}</Text>
                {day.exerciseCount > 0 && <Text style={[styles.dayVal, { color: c.primary }]}>{day.exerciseCount} упр.</Text>}
                {day.sets > 0 && <Text style={[styles.dayVal, { color: c.primary }]}>{day.sets} подх.</Text>}
                {day.cal > 0 && <Text style={[styles.dayVal, { color: '#FF6B35', width: 50 }]}>{day.cal}</Text>}
              </View>
              <View style={[styles.expandedDay, { backgroundColor: c.card, borderColor: c.border }]}>
                {Array.from(gymByEx.entries()).map(([exId, logs]) => {
                  const ex = exercises.find((e) => e.id === exId);
                  if (!ex) return null;
                  const countsLabel = logs.map((l) => {
                    const w = l.weight > 0 ? `${l.weight}кг` : '';
                    const s = l.setNum > 1 ? `×${l.setNum}` : '';
                    return w ? `${w} ${l.reps}${s}` : `${l.reps}${s}`;
                  }).join(' / ');
                  return (
                    <TouchableOpacity
                      key={exId}
                      style={[styles.expandedEntry, { borderColor: c.border }]}
                      onPress={() => setEditTarget({ kind: 'gym', date: day.date, exId })}
                    >
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1, marginRight: 10 }} numberOfLines={2}>{ex.name}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'right' }} numberOfLines={2}>{countsLabel}</Text>
                    </TouchableOpacity>
                  );
                })}
                {Array.from(dailyByType.entries()).map(([type, items]) => {
                  const alias = getDailyAlias(type);
                  if (!alias) return null;
                  const total = items.reduce((s, e) => s + e.count, 0);
                  const grouped = formatGroupedCounts(items.map((e) => e.count));
                  const countsLabel = items.length > 1 ? `${grouped} ${alias.unit} · всего ${total}` : `${grouped} ${alias.unit}`;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.expandedEntry, { borderColor: c.border }]}
                      onPress={() => setEditTarget({ kind: 'daily', date: day.date, type })}
                    >
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1, marginRight: 10 }} numberOfLines={2}>{alias.label}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'right' }} numberOfLines={2}>{countsLabel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={!!editTarget} transparent animationType="slide" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.editOverlay}>
          <View style={[styles.editSheet, { backgroundColor: c.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{editTitle}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{editDateLabel}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={{ padding: 6 }}>
                <Text style={{ color: c.textSecondary, fontSize: 22 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {editTarget?.kind === 'gym' && editLogs.map((log) => {
                const ex = exercises.find((e) => e.id === log.exerciseId);
                const isBw = ex?.weightType === 0;
                const editing = inlineEditLog?.id === log.id;
                if (editing && inlineEditLog) {
                  return (
                    <View key={log.id} style={[styles.editRow, { borderColor: c.border }]}>
                      {!isBw && (
                        <TextInput
                          style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
                          value={inlineEditLog.weight}
                          onChangeText={(v) => setInlineEditLog({ ...inlineEditLog, weight: v })}
                          keyboardType="decimal-pad"
                          placeholder="вес"
                          placeholderTextColor={c.textSecondary}
                          autoFocus
                        />
                      )}
                      <TextInput
                        style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
                        value={inlineEditLog.reps}
                        onChangeText={(v) => setInlineEditLog({ ...inlineEditLog, reps: v })}
                        keyboardType="number-pad"
                        placeholder="повт"
                        placeholderTextColor={c.textSecondary}
                        autoFocus={isBw}
                      />
                      <TextInput
                        style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.background, width: 48 }]}
                        value={inlineEditLog.setNum}
                        onChangeText={(v) => setInlineEditLog({ ...inlineEditLog, setNum: v })}
                        keyboardType="number-pad"
                        placeholder="подх"
                        placeholderTextColor={c.textSecondary}
                      />
                      <TouchableOpacity onPress={saveInlineEditLog} style={styles.editIconBtn}>
                        <Text style={{ fontSize: 18, color: c.primary }}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setInlineEditLog(null)} style={styles.editIconBtn}>
                        <Text style={{ fontSize: 18, color: c.textSecondary }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                const labelMain = isBw ? `${log.reps} повт ×${log.setNum}` : `${log.weight}кг · ${log.reps} повт ×${log.setNum}`;
                return (
                  <View key={log.id} style={[styles.editRow, { borderColor: c.border }]}>
                    <Text style={{ flex: 1, color: c.text, fontSize: 14 }}>{labelMain}</Text>
                    <TouchableOpacity onPress={() => startInlineEditLog(log)} style={styles.editIconBtn}>
                      <Text style={{ fontSize: 16 }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDeleteLog(log)} style={styles.editIconBtn}>
                      <Text style={{ fontSize: 16 }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {editTarget?.kind === 'daily' && editEntries.map((entry) => {
                const alias = getDailyAlias(entry.type);
                const editing = inlineEditEntry?.id === entry.id;
                if (editing && inlineEditEntry) {
                  return (
                    <View key={entry.id} style={[styles.editRow, { borderColor: c.border }]}>
                      <Text style={{ color: c.textSecondary, fontSize: 12, width: 50 }}>{entry.time}</Text>
                      <TextInput
                        style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.background, flex: 1 }]}
                        value={inlineEditEntry.count}
                        onChangeText={(v) => setInlineEditEntry({ ...inlineEditEntry, count: v })}
                        keyboardType="decimal-pad"
                        placeholder={alias?.unit || ''}
                        placeholderTextColor={c.textSecondary}
                        autoFocus
                      />
                      <TouchableOpacity onPress={saveInlineEditEntry} style={styles.editIconBtn}>
                        <Text style={{ fontSize: 18, color: c.primary }}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setInlineEditEntry(null)} style={styles.editIconBtn}>
                        <Text style={{ fontSize: 18, color: c.textSecondary }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                return (
                  <View key={entry.id} style={[styles.editRow, { borderColor: c.border }]}>
                    <Text style={{ color: c.textSecondary, fontSize: 12, width: 50 }}>{entry.time}</Text>
                    <Text style={{ flex: 1, color: c.text, fontSize: 14 }}>{entry.count} {alias?.unit || ''}</Text>
                    <TouchableOpacity onPress={() => startInlineEditEntry(entry)} style={styles.editIconBtn}>
                      <Text style={{ fontSize: 16 }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDeleteEntry(entry)} style={styles.editIconBtn}>
                      <Text style={{ fontSize: 16 }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {editTarget?.kind === 'gym' && editLogs.length === 0 && (
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center', padding: 20 }}>Нет подходов</Text>
              )}
              {editTarget?.kind === 'daily' && editEntries.length === 0 && (
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center', padding: 20 }}>Нет записей</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Stats tab ───
function StatsTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const entries = useSportStore((s) => s.entries);
  const updateEntry = useSportStore((s) => s.updateEntry);
  const removeEntry = useSportStore((s) => s.removeEntry);
  const exLogs = useExerciseStore((s) => s.logs);
  const exercises = useExerciseStore((s) => s.exercises);
  const today = useTodayStr();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Последний записанный вес (по умолчанию 80 кг)
  const lastWeight = useMemo(() => {
    const w = entries.find((e) => e.type === 'weight');
    return w ? w.count : 90;
  }, [entries]);

  const todayEntries = useMemo(() => entries.filter((e) => e.date === today && e.type !== 'weight'), [entries, today]);
  const todayPullUps = useMemo(() => todayEntries.filter((e) => e.type === 'pullups').reduce((s, e) => s + e.count, 0), [todayEntries]);
  const todayAbs = useMemo(() => todayEntries.filter((e) => e.type === 'abs').reduce((s, e) => s + e.count, 0), [todayEntries]);
  const todayTriceps = useMemo(() => todayEntries.filter((e) => e.type === 'triceps').reduce((s, e) => s + e.count, 0), [todayEntries]);
  const todayRuns = useMemo(() => todayEntries.filter((e) => e.type === 'run').length, [todayEntries]);
  const todayBikeKm = useMemo(() => todayEntries.filter((e) => e.type === 'bike').reduce((s, e) => s + e.count, 0), [todayEntries]);

  // Calories from exercises (workout_logs)
  const exCalForDate = (date: string) => {
    const dayLogs = exLogs.filter((l) => l.date === date);
    const dayWeight = getBodyWeightAt(entries, date, lastWeight);
    let cal = 0;
    for (const l of dayLogs) {
      const ex = exercises.find((e) => e.id === l.exerciseId);
      if (ex) cal += exerciseKcal(ex, l.reps * l.setNum, dayWeight);
    }
    return Math.round(cal);
  };

  const todayExCal = useMemo(() => exCalForDate(today), [exLogs, exercises, today]);
  const todayCal = useMemo(() => calcCaloriesForEntries(todayEntries, lastWeight) + todayExCal, [todayEntries, lastWeight, todayExCal]);

  // Last 7 days
  const last7 = useMemo(() => {
    const days: { date: string; pullups: number; abs: number; triceps: number; runs: number; bikeKm: number; cal: number; entries: SportEntry[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayEntries = entries.filter((e) => e.date === ds && e.type !== 'weight');
      const pullups = dayEntries.filter((e) => e.type === 'pullups').reduce((s, e) => s + e.count, 0);
      const abs = dayEntries.filter((e) => e.type === 'abs').reduce((s, e) => s + e.count, 0);
      const triceps = dayEntries.filter((e) => e.type === 'triceps').reduce((s, e) => s + e.count, 0);
      const runs = dayEntries.filter((e) => e.type === 'run').length;
      const bikeKm = dayEntries.filter((e) => e.type === 'bike').reduce((s, e) => s + e.count, 0);
      const cal = calcCaloriesForEntries(dayEntries, lastWeight) + exCalForDate(ds);
      days.push({ date: ds, pullups, abs, triceps, runs, bikeKm, cal, entries: dayEntries });
    }
    return days;
  }, [entries, lastWeight, exLogs, exercises]);

  const weekPullUps = last7.reduce((s, d) => s + d.pullups, 0);
  const weekAbs = last7.reduce((s, d) => s + d.abs, 0);
  const weekTriceps = last7.reduce((s, d) => s + d.triceps, 0);
  const weekRuns = last7.reduce((s, d) => s + d.runs, 0);
  const weekBikeKm = last7.reduce((s, d) => s + d.bikeKm, 0);
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
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{todayBikeKm}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>вело км</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{todayExCal}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>упр. kcal</Text>
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
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{weekBikeKm}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>вело км</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNum, { color: c.primary }]}>{last7.reduce((s, d) => s + exCalForDate(d.date), 0)}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>упр. kcal</Text>
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
            <Text style={[styles.dayDate, { color: c.text }]}>{day.date} {weekdayOf(day.date)}</Text>
            <Text style={[styles.dayVal, { color: c.primary }]}>{day.pullups} подт.</Text>
            <Text style={[styles.dayVal, { color: c.primary }]}>{day.abs} пр.</Text>
            <Text style={[styles.dayVal, { color: c.primary }]}>{day.triceps} тр.</Text>
            {day.bikeKm > 0 && <Text style={[styles.dayVal, { color: c.primary }]}>🚴{day.bikeKm}</Text>}
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
        name="SportWorkout"
        component={WorkoutTab}
        options={{
          title: 'Тренировка',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>🏋️</Text>,
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
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16, marginBottom: 16 },
  quickBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingBottom: 4, textTransform: 'uppercase' },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 12 },
  entryTime: { fontSize: 14, fontWeight: '500', width: 50 },
  entryCount: { fontSize: 15, fontWeight: '600' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5 },
  historyDate: { fontSize: 14 },
  historyTotal: { fontSize: 14, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 4, marginBottom: 2 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6, borderRadius: 10 },
  modeBtnText: { fontSize: 11, fontWeight: '700' },
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
  entryBlock: { padding: 12, borderRadius: 12, borderWidth: 1 },
  entryTitle: { fontSize: 15, fontWeight: '700' },
  entryInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, minHeight: 110, lineHeight: 22 },
  previewCard: { padding: 8, borderRadius: 8, borderWidth: 1 },
  candidateChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  candidateChipText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  saveWorkoutBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveWorkoutBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  todayExCard: { padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  editSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 24 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 0.5 },
  editIconBtn: { padding: 6 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, textAlign: 'center' },
});
