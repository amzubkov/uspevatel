import React, { useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../utils/theme';
import { calculateEntryNutrition, estimateKcalFromMacros, sumNutrition } from '../../utils/nutrition';
import { getDiet } from '../../utils/diets';
import { MealType, useNutritionStore } from '../../store/nutritionStore';
import { useNutritionGoalStore } from '../../store/nutritionGoalStore';
import { PlanItem, useNutritionPlanStore } from '../../store/nutritionPlanStore';
import { generateDietMenu, lookupFoodByName } from '../../services/aiNutritionService';
import { searchFood, FoodHit } from '../../services/foodDatabase';

const MEALS: { key: MealType; label: string; icon: string; time: string }[] = [
  { key: 'breakfast', label: 'Завтрак', icon: '🌅', time: '08:30' },
  { key: 'lunch', label: 'Обед', icon: '☀️', time: '13:00' },
  { key: 'dinner', label: 'Ужин', icon: '🌙', time: '19:00' },
  { key: 'snack', label: 'Перекус', icon: '🍎', time: '16:00' },
];

function fmtMacro(v: number): string { return v < 10 ? v.toFixed(1) : String(Math.round(v)); }
function numIn(v: number): string { return Number.isInteger(v) ? String(v) : String(v).replace('.', ','); }
function parseNN(raw: string): number | null {
  if (!raw.trim()) return 0;
  const v = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

interface FormState {
  name: string; mealType: MealType; amountGrams: string;
  kcalPer100: string; proteinPer100: string; fatPer100: string; carbsPer100: string;
}
const emptyForm = (mealType: MealType = 'breakfast'): FormState => ({
  name: '', mealType, amountGrams: '100', kcalPer100: '', proteinPer100: '', fatPer100: '', carbsPer100: '',
});

export function MenuPlan({ date, theme, formatDate }: { date: string; theme: 'light' | 'dark'; formatDate: (d: string) => string }) {
  const c = colors[theme];
  const insets = useSafeAreaInsets();
  const items = useNutritionPlanStore((s) => s.items);
  const addItem = useNutritionPlanStore((s) => s.addItem);
  const updateItem = useNutritionPlanStore((s) => s.updateItem);
  const toggleDone = useNutritionPlanStore((s) => s.toggleDone);
  const removeItem = useNutritionPlanStore((s) => s.removeItem);
  const clearDate = useNutritionPlanStore((s) => s.clearDate);
  const addEntry = useNutritionStore((s) => s.addEntry);
  const goalKcal = useNutritionGoalStore((s) => s.kcal);
  const goalDiet = useNutritionGoalStore((s) => s.diet);
  const goalProtein = useNutritionGoalStore((s) => s.protein);
  const goalFat = useNutritionGoalStore((s) => s.fat);
  const goalCarbs = useNutritionGoalStore((s) => s.carbs);

  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [results, setResults] = useState<FoodHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  const dayItems = useMemo(() => items.filter((i) => i.date === date), [items, date]);
  const totals = useMemo(() => sumNutrition(dayItems), [dayItems]);
  const doneCount = dayItems.filter((i) => i.done).length;

  const grouped = useMemo(() => {
    const map = new Map<MealType, PlanItem[]>();
    for (const m of MEALS) {
      const list = dayItems.filter((i) => i.mealType === m.key).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (list.length) map.set(m.key, list);
    }
    return map;
  }, [dayItems]);

  const runAiMenu = async () => {
    if (loading) return;
    const fill = async (replace: boolean) => {
      setLoading(true);
      try {
        if (replace) await clearDate(date);
        // Avoid dishes already planned on other days (and kept ones on this day) so future days differ.
        const avoid = Array.from(new Set(
          items.filter((i) => i.date !== date || !replace).map((i) => i.name.trim()).filter(Boolean),
        ));
        const menu = await generateDietMenu({ dietName: getDiet(goalDiet).name, kcal: goalKcal, protein: goalProtein, fat: goalFat, carbs: goalCarbs, avoid });
        for (const m of menu) {
          await addItem({
            date, mealType: m.mealType, name: m.name, amountGrams: m.amountGrams,
            kcalPer100: m.kcalPer100, proteinPer100: m.proteinPer100, fatPer100: m.fatPer100, carbsPer100: m.carbsPer100,
            ingredients: m.ingredients,
          });
        }
      } catch (e: any) {
        Alert.alert('AI-меню', String(e?.message || e));
      } finally {
        setLoading(false);
      }
    };
    if (dayItems.length > 0) {
      Alert.alert('AI-меню', 'На эту дату уже есть план.', [
        { text: 'Заменить', onPress: () => fill(true) },
        { text: 'Добавить', onPress: () => fill(false) },
        { text: 'Отмена', style: 'cancel' },
      ]);
    } else {
      fill(false);
    }
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setResults(null); setShowForm(true); };
  const openEdit = (it: PlanItem) => {
    setEditing(it);
    setForm({
      name: it.name, mealType: it.mealType, amountGrams: numIn(it.amountGrams),
      kcalPer100: numIn(it.kcalPer100), proteinPer100: numIn(it.proteinPer100),
      fatPer100: numIn(it.fatPer100), carbsPer100: numIn(it.carbsPer100),
    });
    setResults(null);
    setShowForm(true);
  };

  const applyHit = (hit: { name: string; kcalPer100: number; proteinPer100: number; fatPer100: number; carbsPer100: number }) => {
    setForm((f) => ({
      ...f, name: hit.name,
      kcalPer100: numIn(hit.kcalPer100), proteinPer100: numIn(hit.proteinPer100),
      fatPer100: numIn(hit.fatPer100), carbsPer100: numIn(hit.carbsPer100),
    }));
    setResults(null);
  };

  const searchDb = async () => {
    if (busy || !form.name.trim()) { if (!form.name.trim()) Alert.alert('Поиск', 'Введите название'); return; }
    setBusy(true);
    try { setResults(await searchFood(form.name.trim())); }
    catch (e: any) { Alert.alert('Поиск', String(e?.message || e)); }
    finally { setBusy(false); }
  };

  const askAi = async () => {
    if (busy || !form.name.trim()) { if (!form.name.trim()) Alert.alert('AI', 'Введите название'); return; }
    setBusy(true);
    try { applyHit(await lookupFoodByName(form.name.trim())); }
    catch (e: any) { Alert.alert('AI', String(e?.message || e)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { Alert.alert('Меню', 'Укажите блюдо'); return; }
    const amount = parseNN(form.amountGrams);
    const protein = parseNN(form.proteinPer100);
    const fat = parseNN(form.fatPer100);
    const carbs = parseNN(form.carbsPer100);
    const kcalRaw = parseNN(form.kcalPer100);
    if (amount == null || amount <= 0 || protein == null || fat == null || carbs == null || kcalRaw == null) {
      Alert.alert('Меню', 'Граммы > 0, КБЖУ — неотрицательные'); return;
    }
    const kcal = form.kcalPer100.trim() ? kcalRaw : estimateKcalFromMacros({ proteinPer100: protein, fatPer100: fat, carbsPer100: carbs });
    const input = { date, mealType: form.mealType, name, amountGrams: amount, kcalPer100: kcal, proteinPer100: protein, fatPer100: fat, carbsPer100: carbs, ingredients: editing ? editing.ingredients : [] };
    try {
      if (editing) await updateItem(editing.id, input);
      else await addItem(input);
      setShowForm(false);
      setEditing(null);
    } catch (e: any) { Alert.alert('Не удалось сохранить', String(e?.message || e)); }
  };

  const logToDiary = () => {
    const done = dayItems.filter((i) => i.done);
    if (done.length === 0) { Alert.alert('В дневник', 'Отметьте (галочкой) съеденные блюда'); return; }
    Alert.alert('В дневник', `Записать ${done.length} отмеченных блюд в дневник на ${formatDate(date)}?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Записать', onPress: async () => {
        for (const it of done) {
          const meal = MEALS.find((m) => m.key === it.mealType);
          await addEntry({
            name: it.name, date, time: meal?.time || '12:00', mealType: it.mealType,
            amountGrams: it.amountGrams, kcalPer100: it.kcalPer100, proteinPer100: it.proteinPer100,
            fatPer100: it.fatPer100, carbsPer100: it.carbsPer100, kcalAuto: false, notes: '',
          });
        }
        Alert.alert('Готово', `Записано ${done.length} блюд в дневник`);
      } },
    ]);
  };

  const confirmRemove = (it: PlanItem) => {
    Alert.alert('Удалить из меню?', it.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeItem(it.id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.summary, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[st.sumKcal, { color: totals.kcal > goalKcal ? '#EF4444' : c.text }]}>{Math.round(totals.kcal)} / {Math.round(goalKcal)} ккал</Text>
          <Text style={[st.sumMacros, { color: c.textSecondary }]}>Б {fmtMacro(totals.protein)} · Ж {fmtMacro(totals.fat)} · У {fmtMacro(totals.carbs)} г{dayItems.length ? ` · отмечено ${doneCount}/${dayItems.length}` : ''}</Text>
        </View>
        <TouchableOpacity style={[st.aiBtn, { borderColor: c.primary, opacity: loading ? 0.6 : 1 }]} onPress={runAiMenu} disabled={loading}>
          <Text style={[st.aiBtnText, { color: c.primary }]}>{loading ? '…' : '🤖 AI-меню'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: 150 }}>
        {dayItems.length === 0 ? (
          <View style={st.empty}>
            <Text style={{ fontSize: 44, marginBottom: 8 }}>📋</Text>
            <Text style={[st.emptyTitle, { color: c.text }]}>Меню на {formatDate(date)} пусто</Text>
            <Text style={[st.emptyText, { color: c.textSecondary }]}>Сгенерируйте AI-меню под диету «{getDiet(goalDiet).name}» или добавьте блюда вручную.</Text>
          </View>
        ) : (
          MEALS.map((meal) => {
            const list = grouped.get(meal.key);
            if (!list) return null;
            const mt = sumNutrition(list);
            return (
              <View key={meal.key} style={{ marginBottom: 14 }}>
                <View style={st.mealHeader}>
                  <Text style={[st.mealTitle, { color: c.text }]}>{meal.icon} {meal.label}</Text>
                  <Text style={[st.mealKcal, { color: c.textSecondary }]}>{Math.round(mt.kcal)} ккал</Text>
                </View>
                {list.map((it) => {
                  const t = calculateEntryNutrition(it);
                  return (
                    <View key={it.id} style={[st.row, { backgroundColor: c.card, borderColor: c.border }]}>
                      <TouchableOpacity onPress={() => toggleDone(it.id)} style={[st.check, { borderColor: it.done ? c.primary : c.border, backgroundColor: it.done ? c.primary : 'transparent' }]}>
                        {it.done && <Text style={st.checkMark}>✓</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1, paddingRight: 8 }} onPress={() => openEdit(it)} onLongPress={() => confirmRemove(it)} delayLongPress={450}>
                        <Text style={[st.name, { color: c.text, textDecorationLine: it.done ? 'line-through' : 'none', opacity: it.done ? 0.55 : 1 }]} numberOfLines={2}>{it.name}</Text>
                        <Text style={[st.details, { color: c.textSecondary }]}>{it.amountGrams} г · Б {fmtMacro(t.protein)} · Ж {fmtMacro(t.fat)} · У {fmtMacro(t.carbs)}</Text>
                      </TouchableOpacity>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[st.kcal, { color: c.text }]}>{Math.round(t.kcal)}</Text>
                        <Text style={[st.kcalLbl, { color: c.textSecondary }]}>ккал</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      {dayItems.length > 0 && (
        <TouchableOpacity style={[st.logBtn, { backgroundColor: c.primary }]} onPress={logToDiary}>
          <Text style={st.logBtnText}>Отмеченные в дневник ({doneCount})</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[st.fab, { backgroundColor: c.primary }]} onPress={openAdd}>
        <Text style={st.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[st.modalHeader, { borderBottomColor: c.border }]}>
            <TouchableOpacity onPress={() => { setShowForm(false); setEditing(null); }}><Text style={{ color: c.textSecondary, fontWeight: '600', fontSize: 14 }}>Отмена</Text></TouchableOpacity>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{editing ? 'Изменить блюдо' : 'Блюдо в меню'}</Text>
            <TouchableOpacity onPress={save}><Text style={{ color: c.primary, fontWeight: '700', fontSize: 14 }}>Сохранить</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
              value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              placeholder="Например, гречка с курицей" placeholderTextColor={c.textSecondary} autoFocus={!editing} />

            <View style={st.aiRow}>
              <TouchableOpacity style={[st.aiSmall, { borderColor: '#0EA5E9', opacity: busy ? 0.6 : 1 }]} onPress={searchDb} disabled={busy}>
                <Text style={{ color: '#0EA5E9', fontWeight: '700', fontSize: 13 }}>{busy ? '…' : '🔍 База'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.aiSmall, { borderColor: '#10B981', opacity: busy ? 0.6 : 1 }]} onPress={askAi} disabled={busy}>
                <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>{busy ? '…' : '🤖 AI'}</Text>
              </TouchableOpacity>
            </View>

            {results && results.length > 0 && (
              <View style={[st.results, { borderColor: c.border, backgroundColor: c.card }]}>
                {results.map((h, i) => (
                  <TouchableOpacity key={`${h.name}-${i}`} style={[st.resRow, { borderBottomColor: c.border, borderBottomWidth: i === results.length - 1 ? 0 : StyleSheet.hairlineWidth }]} onPress={() => applyHit(h)}>
                    <Text style={{ color: c.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{h.name}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 12 }}>{Math.round(h.kcalPer100)} ккал</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[st.label, { color: c.textSecondary }]}>Приём пищи</Text>
            <View style={st.chips}>
              {MEALS.map((m) => {
                const active = form.mealType === m.key;
                return (
                  <TouchableOpacity key={m.key} style={[st.chip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.card }]} onPress={() => setForm((f) => ({ ...f, mealType: m.key }))}>
                    <Text style={{ color: active ? '#FFF' : c.text, fontSize: 13, fontWeight: '600' }}>{m.icon} {m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[st.label, { color: c.textSecondary }]}>Порция, г</Text>
            <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
              value={form.amountGrams} onChangeText={(amountGrams) => setForm((f) => ({ ...f, amountGrams }))} keyboardType="decimal-pad" placeholder="100" placeholderTextColor={c.textSecondary} />

            <Text style={[st.label, { color: c.textSecondary }]}>На 100 г (ккал можно не указывать)</Text>
            <View style={st.grid}>
              {([['kcalPer100', 'Ккал'], ['proteinPer100', 'Белки'], ['fatPer100', 'Жиры'], ['carbsPer100', 'Углеводы']] as const).map(([key, lbl]) => (
                <View key={key} style={{ width: '48%' }}>
                  <Text style={[st.miniLabel, { color: c.textSecondary }]}>{lbl}</Text>
                  <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
                    value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.textSecondary} />
                </View>
              ))}
            </View>

            <TouchableOpacity style={[st.saveBtn, { backgroundColor: c.primary }]} onPress={save}>
              <Text style={st.saveBtnText}>{editing ? 'Сохранить' : 'Добавить в меню'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 6, padding: 12, borderRadius: 12, borderWidth: 1 },
  sumKcal: { fontSize: 18, fontWeight: '800' },
  sumMacros: { fontSize: 11, marginTop: 3 },
  aiBtn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, borderStyle: 'dashed' },
  aiBtnText: { fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 30, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 6 },
  mealTitle: { fontSize: 15, fontWeight: '700' },
  mealKcal: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 7 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkMark: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '600' },
  details: { fontSize: 11, marginTop: 3 },
  kcal: { fontSize: 16, fontWeight: '800' },
  kcalLbl: { fontSize: 10 },
  logBtn: { position: 'absolute', left: 20, bottom: 24, right: 90, borderRadius: 12, paddingVertical: 13, alignItems: 'center', elevation: 4 },
  logBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  fabText: { color: '#FFF', fontSize: 32, lineHeight: 35 },
  modalHeader: { height: 54, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  aiRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  aiSmall: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderStyle: 'dashed' },
  results: { marginTop: 10, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  resRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  miniLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  saveBtn: { marginTop: 18, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
