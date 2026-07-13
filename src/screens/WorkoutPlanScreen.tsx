import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateStr, shiftDateStr, WEEKDAYS_SUN } from '../utils/date';
import { useExerciseStore, Exercise, loadDayExercises } from '../store/exerciseStore';
import { requestAiPlan, AiPlan } from '../services/aiPlannerService';
import { getSetting, setSetting, getOllamaModel, DEFAULT_MODEL, SUGGESTED_MODELS } from '../services/ollamaClient';
import { ActivityIndicator } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

const WEEKDAYS = WEEKDAYS_SUN;
const shiftDate = shiftDateStr;

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = toDateStr(new Date());
  if (dateStr === today) return 'Сегодня';
  if (dateStr === shiftDate(today, 1)) return 'Завтра';
  if (dateStr === shiftDate(today, -1)) return 'Вчера';
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}, ${WEEKDAYS[dt.getDay()]}`;
}

const splitTags = (raw?: string | null): string[] =>
  (raw || '').split(',').map((t) => t.trim()).filter(Boolean);

export function WorkoutPlanScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const exercises = useExerciseStore((s) => s.exercises);
  const logs = useExerciseStore((s) => s.logs);
  const plan = useExerciseStore((s) => s.plan);
  const addPlanItem = useExerciseStore((s) => s.addPlanItem);
  const removePlanItem = useExerciseStore((s) => s.removePlanItem);
  const movePlanItem = useExerciseStore((s) => s.movePlanItem);
  const copyPlanFromDate = useExerciseStore((s) => s.copyPlanFromDate);
  const addProgram = useExerciseStore((s) => s.addProgram);
  const removeProgram = useExerciseStore((s) => s.removeProgram);
  const addDay = useExerciseStore((s) => s.addDay);
  const removeDay = useExerciseStore((s) => s.removeDay);
  const addExerciseToDay = useExerciseStore((s) => s.addExerciseToDay);
  const removeExerciseFromDay = useExerciseStore((s) => s.removeExerciseFromDay);

  const [date, setDate] = useState(toDateStr(new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const [showPrograms, setShowPrograms] = useState(false);
  const [showCopyPicker, setShowCopyPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [pickerTag, setPickerTag] = useState<string | null>(null);
  // picker destination: today's plan or a program day being edited
  const [pickerTargetDay, setPickerTargetDay] = useState<number | null>(null);
  // when set, picking an exercise replaces this plan item instead of adding
  const [replaceItem, setReplaceItem] = useState<{ planId: number; name: string; sets?: number; reps?: number } | null>(null);
  const [newProgName, setNewProgName] = useState('');
  const [addDayFor, setAddDayFor] = useState<number | null>(null);
  const [newDayName, setNewDayName] = useState('');
  const [editDayId, setEditDayId] = useState<number | null>(null);
  const [editDayExs, setEditDayExs] = useState<Exercise[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null);
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [aiModel, setAiModel] = useState(DEFAULT_MODEL);
  const [aiGoal, setAiGoal] = useState('ОФП');
  const [aiNotes, setAiNotes] = useState('');

  const runAiPlan = async (minutes: number) => {
    setShowAiSetup(false);
    setAiLoading(true);
    try {
      await setSetting('ollamaModel', aiModel.trim() || DEFAULT_MODEL);
      await setSetting('aiGoal', aiGoal);
      await setSetting('aiRestrictions', aiNotes.trim());
      const plan = await requestAiPlan(date, minutes);
      setAiPlan(plan);
    } catch (e: any) {
      Alert.alert('AI-план', String(e?.message || e));
    }
    setAiLoading(false);
  };

  const handleAiPlan = async () => {
    setAiModel(await getOllamaModel());
    setAiGoal((await getSetting('aiGoal')) || 'ОФП');
    setAiNotes(await getSetting('aiRestrictions'));
    setShowAiSetup(true);
  };

  const acceptAiPlan = async () => {
    if (!aiPlan) return;
    for (const item of aiPlan.items) {
      await addPlanItem(date, item.exerciseId, { sets: item.sets, reps: item.reps, weight: item.weight });
    }
    setAiPlan(null);
  };

  const programs = useExerciseStore((s) => s.programs);
  const days = useExerciseStore((s) => s.days);

  const reloadEditDay = async (dayId: number) => {
    setEditDayExs(await loadDayExercises(dayId));
  };

  const handleCreateProgram = async () => {
    const name = newProgName.trim();
    if (!name) return;
    await addProgram(name);
    setNewProgName('');
  };

  const handleCreateDay = async () => {
    if (addDayFor == null) return;
    const name = newDayName.trim();
    if (!name) return;
    const dayId = await addDay(addDayFor, name);
    setNewDayName('');
    setAddDayFor(null);
    setEditDayId(dayId);
    setEditDayExs([]);
  };

  const handleDayLongPress = (dayId: number, dayName: string | null) => {
    Alert.alert(dayName || 'День', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Состав дня', onPress: async () => { setEditDayId(dayId); await reloadEditDay(dayId); } },
      { text: 'Удалить день', style: 'destructive', onPress: () => removeDay(dayId) },
    ]);
  };

  const handleProgramLongPress = (progId: number, progName: string) => {
    Alert.alert('Удалить программу?', `"${progName}" со всеми днями`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeProgram(progId) },
    ]);
  };

  const handleAddDay = async (dayId: number, dayName: string | null) => {
    const dayExs = await loadDayExercises(dayId);
    if (dayExs.length === 0) { Alert.alert('Пустой день', 'В этом дне программы нет упражнений'); return; }
    let added = 0;
    const before = new Set(useExerciseStore.getState().plan.filter((p) => p.date === date).map((p) => p.exerciseId));
    for (const ex of dayExs) {
      if (!before.has(ex.id)) { await addPlanItem(date, ex.id); added++; }
    }
    setShowPrograms(false);
    Alert.alert('Добавлено в план', `${dayName || 'День'}: ${added} упражн. на ${fmtDate(date).toLowerCase()}`);
  };

  const dayPlan = useMemo(
    () => plan.filter((p) => p.date === date).sort((a, b) => a.orderNum - b.orderNum || a.id - b.id),
    [plan, date],
  );

  // Exercise is "done" when it has logged sets on the plan's date
  const dayLogsByEx = useMemo(() => {
    const m = new Map<number, { sets: number; detail: string }>();
    for (const l of logs) {
      if (l.date !== date) continue;
      const cur = m.get(l.exerciseId) || { sets: 0, detail: '' };
      cur.sets += l.setNum;
      cur.detail += (cur.detail ? ', ' : '') + `${l.weight % 1 ? l.weight : Math.round(l.weight)}×${l.reps}`;
      m.set(l.exerciseId, cur);
    }
    return m;
  }, [logs, date]);

  // Most recent past performance per exercise: "last time you did 3×8 @ 70"
  const lastDoneByEx = useMemo(() => {
    const m = new Map<number, { date: string; detail: string }>();
    for (const l of logs) {
      if (l.date >= date) continue;
      const cur = m.get(l.exerciseId);
      if (cur && cur.date !== l.date) continue; // logs are date-desc, keep newest date only
      const next = cur || { date: l.date, detail: '' };
      next.detail += (next.detail ? ', ' : '') + `${l.weight % 1 ? l.weight : Math.round(l.weight)}×${l.reps}`;
      m.set(l.exerciseId, next);
    }
    return m;
  }, [logs, date]);

  const doneCount = dayPlan.filter((p) => dayLogsByEx.has(p.exerciseId)).length;

  // Last workout date before the selected one (for copy)
  const prevWorkoutDate = useMemo(() => {
    let best = '';
    for (const l of logs) if (l.date < date && l.date > best) best = l.date;
    for (const p of plan) if (p.date < date && p.date > best) best = p.date;
    return best || null;
  }, [logs, plan, date]);

  // Past workout days with a short preview (planned exercises, or logged if no plan existed)
  const pastWorkoutDays = useMemo(() => {
    const planned = new Map<string, number[]>();
    for (const p of plan) {
      if (p.date >= date) continue;
      const arr = planned.get(p.date) || [];
      arr.push(p.exerciseId);
      planned.set(p.date, arr);
    }
    const logged = new Map<string, Set<number>>();
    for (const l of logs) {
      if (l.date >= date || planned.has(l.date)) continue;
      const s = logged.get(l.date) || new Set<number>();
      s.add(l.exerciseId);
      logged.set(l.date, s);
    }
    const days: { date: string; names: string[] }[] = [];
    const nameOf = (id: number) => exercises.find((e) => e.id === id)?.name || `#${id}`;
    for (const [d, ids] of planned) days.push({ date: d, names: ids.map(nameOf) });
    for (const [d, ids] of logged) days.push({ date: d, names: Array.from(ids).map(nameOf) });
    return days.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
  }, [plan, logs, exercises, date]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const ex of exercises) for (const t of splitTags(ex.tag)) tags.add(t);
    return Array.from(tags).sort();
  }, [exercises]);

  const pickerList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const plannedIds = pickerTargetDay != null
      ? new Set(editDayExs.map((e) => e.id))
      : new Set(dayPlan.map((p) => p.exerciseId));
    return exercises.filter((e) => {
      if (plannedIds.has(e.id)) return false;
      const tags = splitTags(e.tag);
      if (pickerTag && !tags.includes(pickerTag)) return false;
      if (q && !e.name.toLowerCase().includes(q) && !tags.some((t) => t.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [exercises, dayPlan, search, pickerTag, pickerTargetDay, editDayExs]);

  const handleCopyPrev = async () => {
    if (!prevWorkoutDate) return;
    const added = await copyPlanFromDate(prevWorkoutDate, date);
    if (added === 0) Alert.alert('Нечего копировать', 'Все упражнения уже в плане');
  };

  const handleCopyFrom = async (srcDate: string) => {
    setShowCopyPicker(false);
    const added = await copyPlanFromDate(srcDate, date);
    if (added === 0) Alert.alert('Нечего копировать', 'Все упражнения уже в плане');
  };

  const handleRemove = (item: { id: number; sets?: number; reps?: number }, ex: Exercise) => {
    Alert.alert(ex.name, undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Заменить',
        onPress: () => {
          setReplaceItem({ planId: item.id, name: ex.name, sets: item.sets, reps: item.reps });
          setPickerTag(splitTags(ex.tag)[0] || null);
          setShowPicker(true);
        },
      },
      { text: 'Убрать', style: 'destructive', onPress: () => removePlanItem(item.id) },
    ]);
  };

  const handleReplacePick = async (newExerciseId: number) => {
    if (!replaceItem) return;
    await removePlanItem(replaceItem.planId);
    await addPlanItem(date, newExerciseId, { sets: replaceItem.sets, reps: replaceItem.reps });
    setReplaceItem(null);
    setShowPicker(false);
    setSearch('');
    setPickerTag(null);
  };

  const renderItem = ({ item, index }: { item: { id: number; exerciseId: number; sets?: number; reps?: number; weight?: number }; index: number }) => {
    const ex = exercises.find((e) => e.id === item.exerciseId);
    if (!ex) return null;
    const done = dayLogsByEx.get(ex.id);
    const last = lastDoneByEx.get(ex.id);
    const target = item.sets && item.reps
      ? `цель: ${item.sets}×${item.reps}${item.weight ? ` @ ${item.weight % 1 ? item.weight : Math.round(item.weight)}` : ''}`
      : null;
    return (
      <TouchableOpacity
        style={[styles.exRow, { backgroundColor: c.card, borderColor: done ? '#22C55E' : c.border }]}
        onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: ex.id })}
        onLongPress={() => handleRemove(item, ex)}
      >
        {(ex.imageBase64 || ex.imageUri) ? (
          <Image source={{ uri: ex.imageBase64 || ex.imageUri! }} style={styles.exImage} />
        ) : (
          <View style={[styles.exImagePlaceholder, { backgroundColor: c.border }]}>
            <Text style={{ fontSize: 20 }}>🏋️</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.exName, { color: c.text }]} numberOfLines={1}>{ex.name}</Text>
          {done ? (
            <Text style={{ color: '#22C55E', fontSize: 12, marginTop: 2 }} numberOfLines={1}>✓ {done.detail}</Text>
          ) : target ? (
            <Text style={{ color: '#0EA5E9', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{target}</Text>
          ) : last ? (
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              прошлый раз: {last.detail}
            </Text>
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>ещё не делали</Text>
          )}
        </View>
        <Text style={{ fontSize: 22 }}>{done ? '✅' : '⬜'}</Text>
        {dayPlan.length > 1 && (
          <View style={{ gap: 2 }}>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}
              disabled={index === 0}
              onPress={() => movePlanItem(item.id, -1)}
            >
              <Text style={{ fontSize: 16, color: index === 0 ? c.border : c.textSecondary }}>▲</Text>
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={{ top: 4, bottom: 8, left: 8, right: 8 }}
              disabled={index === dayPlan.length - 1}
              onPress={() => movePlanItem(item.id, 1)}
            >
              <Text style={{ fontSize: 16, color: index === dayPlan.length - 1 ? c.border : c.textSecondary }}>▼</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Date navigation */}
      <View style={styles.dateRow}>
        <TouchableOpacity onPress={() => setDate(shiftDate(date, -1))} style={styles.dateArrow}>
          <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDate(toDateStr(new Date()))}>
          <Text style={[styles.dateText, { color: c.text }]}>{fmtDate(date)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDate(shiftDate(date, 1))} style={styles.dateArrow}>
          <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>›</Text>
        </TouchableOpacity>
      </View>

      {dayPlan.length > 0 && (
        <Text style={[styles.progress, { color: doneCount === dayPlan.length ? '#22C55E' : c.textSecondary }]}>
          {doneCount === dayPlan.length ? '🏆 Всё сделано!' : `Выполнено ${doneCount} из ${dayPlan.length}`}
        </Text>
      )}

      <FlatList
        data={dayPlan}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        contentContainerStyle={dayPlan.length === 0 ? styles.emptyContainer : { padding: 12, gap: 8, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>📝</Text>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>План пуст</Text>
            {prevWorkoutDate && (
              <TouchableOpacity style={[styles.copyBtn, { borderColor: c.primary }]} onPress={handleCopyPrev}>
                <Text style={{ color: c.primary, fontWeight: '600', fontSize: 14 }}>
                  Скопировать тренировку от {fmtDate(prevWorkoutDate)}
                </Text>
              </TouchableOpacity>
            )}
            {pastWorkoutDays.length > 0 && (
              <TouchableOpacity style={[styles.copyBtn, { borderColor: c.border }]} onPress={() => setShowCopyPicker(true)}>
                <Text style={{ color: c.textSecondary, fontWeight: '600', fontSize: 14 }}>
                  Выбрать день для копирования…
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <View style={styles.fabRow}>
        <TouchableOpacity style={[styles.fab, { backgroundColor: c.primary }]} onPress={() => setShowPicker(true)}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.fabText}>+ Упражн.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fab, { backgroundColor: '#8B5CF6' }]} onPress={() => setShowPrograms(true)}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.fabText}>📚 Прогр.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fab, { backgroundColor: '#0EA5E9' }]} onPress={handleAiPlan} disabled={aiLoading}>
          {aiLoading ? <ActivityIndicator color="#FFF" /> : <Text numberOfLines={1} adjustsFontSizeToFit style={styles.fabText}>🤖 AI-план</Text>}
        </TouchableOpacity>
      </View>

      {/* Copy-from-day picker with brief per-day preview */}
      <Modal visible={showCopyPicker} animationType="slide" onRequestClose={() => setShowCopyPicker(false)}>
        <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: c.text }]}>Копировать в план на {fmtDate(date).toLowerCase()}</Text>
            <TouchableOpacity onPress={() => setShowCopyPicker(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={pastWorkoutDays}
            keyExtractor={(d) => d.date}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.dayRow, { backgroundColor: c.card, borderColor: c.border, marginHorizontal: 12 }]}
                onPress={() => handleCopyFrom(item.date)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
                    {fmtDate(item.date)} · {item.names.length} упражн.
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                    {item.names.join(', ')}
                  </Text>
                </View>
                <Text style={{ color: c.primary, fontSize: 22, fontWeight: '600' }}>+</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Прошлых тренировок нет</Text>
            }
          />
        </View>
      </Modal>

      {/* AI plan setup: model, goal, notes, time */}
      <Modal visible={showAiSetup} animationType="slide" onRequestClose={() => setShowAiSetup(false)}>
        <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: c.text }]}>🤖 AI-план на {fmtDate(date).toLowerCase()}</Text>
            <TouchableOpacity onPress={() => setShowAiSetup(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: c.textSecondary, fontSize: 16, fontWeight: '600' }}>Отмена</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 48, gap: 8 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.aiLabel, { color: c.textSecondary }]}>Модель:</Text>
            <TextInput
              style={[styles.aiInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
              value={aiModel}
              onChangeText={setAiModel}
              placeholder={DEFAULT_MODEL}
              placeholderTextColor={c.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.chipRow}>
              {SUGGESTED_MODELS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.tagChip, aiModel === m && { backgroundColor: c.primary }]}
                  onPress={() => setAiModel(m)}
                >
                  <Text style={[styles.tagChipText, { color: aiModel === m ? '#FFF' : c.textSecondary }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.aiLabel, { color: c.textSecondary, marginTop: 8 }]}>Цель тренировок:</Text>
            <View style={styles.chipRow}>
              {['ОФП', 'Масса', 'Сила', 'Похудение'].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.tagChip, aiGoal === g && { backgroundColor: c.primary }]}
                  onPress={() => setAiGoal(g)}
                >
                  <Text style={[styles.tagChipText, { color: aiGoal === g ? '#FFF' : c.textSecondary }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.aiLabel, { color: c.textSecondary, marginTop: 8 }]}>Особые замечания (травмы, пожелания — попадут в промпт):</Text>
            <TextInput
              style={[styles.aiInput, { color: c.text, borderColor: c.border, backgroundColor: c.card, minHeight: 60, textAlignVertical: 'top' }]}
              value={aiNotes}
              onChangeText={setAiNotes}
              placeholder="напр.: болит правое колено — без приседа и выпадов"
              placeholderTextColor={c.textSecondary}
              multiline
            />
            <Text style={[styles.aiLabel, { color: c.textSecondary, marginTop: 8 }]}>Сколько времени есть?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[45, 60, 90].map((m) => (
                <TouchableOpacity key={m} style={[styles.fab, { backgroundColor: '#0EA5E9' }]} onPress={() => runAiPlan(m)}>
                  <Text style={styles.fabText}>{m} мин</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* AI plan preview */}
      <Modal visible={aiPlan != null} animationType="slide" onRequestClose={() => setAiPlan(null)}>
        <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: c.text }]}>🤖 План на {fmtDate(date).toLowerCase()}</Text>
            <TouchableOpacity onPress={() => setAiPlan(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: c.textSecondary, fontSize: 16, fontWeight: '600' }}>Отмена</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90, gap: 8 }}>
            {aiPlan?.summary ? (
              <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 4 }}>{aiPlan.summary}</Text>
            ) : null}
            {aiPlan?.items.map((item, idx) => {
              const ex = exercises.find((e) => e.id === item.exerciseId);
              return (
                <View key={idx} style={[styles.dayRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
                      {ex?.name || item.exerciseId} — {item.sets}×{item.reps}{item.weight > 0 ? ` @ ${item.weight} кг` : ''}
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>{item.reason}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.fabRow}>
            <TouchableOpacity style={[styles.fab, { backgroundColor: '#22C55E' }]} onPress={acceptAiPlan}>
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>✓ Принять в план</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Program day picker / editor */}
      <Modal visible={showPrograms} animationType="slide" onRequestClose={() => setShowPrograms(false)}>
        <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: c.text }]}>Программа → план на {fmtDate(date).toLowerCase()}</Text>
            <TouchableOpacity onPress={() => setShowPrograms(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, paddingHorizontal: 16, marginBottom: 4 }}>
            Тап по дню — в план. Долгий тап по дню или программе — изменить/удалить.
          </Text>
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 48, gap: 8 }}>
            {programs.map((prog) => (
              <View key={prog.id}>
                <TouchableOpacity onLongPress={() => handleProgramLongPress(prog.id, prog.name)}>
                  <Text style={[styles.progTitle, { color: c.text }]}>{prog.name}</Text>
                </TouchableOpacity>
                {days.filter((d) => d.programId === prog.id).map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.dayRow, { backgroundColor: c.card, borderColor: c.border }]}
                    onPress={() => handleAddDay(d.id, d.name)}
                    onLongPress={() => handleDayLongPress(d.id, d.name)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{d.name || `День ${d.dayNumber}`}</Text>
                      {d.description ? (
                        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{d.description}</Text>
                      ) : null}
                    </View>
                    <Text style={{ color: c.primary, fontSize: 22, fontWeight: '600' }}>+</Text>
                  </TouchableOpacity>
                ))}
                {addDayFor === prog.id ? (
                  <View style={styles.inlineAddRow}>
                    <TextInput
                      style={[styles.inlineInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
                      value={newDayName}
                      onChangeText={setNewDayName}
                      placeholder="Название дня"
                      placeholderTextColor={c.textSecondary}
                      autoFocus
                    />
                    <TouchableOpacity style={[styles.inlineBtn, { backgroundColor: c.primary }]} onPress={handleCreateDay}>
                      <Text style={{ color: '#FFF', fontWeight: '700' }}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.inlineBtn} onPress={() => { setAddDayFor(null); setNewDayName(''); }}>
                      <Text style={{ color: c.textSecondary }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setAddDayFor(prog.id); setNewDayName(''); }}>
                    <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600', paddingVertical: 4 }}>+ день</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <View style={[styles.inlineAddRow, { marginTop: 12 }]}>
              <TextInput
                style={[styles.inlineInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
                value={newProgName}
                onChangeText={setNewProgName}
                placeholder="+ Новая программа (название)"
                placeholderTextColor={c.textSecondary}
              />
              {newProgName.trim().length > 0 && (
                <TouchableOpacity style={[styles.inlineBtn, { backgroundColor: c.primary }]} onPress={handleCreateProgram}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>✓</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Day composition editor */}
      <Modal visible={editDayId != null} animationType="slide" onRequestClose={() => setEditDayId(null)}>
        <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: c.text }]} numberOfLines={1}>
              {days.find((d) => d.id === editDayId)?.name || 'Состав дня'}
            </Text>
            <TouchableOpacity onPress={() => setEditDayId(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Готово</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={editDayExs}
            keyExtractor={(e) => String(e.id)}
            renderItem={({ item }) => (
              <View style={styles.pickerRow}>
                {(item.imageBase64 || item.imageUri) ? (
                  <Image source={{ uri: item.imageBase64 || item.imageUri! }} style={styles.exImage} />
                ) : (
                  <View style={[styles.exImagePlaceholder, { backgroundColor: c.border }]}>
                    <Text style={{ fontSize: 20 }}>🏋️</Text>
                  </View>
                )}
                <Text style={[styles.exName, { color: c.text, flex: 1 }]} numberOfLines={1}>{item.name}</Text>
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={async () => {
                    if (editDayId == null) return;
                    await removeExerciseFromDay(editDayId, item.id);
                    await reloadEditDay(editDayId);
                  }}
                >
                  <Text style={{ color: c.danger || '#FF3B30', fontSize: 20 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 90 }}
            ListEmptyComponent={
              <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Пока пусто — добавь упражнения</Text>
            }
          />
          <View style={styles.fabRow}>
            <TouchableOpacity
              style={[styles.fab, { backgroundColor: c.primary }]}
              onPress={() => { setPickerTargetDay(editDayId); setShowPicker(true); }}
            >
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>+ Упражнение</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Exercise picker (targets today's plan or a program day) */}
      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: c.text }]} numberOfLines={1}>
              {replaceItem
                ? `Замена: ${replaceItem.name}`
                : pickerTargetDay != null ? 'В день программы' : `В план на ${fmtDate(date).toLowerCase()}`}
            </Text>
            <TouchableOpacity
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => { setShowPicker(false); setSearch(''); setPickerTag(null); setPickerTargetDay(null); setReplaceItem(null); }}
            >
              <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Готово</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.searchInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск..."
            placeholderTextColor={c.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagBar} contentContainerStyle={styles.tagBarContent}>
            <TouchableOpacity
              style={[styles.tagChip, !pickerTag && { backgroundColor: c.primary }]}
              onPress={() => setPickerTag(null)}
            >
              <Text style={[styles.tagChipText, { color: !pickerTag ? '#FFF' : c.textSecondary }]}>Все</Text>
            </TouchableOpacity>
            {allTags.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tagChip, pickerTag === t && { backgroundColor: c.primary }]}
                onPress={() => setPickerTag(pickerTag === t ? null : t)}
              >
                <Text style={[styles.tagChipText, { color: pickerTag === t ? '#FFF' : c.textSecondary }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={pickerList}
            keyExtractor={(e) => String(e.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={async () => {
                  if (replaceItem) {
                    await handleReplacePick(item.id);
                  } else if (pickerTargetDay != null) {
                    await addExerciseToDay(pickerTargetDay, item.id);
                    await reloadEditDay(pickerTargetDay);
                  } else {
                    addPlanItem(date, item.id);
                  }
                }}
              >
                {(item.imageBase64 || item.imageUri) ? (
                  <Image source={{ uri: item.imageBase64 || item.imageUri! }} style={styles.exImage} />
                ) : (
                  <View style={[styles.exImagePlaceholder, { backgroundColor: c.border }]}>
                    <Text style={{ fontSize: 20 }}>🏋️</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exName, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
                  {item.tag && <Text style={{ color: c.primary, fontSize: 11, fontWeight: '600' }}>{item.tag}</Text>}
                </View>
                <Text style={{ color: c.primary, fontSize: 24, fontWeight: '600' }}>+</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Ничего не найдено</Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  dateArrow: { paddingHorizontal: 20, paddingVertical: 4 },
  dateText: { fontSize: 18, fontWeight: '700', minWidth: 130, textAlign: 'center' },
  progress: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  exRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, borderRadius: 10, borderWidth: 1 },
  exImage: { width: 48, height: 48, borderRadius: 8 },
  exImagePlaceholder: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 15, fontWeight: '600' },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  copyBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  fabRow: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', gap: 8 },
  fab: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  fabText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  progTitle: { fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  searchInput: { marginHorizontal: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  tagBar: { maxHeight: 40, marginTop: 8, marginBottom: 4 },
  tagBarContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  tagChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(128,128,128,0.15)' },
  tagChipText: { fontSize: 12, fontWeight: '600' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  inlineAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14 },
  inlineBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  aiLabel: { fontSize: 13, fontWeight: '600' },
  aiInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
