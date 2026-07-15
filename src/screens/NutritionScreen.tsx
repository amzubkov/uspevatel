import React, { useEffect, useMemo, useState } from 'react';
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
import { toAiBase64 } from '../utils/aiImage';
import { DatePickerField } from '../components/DatePickerField';
import { TimePickerField } from '../components/TimePickerField';
import { parseFoodPhoto, lookupFoodByName, ParsedFood } from '../services/aiNutritionService';
import { listLocalFoods, searchFood, FoodHit } from '../services/foodDatabase';
import { DIETS, getDiet, macrosForKcal } from '../utils/diets';
import { MenuPlan } from './nutrition/MenuPlan';
import { ShoppingList } from './nutrition/ShoppingList';
import {
  MealType,
  NutritionEntry,
  NutritionEntryInput,
  useNutritionStore,
} from '../store/nutritionStore';
import { useSettingsStore } from '../store/settingsStore';
import { useNutritionGoalStore, NutritionGoals } from '../store/nutritionGoalStore';
import { ProgressRing } from '../components/ProgressRing';
import {
  calculateEntryNutrition,
  estimateKcalFromMacros,
  FoodSuggestion,
  suggestFoodsForDay,
  sumNutrition,
} from '../utils/nutrition';
import { shiftDateStr, toDateStr, WEEKDAYS_SUN } from '../utils/date';
import { colors } from '../utils/theme';

