import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, StyleSheet, Alert } from 'react-native';
import { useExerciseStore } from '../store/exerciseStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { useRoute } from '@react-navigation/native';

const WEIGHT_LABELS: Record<number, string> = { 0: 'Без веса', 10: 'Гантели', 100: 'Штанга' };

export function ExerciseDetailScreen() {
  const route = useRoute<any>();
  const { exerciseId } = route.params;
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const exercises = useExerciseStore((s) => s.exercises);
  const logs = useExerciseStore((s) => s.logs);
  const addLog = useExerciseStore((s) => s.addLog);
  const removeLog = useExerciseStore((s) => s.removeLog);

  const exercise = useMemo(() => exercises.find((e) => e.id === exerciseId), [exercises, exerciseId]);
  const exLogs = useMemo(() => logs.filter((l) => l.exerciseId === exerciseId), [logs, exerciseId]);

  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('1');

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayLogs = useMemo(() => exLogs.filter((l) => l.date === today), [exLogs, today]);
  const historyByDate = useMemo(() => {
    const map = new Map<string, typeof exLogs>();
    for (const l of exLogs) {
      const arr = map.get(l.date) || [];
      arr.push(l);
      map.set(l.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [exLogs]);

  const maxWeight = useMemo(() => exLogs.reduce((max, l) => Math.max(max, l.weight), 0), [exLogs]);

  if (!exercise) return <View style={[styles.container, { backgroundColor: c.background }]}><Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Упражнение не найдено</Text></View>;

  const handleAdd = () => {
    const w = parseFloat(weight.replace(',', '.')) || 0;
    const r = parseInt(reps) || 0;
    const s = parseInt(sets) || 1;
    if (exercise.weightType !== 0 && w <= 0) return;
    if (r <= 0) return;
    addLog(exerciseId, w, r, s);
    setWeight('');
    setReps('');
    setSets('1');
  };

  // Extract time from createdAt (YYYY-MM-DD HH:MM:SS -> HH:MM)
  const logTime = (log: typeof exLogs[0]) => {
    if (log.createdAt && log.createdAt.includes(' ')) {
      return log.createdAt.split(' ')[1]?.slice(0, 5) || '';
    }
    return '';
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={styles.header}>
        {(exercise.imageBase64 || exercise.imageUri) ? (
          <Image source={{ uri: exercise.imageBase64 || exercise.imageUri! }} style={styles.headerImg} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.exName, { color: c.text }]}>{exercise.name}</Text>
          {exercise.tag && <Text style={[styles.exTag, { color: c.primary }]}>{exercise.tag}</Text>}
          {maxWeight > 0 && <Text style={[styles.maxWeight, { color: c.primary }]}>Макс: {maxWeight} кг</Text>}
        </View>
      </View>

      {/* Description */}
      {exercise.description ? (
        <View style={[styles.descBlock, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.descText, { color: c.textSecondary }]}>{exercise.description}</Text>
        </View>
      ) : null}

      {/* Log form */}
      <View style={[styles.logForm, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.logRow}>
          {exercise.weightType !== 0 && (
            <TextInput
              style={[styles.logInput, { color: c.text, borderColor: c.border }]}
              value={weight}
              onChangeText={setWeight}
              placeholder="Вес"
              placeholderTextColor={c.textSecondary}
              keyboardType="decimal-pad"
            />
          )}
          <TextInput
            style={[styles.logInput, { color: c.text, borderColor: c.border }]}
            value={reps}
            onChangeText={setReps}
            placeholder="Повт."
            placeholderTextColor={c.textSecondary}
            keyboardType="number-pad"
          />
          <TextInput
            style={[styles.logInput, { color: c.text, borderColor: c.border, width: 50 }]}
            value={sets}
            onChangeText={setSets}
            placeholder="Подх."
            placeholderTextColor={c.textSecondary}
            keyboardType="number-pad"
          />
          <TouchableOpacity style={[styles.logBtn, { backgroundColor: c.primary }]} onPress={handleAdd}>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Today */}
      {todayLogs.length > 0 && (
        <Text style={[styles.section, { color: c.textSecondary }]}>Сегодня</Text>
      )}

      <FlatList
        data={todayLogs}
        keyExtractor={(l) => String(l.id)}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onLongPress={() => Alert.alert('Удалить?', '', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => removeLog(item.id) },
            ])}
            style={[styles.logRow2, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
          >
            <Text style={[styles.logTime, { color: c.textSecondary }]}>{logTime(item)}</Text>
            {item.weight > 0 && <Text style={[styles.logVal, { color: c.text }]}>{item.weight} кг</Text>}
            <Text style={[styles.logVal, { color: c.text }]}>{item.reps} повт.</Text>
            <Text style={[styles.logVal, { color: c.textSecondary }]}>×{item.setNum}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListFooterComponent={
          historyByDate.length > (todayLogs.length > 0 ? 1 : 0) ? (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.section, { color: c.textSecondary }]}>История</Text>
              {historyByDate.filter(([date]) => date !== today).slice(0, 14).map(([date, dayLogs]) => (
                <View key={date} style={[styles.histDay, { borderColor: c.border }]}>
                  <Text style={[styles.histDate, { color: c.text }]}>{date}</Text>
                  {dayLogs.map((l) => (
                    <Text key={l.id} style={[styles.histEntry, { color: c.textSecondary }]}>
                      {l.weight > 0 ? `${l.weight}кг ` : ''}{l.reps}×{l.setNum}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  headerImg: { width: 64, height: 64, borderRadius: 10 },
  exName: { fontSize: 20, fontWeight: '800' },
  exTag: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  maxWeight: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  descBlock: { marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 8, borderWidth: 0.5 },
  descText: { fontSize: 13, lineHeight: 18 },
  logForm: { marginHorizontal: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlign: 'center' },
  logBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, textTransform: 'uppercase' },
  logRow2: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 12 },
  logTime: { fontSize: 13, width: 45 },
  logVal: { fontSize: 14, fontWeight: '600' },
  histDay: { paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 0.5 },
  histDate: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  histEntry: { fontSize: 13 },
});
