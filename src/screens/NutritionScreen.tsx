import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { DatePickerField } from '../components/DatePickerField';
import { TimePickerField } from '../components/TimePickerField';
import { parseFoodPhoto, lookupFoodByName, ParsedFood } from '../services/aiNutritionService';
import { searchFood, FoodHit } from '../services/foodDatabase';
import {
  MealType,
  NutritionEntry,
  NutritionEntryInput,
  useNutritionStore,
} from '../store/nutritionStore';
import { useSettingsStore } from '../store/settingsStore';
import { useNutritionGoalStore, NutritionGoals } from '../store/nutritionGoalStore';
import { ProgressRing } from '../components/ProgressRing';
import { calculateEntryNutrition, estimateKcalFromMacros, sumNutrition } from '../utils/nutrition';
import { shiftDateStr, toDateStr, WEEKDAYS_SUN } from '../utils/date';
import { colors } from '../utils/theme';

const SOURCE_COLORS: Record<string, string> = { RU: '#EF4444', USDA: '#3B82F6', OFF: '#F59E0B' };

const MEALS: { key: MealType; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Завтрак', icon: '🌅' },
  { key: 'lunch', label: 'Обед', icon: '☀️' },
  { key: 'dinner', label: 'Ужин', icon: '🌙' },
  { key: 'snack', label: 'Перекус', icon: '🍎' },
];