const SOURCE_COLORS: Record<string, string> = { RU: '#EF4444', USDA: '#3B82F6', OFF: '#F59E0B', FS: '#10B981' };

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
  const addEntries = useNutritionStore((state) => state.addEntries);
  const updateEntry = useNutritionStore((state) => state.updateEntry);
  const removeEntry = useNutritionStore((state) => state.removeEntry);
  const goalKcal = useNutritionGoalStore((state) => state.kcal);
  const goalProtein = useNutritionGoalStore((state) => state.protein);
  const goalFat = useNutritionGoalStore((state) => state.fat);
  const goalCarbs = useNutritionGoalStore((state) => state.carbs);
  const goalDiet = useNutritionGoalStore((state) => state.diet);
  const setGoals = useNutritionGoalStore((state) => state.setGoals);

  const today = toDateStr(new Date());
  const [nutTab, setNutTab] = useState<'diary' | 'menu' | 'shop'>('diary');
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<NutritionEntry | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FoodHit[] | null>(null);
  const [catalogFoods, setCatalogFoods] = useState<FoodHit[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FoodSuggestion<FoodHit>[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [goalForm, setGoalForm] = useState({ kcal: '', protein: '', fat: '', carbs: '', diet: goalDiet });

  useEffect(() => {
    let active = true;
    listLocalFoods()
      .then((foods) => {
        if (!active) return;
        setCatalogFoods(foods);
        setCatalogError(null);
        setCatalogLoaded(true);
      })
      .catch((error: any) => {
        if (!active) return;
        setCatalogFoods([]);
        setCatalogError(String(error?.message || error));
        setCatalogLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === date),
    [entries, date],
  );
  const totals = useMemo(() => sumNutrition(dayEntries), [dayEntries]);
  const nutritionGoals = useMemo(() => ({
    kcal: goalKcal,
    protein: goalProtein,
    fat: goalFat,
    carbs: goalCarbs,
  }), [goalKcal, goalProtein, goalFat, goalCarbs]);
  const remaining = useMemo(() => ({
    protein: Math.max(0, goalProtein - totals.protein),
    fat: Math.max(0, goalFat - totals.fat),
    carbs: Math.max(0, goalCarbs - totals.carbs),
  }), [goalProtein, goalFat, goalCarbs, totals]);
  const macroGoalsClosed = remaining.protein <= Math.max(2, goalProtein * 0.03)
    && remaining.fat <= Math.max(1, goalFat * 0.03)
    && remaining.carbs <= Math.max(3, goalCarbs * 0.03);
  const macroGoalsExactlyClosed = remaining.protein === 0 && remaining.fat === 0 && remaining.carbs === 0;
  const largeRemainder = (goalProtein > 0 && remaining.protein >= goalProtein * 0.6)
    || (goalFat > 0 && remaining.fat >= goalFat * 0.6)
    || (goalCarbs > 0 && remaining.carbs >= goalCarbs * 0.6);

  // Computed ONLY on button press over the full catalog (13k+ rows): the beam
  // search blocks the JS thread for a while, so it must never run
  // automatically on mount or after every diary change.
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  useEffect(() => {
    setSuggestions([]);
    setSuggestionsReady(false);
    setSuggestionsLoading(false);
  }, [date, totals.kcal, totals.protein, totals.fat, totals.carbs]);

  const computeSuggestions = () => {
    if (suggestionsLoading) return;
    setSuggestionsLoading(true);
    const idle = (cb: () => void) =>
      typeof (global as any).requestIdleCallback === 'function'
        ? (global as any).requestIdleCallback(cb)
        : setTimeout(cb, 0);
    idle(() => {
      const next = suggestFoodsForDay(catalogFoods, nutritionGoals, totals);
      setSuggestions(next);
      setSuggestionsReady(true);
      setSuggestionsLoading(false);
    });
  };

  const suggestedTotals = useMemo(
    () => sumNutrition(suggestions.map((suggestion) => ({
      ...suggestion.food,
      amountGrams: suggestion.amountGrams,
    }))),
    [suggestions],
  );
  const remainingAfterSuggestions = useMemo(() => ({
    protein: Math.max(0, remaining.protein - suggestedTotals.protein),
    fat: Math.max(0, remaining.fat - suggestedTotals.fat),
    carbs: Math.max(0, remaining.carbs - suggestedTotals.carbs),
  }), [remaining, suggestedTotals]);
  const suggestionsCloseGoals = remainingAfterSuggestions.protein <= Math.max(2, goalProtein * 0.03)
    && remainingAfterSuggestions.fat <= Math.max(1, goalFat * 0.03)
    && remainingAfterSuggestions.carbs <= Math.max(3, goalCarbs * 0.03);
  const projectedKcal = totals.kcal + suggestedTotals.kcal;
  const projectedKcalOver = Math.max(0, projectedKcal - goalKcal);

  // Overnight fasting window: last meal today -> first meal next day.
  const fastingMin = useMemo(() => {
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const nextDay = entries.filter((e) => e.date === shiftDateStr(date, 1));
    if (!dayEntries.length || !nextDay.length) return null;
    const lastToday = Math.max(...dayEntries.map((e) => toMin(e.time)));
    const firstNext = Math.min(...nextDay.map((e) => toMin(e.time)));
    return 24 * 60 - lastToday + firstNext;
  }, [entries, dayEntries, date]);

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
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (!uri) return null;
    return toAiBase64(uri, 1024);
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

  const openSuggestion = (suggestion: FoodSuggestion<FoodHit>) => {
    const time = currentTime();
    setEditing(null);
    setForm({
      name: suggestion.food.name,
      date,
      time,
      mealType: inferMeal(time),
      amountGrams: numberInput(suggestion.amountGrams),
      kcalPer100: numberInput(suggestion.food.kcalPer100),
      proteinPer100: numberInput(suggestion.food.proteinPer100),
      fatPer100: numberInput(suggestion.food.fatPer100),
      carbsPer100: numberInput(suggestion.food.carbsPer100),
      notes: '',
    });
    setSearchResults(null);
    setShowForm(true);
  };

  const retryCatalog = async () => {
    setCatalogLoaded(false);
    setCatalogError(null);
    try {
      const foods = await listLocalFoods();
      setCatalogFoods(foods);
    } catch (error: any) {
      setCatalogFoods([]);
      setCatalogError(String(error?.message || error));
    } finally {
      setCatalogLoaded(true);
    }
  };

  const quickAddSuggestion = async (suggestion: FoodSuggestion<FoodHit>) => {
    const key = `${suggestion.food.name}:${suggestion.amountGrams}`;
    if (addingSuggestion) return;
    const time = currentTime();
    setAddingSuggestion(key);
    try {
      await addEntry({
        name: suggestion.food.name,
        date,
        time,
        mealType: inferMeal(time),
        amountGrams: suggestion.amountGrams,
        kcalPer100: suggestion.food.kcalPer100,
        proteinPer100: suggestion.food.proteinPer100,
        fatPer100: suggestion.food.fatPer100,
        carbsPer100: suggestion.food.carbsPer100,
        kcalAuto: false,
        notes: '',
      });
    } catch (error: any) {
      Alert.alert('Не удалось добавить', String(error?.message || error));
    } finally {
      setAddingSuggestion(null);
    }
  };

  const quickAddAllSuggestions = () => {
    if (addingSuggestion || suggestions.length === 0) return;
    const list = suggestions.map((suggestion) => `• ${suggestion.food.name}, ${suggestion.amountGrams} г`).join('\n');
    const kcalWarning = projectedKcalOver >= 10
      ? `\n\nПосле добавления будет +${Math.round(projectedKcalOver)} ккал сверх цели.`
      : '';
    Alert.alert('Добавить весь набор?', `${list}${kcalWarning}`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Добавить',
        onPress: async () => {
          const time = currentTime();
          setAddingSuggestion('all');
          try {
            await addEntries(suggestions.map((suggestion) => ({
              name: suggestion.food.name,
              date,
              time,
              mealType: inferMeal(time),
              amountGrams: suggestion.amountGrams,
              kcalPer100: suggestion.food.kcalPer100,
              proteinPer100: suggestion.food.proteinPer100,
              fatPer100: suggestion.food.fatPer100,
              carbsPer100: suggestion.food.carbsPer100,
              kcalAuto: false,
              notes: '',
            })));
          } catch (error: any) {
            Alert.alert('Не удалось добавить набор', String(error?.message || error));
          } finally {
            setAddingSuggestion(null);
          }
        },
      },
    ]);
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

  const copyToToday = async (entry: NutritionEntry) => {
    const time = currentTime();
    try {
      await addEntry({
        name: entry.name,
        date: toDateStr(new Date()),
        time,
        mealType: inferMeal(time),
        amountGrams: entry.amountGrams,
        kcalPer100: entry.kcalPer100,
        proteinPer100: entry.proteinPer100,
        fatPer100: entry.fatPer100,
        carbsPer100: entry.carbsPer100,
        kcalAuto: entry.kcalAuto,
        notes: entry.notes,
      });
    } catch (error: any) {
      Alert.alert('Не удалось добавить', String(error?.message || error));
    }
  };

  const confirmRemove = (entry: NutritionEntry) => {
    Alert.alert(`${entry.name}, ${entry.amountGrams} г`, undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: '→ В сегодня', onPress: () => copyToToday(entry) },
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
      diet: goalDiet,
    });
    setShowGoals(true);
  };

  // Pick a diet → recompute macro fields from the current kcal target.
  const pickDiet = (dietId: string) => {
    const kcal = parseNonNegative(goalForm.kcal) ?? 0;
    const m = macrosForKcal(kcal, getDiet(dietId));
    setGoalForm((g) => ({
      ...g,
      diet: dietId,
      protein: numberInput(m.protein),
      fat: numberInput(m.fat),
      carbs: numberInput(m.carbs),
    }));
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
      await setGoals(next, goalForm.diet);
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

      <View style={styles.nutTabs}>
        {([['diary', 'Дневник'], ['menu', 'Меню'], ['shop', 'Покупки']] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.nutTab, { borderBottomColor: nutTab === key ? c.primary : 'transparent' }]}
            onPress={() => setNutTab(key)}
          >
            <Text style={{ color: nutTab === key ? c.primary : c.textSecondary, fontWeight: '700', fontSize: 14 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {nutTab === 'menu' ? (
        <MenuPlan date={date} theme={theme} formatDate={formatDate} />
      ) : nutTab === 'shop' ? (
        <ShoppingList theme={theme} />
      ) : (
      <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={openGoals}
        style={[styles.summary, { backgroundColor: c.card, borderColor: c.border }]}
      >
        <View style={styles.summaryTop}>
          <ProgressRing
            size={112}
            strokeWidth={11}
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

      <TouchableOpacity style={styles.dietBar} onPress={() => setNutTab('menu')}>
        <Text style={[styles.dietBarText, { color: c.textSecondary }]}>Диета: <Text style={{ color: c.text, fontWeight: '700' }}>{getDiet(goalDiet).name}</Text></Text>
        <Text style={[styles.dietMenuBtnText, { color: c.primary }]}>Меню на день →</Text>
      </TouchableOpacity>

      {fastingMin != null && (
        <Text style={[styles.fastingText, { color: c.textSecondary }]}>
          🌙→🌅 Ночное окно: {Math.floor(fastingMin / 60)}ч {fastingMin % 60}м
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.listContent}>
        {dayEntries.length > 0 && !catalogLoaded && (
          <View style={[styles.suggestionsCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.suggestionsTitle, { color: c.text }]}>Подбираю продукты…</Text>
            <Text style={[styles.suggestionsEmpty, { color: c.textSecondary }]}>Загружаю локальную базу.</Text>
          </View>
        )}

        {dayEntries.length > 0 && catalogLoaded && catalogFoods.length === 0 && (
          <View style={[styles.suggestionsCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.suggestionsTitle, { color: c.text }]}>База продуктов недоступна</Text>
            <Text style={[styles.suggestionsEmpty, { color: c.textSecondary }]}>
              {catalogError ? 'Не удалось прочитать локальный каталог.' : 'В локальном каталоге пока нет продуктов.'}
            </Text>
            <TouchableOpacity style={styles.suggestionsMenuLink} onPress={retryCatalog}>
              <Text style={[styles.suggestionsMenuLinkText, { color: c.primary }]}>Повторить загрузку</Text>
            </TouchableOpacity>
          </View>
        )}

        {dayEntries.length > 0 && catalogFoods.length > 0 && (
          largeRemainder && !macroGoalsClosed ? (
            <View style={[styles.suggestionsCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.suggestionsTitle, { color: c.text }]}>До цели ещё много</Text>
              <Text style={[styles.suggestionsRemaining, { color: c.textSecondary }]}>
                Осталось: Б {formatMacro(remaining.protein)} · Ж {formatMacro(remaining.fat)} · У {formatMacro(remaining.carbs)} г
              </Text>
              <Text style={[styles.suggestionsEmpty, { color: c.textSecondary }]}>
                Добор отдельными продуктами получится слишком объёмным — лучше составить полноценное меню.
              </Text>
              <TouchableOpacity style={styles.suggestionsMenuLink} onPress={() => setNutTab('menu')}>
                <Text style={[styles.suggestionsMenuLinkText, { color: c.primary }]}>Составить меню на день →</Text>
              </TouchableOpacity>
            </View>
          ) : macroGoalsClosed ? (
            <View style={[styles.suggestionsDone, { backgroundColor: c.successLight, borderColor: c.success }]}>
              <Text style={[styles.suggestionsDoneText, { color: c.success }]}>
                ✓ Цели по БЖУ на день {macroGoalsExactlyClosed ? 'закрыты' : 'практически закрыты'}
              </Text>
            </View>
          ) : (
            <View style={[styles.suggestionsCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.suggestionsTitle, { color: c.text }]}>Чем добрать день</Text>
              <Text style={[styles.suggestionsRemaining, { color: c.textSecondary }]}>
                Осталось: Б {formatMacro(remaining.protein)} · Ж {formatMacro(remaining.fat)} · У {formatMacro(remaining.carbs)} г
              </Text>

              {suggestionsLoading ? (
                <Text style={[styles.suggestionsEmpty, { color: c.textSecondary }]}>Ищу подходящие порции…</Text>
              ) : !suggestionsReady ? (
                <TouchableOpacity style={styles.suggestionsMenuLink} onPress={computeSuggestions}>
                  <Text style={[styles.suggestionsMenuLinkText, { color: c.primary }]}>🔍 Подобрать продукты</Text>
                </TouchableOpacity>
              ) : suggestions.length > 0 ? suggestions.map((suggestion) => {
                const key = `${suggestion.food.name}:${suggestion.amountGrams}`;
                const adding = addingSuggestion === key;
                const itemKcalOver = Math.max(0, totals.kcal + suggestion.nutrition.kcal - goalKcal);
                return (
                  <View
                    key={key}
                    style={[
                      styles.suggestionRow,
                      { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.suggestionInfo}
                      onPress={() => openSuggestion(suggestion)}
                      accessibilityRole="button"
                      accessibilityLabel={`Изменить порцию: ${suggestion.food.name}, ${suggestion.amountGrams} грамм`}
                    >
                      <View style={styles.suggestionNameRow}>
                        <Text style={[styles.suggestionName, { color: c.text }]} numberOfLines={2}>{suggestion.food.name}</Text>
                      </View>
                      <Text style={[styles.suggestionPortion, { color: c.textSecondary }]}>
                        {suggestion.amountGrams} г · {Math.round(suggestion.nutrition.kcal)} ккал
                      </Text>
                      <Text style={[styles.suggestionMacros, { color: c.textSecondary }]}>
                        + Б {formatMacro(suggestion.nutrition.protein)} · Ж {formatMacro(suggestion.nutrition.fat)} · У {formatMacro(suggestion.nutrition.carbs)} г
                      </Text>
                      {itemKcalOver >= 10 && (
                        <Text style={[styles.suggestionWarning, { color: c.warning }]}>
                          ⚠ После продукта будет +{Math.round(itemKcalOver)} ккал сверх цели
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.suggestionAdd, { backgroundColor: c.primary, opacity: addingSuggestion && !adding ? 0.5 : 1 }]}
                      onPress={() => quickAddSuggestion(suggestion)}
                      disabled={addingSuggestion !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Добавить ${suggestion.food.name}, ${suggestion.amountGrams} грамм`}
                    >
                      <Text style={styles.suggestionAddText}>{adding ? '…' : `+ ${suggestion.amountGrams} г`}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }) : (
                <Text style={[styles.suggestionsEmpty, { color: c.textSecondary }]}>
                  Для такого остатка не нашлось разумного набора порций.
                </Text>
              )}

              {!suggestionsLoading && suggestions.length > 0 ? (
                <>
                  {projectedKcalOver >= 10 && (
                    <View style={[styles.suggestionsWarningBox, { backgroundColor: c.warningLight }]}>
                      <Text style={[styles.suggestionsWarningText, { color: c.warning }]}>
                        ⚠ Весь набор превысит цель на {Math.round(projectedKcalOver)} ккал
                      </Text>
                    </View>
                  )}
                  {suggestions.length > 1 && (
                    <TouchableOpacity
                      style={[styles.suggestionsAddAll, { backgroundColor: c.primary, opacity: addingSuggestion && addingSuggestion !== 'all' ? 0.5 : 1 }]}
                      onPress={quickAddAllSuggestions}
                      disabled={addingSuggestion !== null}
                      accessibilityRole="button"
                      accessibilityLabel="Добавить весь предложенный набор"
                    >
                      <Text style={styles.suggestionsAddAllText}>{addingSuggestion === 'all' ? 'Добавляю…' : 'Добавить весь набор'}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.suggestionsHint, { color: c.textSecondary }]}>
                    {suggestionsCloseGoals
                      ? 'Набор максимально приблизит БЖУ к цели.'
                      : `Подбор частичный: после всего останется Б ${formatMacro(remainingAfterSuggestions.protein)} · Ж ${formatMacro(remainingAfterSuggestions.fat)} · У ${formatMacro(remainingAfterSuggestions.carbs)} г.`}{' '}
                    {suggestions.length > 1
                      ? 'Можно добавить весь набор или продукт по одному; после одиночного добавления подсказки обновятся.'
                      : 'После добавления продукта подсказки обновятся.'}
                  </Text>
                  {!suggestionsCloseGoals && (
                    <TouchableOpacity style={styles.suggestionsMenuLink} onPress={() => setNutTab('menu')}>
                      <Text style={[styles.suggestionsMenuLinkText, { color: c.primary }]}>Составить полное меню →</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : !suggestionsLoading ? (
                <TouchableOpacity style={styles.suggestionsMenuLink} onPress={() => setNutTab('menu')}>
                  <Text style={[styles.suggestionsMenuLinkText, { color: c.primary }]}>Составить меню на день →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        )}

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
            <Text style={[styles.fieldLabel, { color: c.textSecondary, marginTop: 0 }]}>Диета</Text>
            <View style={styles.chips}>
              {DIETS.map((d) => {
                const active = goalForm.diet === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.mealChip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.card }]}
                    onPress={() => pickDiet(d.id)}
                  >
                    <Text style={{ color: active ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{d.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.formHint, { color: c.textSecondary }]}>{getDiet(goalForm.diet).desc}. Выбор диеты пересчитает БЖУ из калорий.</Text>
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
      <ProgressRing size={58} strokeWidth={6} progress={goal > 0 ? value / goal : 0} color={color} trackColor={c.border}>
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
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  dateArrow: { width: 48, height: 34, alignItems: 'center', justifyContent: 'center' },
  dateArrowText: { fontSize: 27, lineHeight: 30, fontWeight: '500' },
  dateCenter: { minWidth: 150, alignItems: 'center', paddingVertical: 2 },
  dateTitle: { fontSize: 15, fontWeight: '700' },
  todayHint: { fontSize: 9, marginTop: 0 },
  summary: { marginHorizontal: 12, marginTop: 4, padding: 11, borderRadius: 14, borderWidth: 1 },
  summaryTop: { flexDirection: 'row', alignItems: 'center' },
  ringKcal: { fontSize: 22, fontWeight: '800' },
  ringKcalGoal: { fontSize: 10, marginTop: -1 },
  ringPctBadge: { marginTop: 3, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1 },
  ringPctText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  summarySide: { flex: 1, paddingLeft: 14 },
  summarySideLabel: { fontSize: 10 },
  summarySideValue: { fontSize: 24, fontWeight: '800', marginVertical: 1 },
  nutTabs: { flexDirection: 'row', paddingHorizontal: 12 },
  nutTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderBottomWidth: 2 },
  dietBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 8 },
  dietBarText: { fontSize: 13 },
  fastingText: { fontSize: 12, marginHorizontal: 12, marginTop: 6 },
  dietMenuBtn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, borderStyle: 'dashed' },
  dietMenuBtnText: { fontSize: 13, fontWeight: '700' },
  macroRingsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  macroRing: { alignItems: 'center' },
  macroRingPct: { fontSize: 11, fontWeight: '700' },
  macroRingLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  macroRingValue: { fontSize: 9, marginTop: 1 },
  goalsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  goalsCard: { borderRadius: 16, padding: 18 },
  goalsTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  goalsActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  goalsBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  goalsBtnText: { fontSize: 15, fontWeight: '700' },
  listContent: { padding: 12, paddingTop: 6, paddingBottom: 80, flexGrow: 1 },
  suggestionsCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 16 },
  suggestionsTitle: { fontSize: 16, fontWeight: '800' },
  suggestionsRemaining: { fontSize: 12, marginTop: 3, marginBottom: 8 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  suggestionInfo: { flex: 1, paddingRight: 10 },
  suggestionNameRow: { flexDirection: 'row', alignItems: 'center' },
  suggestionName: { flex: 1, fontSize: 14, fontWeight: '700' },
  suggestionPortion: { fontSize: 11, marginTop: 4 },
  suggestionMacros: { fontSize: 11, marginTop: 2 },
  suggestionWarning: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  suggestionAdd: { minWidth: 76, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 10, alignItems: 'center' },
  suggestionAddText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  suggestionsWarningBox: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  suggestionsWarningText: { fontSize: 11, fontWeight: '700' },
  suggestionsAddAll: { borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 9 },
  suggestionsAddAllText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  suggestionsHint: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  suggestionsEmpty: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  suggestionsMenuLink: { alignSelf: 'flex-start', paddingVertical: 8, marginTop: 2 },
  suggestionsMenuLinkText: { fontSize: 13, fontWeight: '700' },
  suggestionsDone: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14 },
  suggestionsDoneText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 12, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 44, marginBottom: 8 },
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
