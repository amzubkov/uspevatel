import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSportStore, SportEntry } from '../store/sportStore';
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
    <View style={[styles.container, { backgroundColor: c.background }]}>
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

function PullUpsTab() {
  return <ExerciseTab type="pullups" unit="подт." quickCounts={[1, 2, 3, 5, 10]} />;
}

function AbsTab() {
  return <ExerciseTab type="abs" unit="раз" quickCounts={[1, 5, 10, 20]} />;
}

function TricepsTab() {
  return <ExerciseTab type="triceps" unit="раз" quickCounts={[1, 5, 10, 20]} />;
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

// ─── Run tab ───
const RUN_OPTIONS = [
  { label: '⚽ Футбол', value: 'football' },
  { label: '5 км', value: '5km' },
  { label: '10 км', value: '10km' },
  { label: '20 км', value: '20km' },
];

function RunTab() {
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
    <View style={[styles.container, { backgroundColor: c.background }]}>
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

// ─── Stats tab ───
function StatsTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const entries = useSportStore((s) => s.entries);
  const today = useTodayStr();

  const todayPullUps = useMemo(() => entries.filter((e) => e.type === 'pullups' && e.date === today).reduce((s, e) => s + e.count, 0), [entries, today]);
  const todayAbs = useMemo(() => entries.filter((e) => e.type === 'abs' && e.date === today).reduce((s, e) => s + e.count, 0), [entries, today]);
  const todayTriceps = useMemo(() => entries.filter((e) => e.type === 'triceps' && e.date === today).reduce((s, e) => s + e.count, 0), [entries, today]);
  const todayRuns = useMemo(() => entries.filter((e) => e.type === 'run' && e.date === today).length, [entries, today]);

  // Last 7 days
  const last7 = useMemo(() => {
    const days: { date: string; pullups: number; abs: number; triceps: number; runs: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const pullups = entries.filter((e) => e.type === 'pullups' && e.date === ds).reduce((s, e) => s + e.count, 0);
      const abs = entries.filter((e) => e.type === 'abs' && e.date === ds).reduce((s, e) => s + e.count, 0);
      const triceps = entries.filter((e) => e.type === 'triceps' && e.date === ds).reduce((s, e) => s + e.count, 0);
      const runs = entries.filter((e) => e.type === 'run' && e.date === ds).length;
      days.push({ date: ds, pullups, abs, triceps, runs });
    }
    return days;
  }, [entries]);

  const weekPullUps = last7.reduce((s, d) => s + d.pullups, 0);
  const weekAbs = last7.reduce((s, d) => s + d.abs, 0);
  const weekTriceps = last7.reduce((s, d) => s + d.triceps, 0);
  const weekRuns = last7.reduce((s, d) => s + d.runs, 0);

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

      <Text style={[styles.statsHeader, { color: c.text, marginTop: 16 }]}>Последние 7 дней</Text>
      {last7.map((day) => (
        <View key={day.date} style={[styles.dayRow, { borderColor: c.border }]}>
          <Text style={[styles.dayDate, { color: c.text }]}>{day.date}</Text>
          <Text style={[styles.dayVal, { color: c.primary }]}>{day.pullups} подт.</Text>
          <Text style={[styles.dayVal, { color: c.primary }]}>{day.abs} пр.</Text>
          <Text style={[styles.dayVal, { color: c.primary }]}>{day.triceps} тр.</Text>
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
        name="PullUps"
        component={PullUpsTab}
        options={{
          title: 'Подтягивания',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>🏋️</Text>,
        }}
      />
      <SportTab.Screen
        name="Abs"
        component={AbsTab}
        options={{
          title: 'Пресс',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>🔥</Text>,
        }}
      />
      <SportTab.Screen
        name="Triceps"
        component={TricepsTab}
        options={{
          title: 'Трицепс',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>💪</Text>,
        }}
      />
      <SportTab.Screen
        name="Run"
        component={RunTab}
        options={{
          title: 'Бег',
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>🏃</Text>,
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
  runBtn: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  runBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 16, marginBottom: 16 },
  weightInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 18 },
  statsHeader: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 10, borderWidth: 1 },
  statNum: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 0.5 },
  dayDate: { fontSize: 14, flex: 1 },
  dayVal: { fontSize: 14, fontWeight: '600', width: 80, textAlign: 'right' },
});