interface FormState {
  name: string;
  date: string;
  time: string;
  mealType: MealType;
  amountGrams: string;
  kcalPer100: string;
  proteinPer100: string;
  fatPer100: string;
  carbsPer100: string;
  notes: string;
}

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function inferMeal(time: string): MealType {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function emptyForm(date: string): FormState {
  const time = currentTime();
  return {
    name: '',
    date,
    time,
    mealType: inferMeal(time),
    amountGrams: '100',
    kcalPer100: '',
    proteinPer100: '',
    fatPer100: '',
    carbsPer100: '',
    notes: '',
  };
}

function numberInput(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

function parseNonNegative(raw: string): number | null {
  if (!raw.trim()) return 0;
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function formatMacro(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

function formatDate(date: string): string {
  const today = toDateStr(new Date());
  if (date === today) return 'Сегодня';
  const [year, month, day] = date.split('-').map(Number);
  const weekday = WEEKDAYS_SUN[new Date(year, month - 1, day).getDay()];
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')} · ${weekday}`;
}

export function NutritionScreen() {
  const theme = useSettingsStore((state) => state.theme);
  const c = colors[theme];
  const insets = useSafeAreaInsets();
  const entries = useNutritionStore((state) => state.entries);
  const addEntry = useNutritionStore((state) => state.addEntry);
  const updateEntry = useNutritionStore((state) => state.updateEntry);
  const removeEntry = useNutritionStore((state) => state.removeEntry);
  const goalKcal = useNutritionGoalStore((state) => state.kcal);
  const goalProtein = useNutritionGoalStore((state) => state.protein);
  const goalFat = useNutritionGoalStore((state) => state.fat);
  const goalCarbs = useNutritionGoalStore((state) => state.carbs);
  const setGoals = useNutritionGoalStore((state) => state.setGoals);

  const today = toDateStr(new Date());
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<NutritionEntry | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FoodHit[] | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [goalForm, setGoalForm] = useState({ kcal: '', protein: '', fat: '', carbs: '' });

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === date),
    [entries, date],
  );
  const totals = useMemo(() => sumNutrition(dayEntries), [dayEntries]);

  const groupedEntries = useMemo(() => {
    const result = new Map<MealType, NutritionEntry[]>();
    for (const meal of MEALS) {
      const items = dayEntries
        .filter((entry) => entry.mealType === meal.key)
        .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt));
      if (items.length) result.set(meal.key, items);
    }
    return result;
  }, [dayEntries]);

  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const result: NutritionEntry[] = [];
    for (const entry of entries) {
      const key = entry.name.trim().toLocaleLowerCase('ru');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(entry);
      if (result.length === 6) break;
    }
    return result;
  }, [entries]);

  const formNumbers = useMemo(() => {
    const amount = parseNonNegative(form.amountGrams) ?? 0;
    const protein = parseNonNegative(form.proteinPer100) ?? 0;
    const fat = parseNonNegative(form.fatPer100) ?? 0;
    const carbs = parseNonNegative(form.carbsPer100) ?? 0;
    const enteredKcal = parseNonNegative(form.kcalPer100);
    const kcal = form.kcalPer100.trim()
      ? (enteredKcal ?? 0)
      : estimateKcalFromMacros({ proteinPer100: protein, fatPer100: fat, carbsPer100: carbs });
    return { amount, protein, fat, carbs, kcal };
  }, [form]);

  const portionPreview = useMemo(
    () => calculateEntryNutrition({
      amountGrams: formNumbers.amount,
      kcalPer100: formNumbers.kcal,
      proteinPer100: formNumbers.protein,
      fatPer100: formNumbers.fat,
      carbsPer100: formNumbers.carbs,
    }),
    [formNumbers],
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(date));
    setSearchResults(null);
    setShowForm(true);
  };

  const openEdit = (entry: NutritionEntry) => {
    setEditing(entry);
    setForm({
      name: entry.name,
      date: entry.date,
      time: entry.time,
      mealType: entry.mealType,
      amountGrams: numberInput(entry.amountGrams),
      kcalPer100: entry.kcalAuto ? '' : numberInput(entry.kcalPer100),
      proteinPer100: numberInput(entry.proteinPer100),
      fatPer100: numberInput(entry.fatPer100),
      carbsPer100: numberInput(entry.carbsPer100),
      notes: entry.notes,
    });
    setSearchResults(null);
    setShowForm(true);
  };

  const openScannedForm = (food: ParsedFood) => {
    const time = currentTime();
    setEditing(null);
    setForm({
      name: food.name,
      date,
      time,
      mealType: inferMeal(time),
      amountGrams: numberInput(food.amountGrams),
      kcalPer100: numberInput(food.kcalPer100),
      proteinPer100: numberInput(food.proteinPer100),
      fatPer100: numberInput(food.fatPer100),
      carbsPer100: numberInput(food.carbsPer100),
      notes: '',
    });
    setSearchResults(null);
    setShowForm(true);
  };

  const applyParsed = (food: ParsedFood) => {
    setForm((current) => ({
      ...current,
      name: food.name,
      amountGrams: numberInput(food.amountGrams),
      kcalPer100: numberInput(food.kcalPer100),
      proteinPer100: numberInput(food.proteinPer100),
      fatPer100: numberInput(food.fatPer100),
      carbsPer100: numberInput(food.carbsPer100),
    }));
  };

  const pickImageBase64 = async (fromCamera: boolean): Promise<string | null> => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Нет доступа', fromCamera ? 'Разрешите доступ к камере' : 'Разрешите доступ к галерее');
      return null;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return null;
    return result.assets[0].base64;
  };

  const runScan = (apply: (food: ParsedFood) => void) => {
    if (scanning) return;
    Alert.alert('Сканировать еду', 'Сфотографируйте блюдо или выберите фото из галереи', [
      { text: 'Камера', onPress: () => doScan(true, apply) },
      { text: 'Галерея', onPress: () => doScan(false, apply) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  const doScan = async (fromCamera: boolean, apply: (food: ParsedFood) => void) => {
    let base64: string | null = null;
    try {
      base64 = await pickImageBase64(fromCamera);
    } catch (error: any) {
      Alert.alert('Камера', String(error?.message || error));
      return;
    }
    if (!base64) return;
    setScanning(true);
    try {
      apply(await parseFoodPhoto(base64));
    } catch (error: any) {
      Alert.alert('Распознавание', String(error?.message || error));
    } finally {
      setScanning(false);
    }
  };

  // Fill macros from a per-100g source (catalog / OFF) — keep the user's portion.
  const applyMacros = (hit: FoodHit) => {
    setForm((current) => ({
      ...current,
      name: hit.name,
      kcalPer100: numberInput(hit.kcalPer100),
      proteinPer100: numberInput(hit.proteinPer100),
      fatPer100: numberInput(hit.fatPer100),
      carbsPer100: numberInput(hit.carbsPer100),
    }));
    setSearchResults(null);
  };

  const searchDb = async () => {
    if (searching || looking || scanning) return;
    const name = form.name.trim();
    if (!name) {
      Alert.alert('Поиск', 'Введите название, например «окрошка на квасе»');
      return;
    }
    setSearching(true);
    try {
      const hits = await searchFood(name);
      setSearchResults(hits);
      if (hits.length === 0) {
        Alert.alert('Поиск', 'В базе не нашлось. Попробуйте «🤖 AI» или другое название.');
      }
    } catch (error: any) {
      Alert.alert('Поиск', String(error?.message || error));
    } finally {
      setSearching(false);
    }
  };

  const lookupByName = async () => {
    if (looking || scanning) return;
    const name = form.name.trim();
    if (!name) {
      Alert.alert('Поиск', 'Введите название блюда, например «окрошка на квасе»');
      return;
    }
    setLooking(true);
    try {
      applyParsed(await lookupFoodByName(name));
      setSearchResults(null);
    } catch (error: any) {
      Alert.alert('Поиск КБЖУ', String(error?.message || error));
    } finally {
      setLooking(false);
    }
  };

  const useRecentFood = (entry: NutritionEntry) => {
    setForm((current) => ({
      ...current,
      name: entry.name,
      amountGrams: numberInput(entry.amountGrams),
      kcalPer100: entry.kcalAuto ? '' : numberInput(entry.kcalPer100),
      proteinPer100: numberInput(entry.proteinPer100),
      fatPer100: numberInput(entry.fatPer100),
      carbsPer100: numberInput(entry.carbsPer100),
    }));
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setSearchResults(null);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert('Питание', 'Укажите продукт или блюдо');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) {
      Alert.alert('Питание', 'Укажите дату и время');
      return;
    }

    const amount = parseNonNegative(form.amountGrams);
    const kcal = parseNonNegative(form.kcalPer100);
    const protein = parseNonNegative(form.proteinPer100);
    const fat = parseNonNegative(form.fatPer100);
    const carbs = parseNonNegative(form.carbsPer100);
    if (amount == null || amount <= 0 || kcal == null || protein == null || fat == null || carbs == null) {
      Alert.alert('Питание', 'Граммы должны быть больше нуля, а КБЖУ — неотрицательными числами');
      return;
    }

    const resolvedKcal = form.kcalPer100.trim()
      ? kcal
      : estimateKcalFromMacros({ proteinPer100: protein, fatPer100: fat, carbsPer100: carbs });
    const input: NutritionEntryInput = {
      name,
      date: form.date,
      time: form.time,
      mealType: form.mealType,
      amountGrams: amount,
      kcalPer100: resolvedKcal,
      proteinPer100: protein,
      fatPer100: fat,
      carbsPer100: carbs,
      kcalAuto: !form.kcalPer100.trim(),
      notes: form.notes.trim(),
    };

    setSaving(true);
    try {
      if (editing) await updateEntry(editing.id, input);
      else await addEntry(input);
      setDate(input.date);
      setShowForm(false);
      setEditing(null);
    } catch (error: any) {
      Alert.alert('Не удалось сохранить', String(error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = (entry: NutritionEntry) => {
    Alert.alert('Удалить запись?', `${entry.name}, ${entry.amountGrams} г`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeEntry(entry.id);
          } catch (error: any) {
            Alert.alert('Не удалось удалить', String(error?.message || error));
          }
        },
      },
    ]);
  };

  const openGoals = () => {
    setGoalForm({
      kcal: numberInput(goalKcal),
      protein: numberInput(goalProtein),
      fat: numberInput(goalFat),
      carbs: numberInput(goalCarbs),
    });
    setShowGoals(true);
  };

  const saveGoals = async () => {
    const kcal = parseNonNegative(goalForm.kcal);
    const protein = parseNonNegative(goalForm.protein);
    const fat = parseNonNegative(goalForm.fat);
    const carbs = parseNonNegative(goalForm.carbs);
    if (kcal == null || kcal <= 0 || protein == null || fat == null || carbs == null) {
      Alert.alert('Цели', 'Калории должны быть больше нуля, БЖУ — неотрицательные');
      return;
    }
    const next: NutritionGoals = { kcal, protein, fat, carbs };
    try {
      await setGoals(next);
      setShowGoals(false);
    } catch (error: any) {
      Alert.alert('Не удалось сохранить', String(error?.message || error));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => setDate((current) => shiftDateStr(current, -1))}
          accessibilityLabel="Предыдущий день"
        >
          <Text style={[styles.dateArrowText, { color: c.primary }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateCenter} onPress={() => setDate(today)}>
          <Text style={[styles.dateTitle, { color: c.text }]}>{formatDate(date)}</Text>
          {date !== today && <Text style={[styles.todayHint, { color: c.primary }]}>к сегодняшнему дню</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => setDate((current) => shiftDateStr(current, 1))}
          accessibilityLabel="Следующий день"
        >
          <Text style={[styles.dateArrowText, { color: c.primary }]}>›</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={openGoals}
        style={[styles.summary, { backgroundColor: c.card, borderColor: c.border }]}
      >
        <View style={styles.summaryTop}>
          <ProgressRing
            size={132}
            strokeWidth={13}
            progress={goalKcal > 0 ? totals.kcal / goalKcal : 0}
            color={totals.kcal > goalKcal ? '#EF4444' : c.primary}
            trackColor={c.border}
          >
            <Text style={[styles.ringKcal, { color: c.text }]}>{Math.round(totals.kcal)}</Text>
            <Text style={[styles.ringKcalGoal, { color: c.textSecondary }]}>/ {Math.round(goalKcal)} ккал</Text>
            <View style={[styles.ringPctBadge, { backgroundColor: totals.kcal > goalKcal ? '#EF4444' : c.primary }]}>
              <Text style={styles.ringPctText}>{goalKcal > 0 ? Math.round((totals.kcal / goalKcal) * 100) : 0}%</Text>
            </View>
          </ProgressRing>
          <View style={styles.summarySide}>
            <Text style={[styles.summarySideLabel, { color: c.textSecondary }]}>Осталось</Text>
            <Text style={[styles.summarySideValue, { color: c.text }]}>{Math.max(0, Math.round(goalKcal - totals.kcal))}</Text>
            <Text style={[styles.summarySideLabel, { color: c.textSecondary }]}>ккал · нажмите, чтобы изменить цели</Text>
          </View>
        </View>
        <View style={styles.macroRingsRow}>
          <MacroRing value={totals.protein} goal={goalProtein} label="Белки" color="#3B82F6" c={c} />
          <MacroRing value={totals.fat} goal={goalFat} label="Жиры" color="#F59E0B" c={c} />
          <MacroRing value={totals.carbs} goal={goalCarbs} label="Углеводы" color="#22C55E" c={c} />
        </View>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.listContent}>
        {dayEntries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Пока ничего не записано</Text>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>Сфотографируйте блюдо — ИИ распознает КБЖУ, или добавьте вручную.</Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: '#8B5CF6', opacity: scanning ? 0.6 : 1 }]}
              onPress={() => runScan(openScannedForm)}
              disabled={scanning}
            >
              <Text style={styles.emptyButtonText}>{scanning ? 'Распознаю…' : '📷 Сканировать еду'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.emptyButtonSecondary, { borderColor: c.border }]} onPress={openAdd}>
              <Text style={[styles.emptyButtonSecondaryText, { color: c.text }]}>+ Добавить вручную</Text>
            </TouchableOpacity>
          </View>
        ) : (
          MEALS.map((meal) => {
            const items = groupedEntries.get(meal.key);
            if (!items) return null;
            const mealTotals = sumNutrition(items);
            return (
              <View key={meal.key} style={styles.mealSection}>
                <View style={styles.mealHeader}>
                  <Text style={[styles.mealTitle, { color: c.text }]}>{meal.icon} {meal.label}</Text>
                  <Text style={[styles.mealKcal, { color: c.textSecondary }]}>{Math.round(mealTotals.kcal)} ккал</Text>
                </View>
                {items.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    cardColor={c.card}
                    borderColor={c.border}
                    textColor={c.text}
                    secondaryColor={c.textSecondary}
                    onPress={() => openEdit(entry)}
                    onLongPress={() => confirmRemove(entry)}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {dayEntries.length > 0 && (
        <>
          <TouchableOpacity
            style={[styles.fabScan, { backgroundColor: '#8B5CF6', opacity: scanning ? 0.6 : 1 }]}
            onPress={() => runScan(openScannedForm)}
            disabled={scanning}
            accessibilityLabel="Сканировать еду"
          >
            <Text style={styles.fabScanText}>{scanning ? '…' : '📷'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, { backgroundColor: c.primary }]} onPress={openAdd} accessibilityLabel="Добавить еду">
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </>
      )}

      <Modal visible={showForm} animationType="slide" onRequestClose={closeForm}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: c.background, paddingTop: insets.top }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <TouchableOpacity onPress={closeForm} disabled={saving}>
              <Text style={[styles.modalAction, { color: c.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: c.text }]}>{editing ? 'Изменить запись' : 'Что съели?'}</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              <Text style={[styles.modalAction, { color: c.primary }]}>{saving ? '…' : 'Сохранить'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[styles.formContent, { paddingBottom: Math.max(36, insets.bottom + 20) }]}
            keyboardShouldPersistTaps="handled"
          >
            <FieldLabel text="Продукт или блюдо" color={c.textSecondary} />
            <TextInput
              style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
              value={form.name}
              onChangeText={(name) => setForm((current) => ({ ...current, name }))}
              placeholder="Например, творог 5%"
              placeholderTextColor={c.textSecondary}
              autoFocus={!editing}
              returnKeyType="next"
            />

            <View style={styles.aiRow}>
              <TouchableOpacity
                style={[styles.aiBtn, { borderColor: '#0EA5E9', opacity: searching || looking || scanning ? 0.6 : 1 }]}
                onPress={searchDb}
                disabled={searching || looking || scanning}
              >
                <Text style={[styles.scanRowText, { color: '#0EA5E9' }]}>
                  {searching ? 'Ищу…' : '🔍 База'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.aiBtn, { borderColor: '#10B981', opacity: searching || looking || scanning ? 0.6 : 1 }]}
                onPress={lookupByName}
                disabled={searching || looking || scanning}
              >
                <Text style={[styles.scanRowText, { color: '#10B981' }]}>
                  {looking ? 'AI…' : '🤖 AI'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.aiBtn, { borderColor: '#8B5CF6', opacity: searching || looking || scanning ? 0.6 : 1 }]}
                onPress={() => runScan(applyParsed)}
                disabled={searching || looking || scanning}
              >
                <Text style={[styles.scanRowText, { color: '#8B5CF6' }]}>
                  {scanning ? '…' : '📷 Фото'}
                </Text>
              </TouchableOpacity>
            </View>

            {searchResults && searchResults.length > 0 && (
              <View style={[styles.resultsBox, { borderColor: c.border, backgroundColor: c.card }]}>
                {searchResults.map((hit, i) => (
                  <TouchableOpacity
                    key={`${hit.name}-${i}`}
                    style={[styles.resultRow, { borderBottomColor: c.border, borderBottomWidth: i === searchResults.length - 1 ? 0 : StyleSheet.hairlineWidth }]}
                    onPress={() => applyMacros(hit)}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.resultName, { color: c.text }]} numberOfLines={2}>{hit.name}</Text>
                      <Text style={[styles.resultMacros, { color: c.textSecondary }]}>
                        Б {formatMacro(hit.proteinPer100)} · Ж {formatMacro(hit.fatPer100)} · У {formatMacro(hit.carbsPer100)} · на 100 г
                      </Text>
                    </View>
                    <View style={[styles.sourceBadge, { backgroundColor: SOURCE_COLORS[hit.source] }]}>
                      <Text style={styles.sourceBadgeText}>{hit.source}</Text>
                    </View>
                    <Text style={[styles.resultKcal, { color: c.text }]}>{Math.round(hit.kcalPer100)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!editing && recentFoods.length > 0 && (
              <View style={styles.recentBlock}>
                <Text style={[styles.recentLabel, { color: c.textSecondary }]}>Недавние:</Text>
                <View style={styles.chips}>
                  {recentFoods.map((entry) => (
                    <TouchableOpacity
                      key={entry.id}
                      style={[styles.quickChip, { backgroundColor: c.card, borderColor: c.border }]}
                      onPress={() => useRecentFood(entry)}
                    >
                      <Text style={[styles.quickChipText, { color: c.text }]} numberOfLines={1}>{entry.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <FieldLabel text="Приём пищи" color={c.textSecondary} />
            <View style={styles.chips}>
              {MEALS.map((meal) => {
                const active = form.mealType === meal.key;
                return (
                  <TouchableOpacity
                    key={meal.key}
                    style={[styles.mealChip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.card }]}
                    onPress={() => setForm((current) => ({ ...current, mealType: meal.key }))}
                  >
                    <Text style={{ color: active ? '#FFF' : c.text, fontSize: 13, fontWeight: '600' }}>{meal.icon} {meal.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.dateTimeRow}>
              <View style={styles.dateTimeField}>
                <DatePickerField
                  label="Дата"
                  value={form.date}
                  onChange={(value) => setForm((current) => ({ ...current, date: value }))}
                  textColor={c.text}
                  secondaryColor={c.textSecondary}
                  borderColor={c.border}
                  backgroundColor={c.card}
                />
              </View>
              <View style={styles.dateTimeField}>
                <TimePickerField
                  label="Время"
                  value={form.time}
                  onChange={(value) => setForm((current) => ({ ...current, time: value }))}
                  textColor={c.text}
                  secondaryColor={c.textSecondary}
                  borderColor={c.border}
                  backgroundColor={c.card}
                />
              </View>
            </View>

            <FieldLabel text="Порция" color={c.textSecondary} />
            <NumberField
              value={form.amountGrams}
              onChange={(amountGrams) => setForm((current) => ({ ...current, amountGrams }))}
              suffix="г"
              placeholder="100"
              colors={c}
            />

            <Text style={[styles.nutritionHeading, { color: c.text }]}>Пищевая ценность на 100 г</Text>
            <Text style={[styles.formHint, { color: c.textSecondary }]}>Калории можно не указывать — тогда посчитаем их из БЖУ.</Text>
            <View style={styles.macroGrid}>
              <NumberField
                label="Ккал"
                value={form.kcalPer100}
                onChange={(kcalPer100) => setForm((current) => ({ ...current, kcalPer100 }))}
                placeholder="0"
                colors={c}
              />
              <NumberField
                label="Белки, г"
                value={form.proteinPer100}
                onChange={(proteinPer100) => setForm((current) => ({ ...current, proteinPer100 }))}
                placeholder="0"
                colors={c}
              />
              <NumberField
                label="Жиры, г"
                value={form.fatPer100}
                onChange={(fatPer100) => setForm((current) => ({ ...current, fatPer100 }))}
                placeholder="0"
                colors={c}
              />
              <NumberField
                label="Углеводы, г"
                value={form.carbsPer100}
                onChange={(carbsPer100) => setForm((current) => ({ ...current, carbsPer100 }))}
                placeholder="0"
                colors={c}
              />
            </View>

            <View style={[styles.preview, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.previewTitle, { color: c.text }]}>В этой порции</Text>
              <Text style={[styles.previewKcal, { color: c.primary }]}>{Math.round(portionPreview.kcal)} ккал</Text>
              <Text style={[styles.previewMacros, { color: c.textSecondary }]}>
                Б {formatMacro(portionPreview.protein)} · Ж {formatMacro(portionPreview.fat)} · У {formatMacro(portionPreview.carbs)} г
              </Text>
            </View>

            <FieldLabel text="Заметка" color={c.textSecondary} />
            <TextInput
              style={[styles.input, styles.notesInput, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
              value={form.notes}
              onChangeText={(notes) => setForm((current) => ({ ...current, notes }))}
              placeholder="Необязательно"
              placeholderTextColor={c.textSecondary}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity style={[styles.saveButton, { backgroundColor: c.primary }]} onPress={save} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? 'Сохраняю…' : editing ? 'Сохранить изменения' : 'Добавить в дневник'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showGoals} animationType="fade" transparent onRequestClose={() => setShowGoals(false)}>
        <View style={styles.goalsBackdrop}>
          <View style={[styles.goalsCard, { backgroundColor: c.card }]}>
            <Text style={[styles.goalsTitle, { color: c.text }]}>Дневные цели</Text>
            <View style={styles.macroGrid}>
              <NumberField label="Ккал в день" value={goalForm.kcal} onChange={(kcal) => setGoalForm((g) => ({ ...g, kcal }))} placeholder="2000" colors={c} />
              <NumberField label="Белки, г" value={goalForm.protein} onChange={(protein) => setGoalForm((g) => ({ ...g, protein }))} placeholder="110" colors={c} />
              <NumberField label="Жиры, г" value={goalForm.fat} onChange={(fat) => setGoalForm((g) => ({ ...g, fat }))} placeholder="70" colors={c} />
              <NumberField label="Углеводы, г" value={goalForm.carbs} onChange={(carbs) => setGoalForm((g) => ({ ...g, carbs }))} placeholder="250" colors={c} />
            </View>
            <View style={styles.goalsActions}>
              <TouchableOpacity style={[styles.goalsBtn, { borderColor: c.border, borderWidth: 1 }]} onPress={() => setShowGoals(false)}>
                <Text style={[styles.goalsBtnText, { color: c.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.goalsBtn, { backgroundColor: c.primary }]} onPress={saveGoals}>
                <Text style={[styles.goalsBtnText, { color: '#FFF' }]}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MacroRing({ value, goal, label, color, c }: { value: number; goal: number; label: string; color: string; c: typeof colors.light }) {
  const pct = goal > 0 ? Math.round((value / goal) * 100) : 0;
  return (
    <View style={styles.macroRing}>
      <ProgressRing size={68} strokeWidth={7} progress={goal > 0 ? value / goal : 0} color={color} trackColor={c.border}>
        <Text style={[styles.macroRingPct, { color: c.textSecondary }]}>{pct}%</Text>
      </ProgressRing>
      <Text style={[styles.macroRingLabel, { color: c.text }]}>{label}</Text>
      <Text style={[styles.macroRingValue, { color: c.textSecondary }]}>{formatMacro(value)} / {Math.round(goal)} г</Text>
    </View>
  );
}

function EntryRow({
  entry,
  cardColor,
  borderColor,
  textColor,
  secondaryColor,
  onPress,
  onLongPress,
}: {
  entry: NutritionEntry;
  cardColor: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const totals = calculateEntryNutrition(entry);
  return (
    <TouchableOpacity
      style={[styles.entryRow, { backgroundColor: cardColor, borderColor }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
    >
      <Text style={[styles.entryTime, { color: secondaryColor }]}>{entry.time}</Text>
      <View style={styles.entryMain}>
        <Text style={[styles.entryName, { color: textColor }]} numberOfLines={2}>{entry.name}</Text>
        <Text style={[styles.entryDetails, { color: secondaryColor }]}>
          {entry.amountGrams} г · Б {formatMacro(totals.protein)} · Ж {formatMacro(totals.fat)} · У {formatMacro(totals.carbs)}
        </Text>
        {entry.notes ? <Text style={[styles.entryNotes, { color: secondaryColor }]} numberOfLines={2}>{entry.notes}</Text> : null}
      </View>
      <View style={styles.entryKcalBlock}>
        <Text style={[styles.entryKcal, { color: textColor }]}>{Math.round(totals.kcal)}</Text>
        <Text style={[styles.entryKcalLabel, { color: secondaryColor }]}>ккал</Text>
      </View>
    </TouchableOpacity>
  );
}

function FieldLabel({ text, color }: { text: string; color: string }) {
  return <Text style={[styles.fieldLabel, { color }]}>{text}</Text>;
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  colors: c,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suffix?: string;
  colors: typeof colors.light;
}) {
  return (
    <View style={styles.numberField}>
      {label ? <Text style={[styles.numberLabel, { color: c.textSecondary }]}>{label}</Text> : null}
      <View style={[styles.numberInputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <TextInput
          style={[styles.numberInput, { color: c.text }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c.textSecondary}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        {suffix ? <Text style={{ color: c.textSecondary, marginRight: 12 }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  dateArrow: { width: 54, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateArrowText: { fontSize: 34, lineHeight: 38, fontWeight: '500' },
  dateCenter: { minWidth: 160, alignItems: 'center', paddingVertical: 3 },
  dateTitle: { fontSize: 18, fontWeight: '700' },
  todayHint: { fontSize: 10, marginTop: 1 },
  summary: { marginHorizontal: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  summaryTop: { flexDirection: 'row', alignItems: 'center' },
  ringKcal: { fontSize: 26, fontWeight: '800' },
  ringKcalGoal: { fontSize: 11, marginTop: -1 },
  ringPctBadge: { marginTop: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  ringPctText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  summarySide: { flex: 1, paddingLeft: 16 },
  summarySideLabel: { fontSize: 11 },
  summarySideValue: { fontSize: 28, fontWeight: '800', marginVertical: 1 },
  macroRingsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 14 },
  macroRing: { alignItems: 'center' },
  macroRingPct: { fontSize: 12, fontWeight: '700' },
  macroRingLabel: { fontSize: 12, fontWeight: '700', marginTop: 5 },
  macroRingValue: { fontSize: 10, marginTop: 1 },
  goalsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  goalsCard: { borderRadius: 16, padding: 18 },
  goalsTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  goalsActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  goalsBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  goalsBtnText: { fontSize: 15, fontWeight: '700' },
  listContent: { padding: 12, paddingBottom: 100, flexGrow: 1 },
  empty: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  emptyButton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  emptyButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  emptyButtonSecondary: { marginTop: 10, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  emptyButtonSecondaryText: { fontSize: 14, fontWeight: '600' },
  mealSection: { marginBottom: 16 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 7 },
  mealTitle: { fontSize: 15, fontWeight: '700' },
  mealKcal: { fontSize: 12, fontWeight: '600' },
  entryRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 7 },
  entryTime: { width: 43, fontSize: 12, fontVariant: ['tabular-nums'] },
  entryMain: { flex: 1, paddingRight: 8 },
  entryName: { fontSize: 15, fontWeight: '600' },
  entryDetails: { fontSize: 11, marginTop: 3 },
  entryNotes: { fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  entryKcalBlock: { minWidth: 45, alignItems: 'flex-end' },
  entryKcal: { fontSize: 16, fontWeight: '800' },
  entryKcalLabel: { fontSize: 10 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  fabText: { color: '#FFF', fontSize: 32, lineHeight: 35, fontWeight: '400' },
  fabScan: { position: 'absolute', right: 24, bottom: 88, width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  fabScanText: { fontSize: 22 },
  aiRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  aiBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 6, alignItems: 'center', borderStyle: 'dashed' },
  scanRowText: { fontSize: 13, fontWeight: '700' },
  resultsBox: { marginTop: 10, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  resultName: { fontSize: 14, fontWeight: '600' },
  resultMacros: { fontSize: 11, marginTop: 2 },
  sourceBadge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, marginRight: 8 },
  sourceBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  resultKcal: { fontSize: 15, fontWeight: '800', minWidth: 38, textAlign: 'right' },
  modalContainer: { flex: 1 },
  modalHeader: { height: 54, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalAction: { fontSize: 14, fontWeight: '600', minWidth: 70 },
  formContent: { padding: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  recentBlock: { marginTop: 10 },
  recentLabel: { fontSize: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  quickChip: { maxWidth: '48%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  quickChipText: { fontSize: 12, fontWeight: '600' },
  mealChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  dateTimeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dateTimeField: { flex: 1 },
  nutritionHeading: { fontSize: 16, fontWeight: '700', marginTop: 20 },
  formHint: { fontSize: 12, lineHeight: 17, marginTop: 3, marginBottom: 8 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numberField: { width: '48%', flexGrow: 1 },
  numberLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  numberInputWrap: { minHeight: 44, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  numberInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  preview: { marginTop: 14, borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center' },
  previewTitle: { fontSize: 12, fontWeight: '600' },
  previewKcal: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  previewMacros: { fontSize: 12, marginTop: 2 },
  notesInput: { minHeight: 72 },
  saveButton: { marginTop: 18, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
