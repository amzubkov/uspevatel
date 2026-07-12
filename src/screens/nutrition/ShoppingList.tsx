import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../utils/theme';
import { todayStr, shiftDateStr } from '../../utils/date';
import { useNutritionPlanStore } from '../../store/nutritionPlanStore';
import { useShoppingStore } from '../../store/shoppingStore';

type Horizon = 7 | 30 | 0; // 0 = all future

const HORIZONS: { key: Horizon; label: string }[] = [
  { key: 7, label: '7 дней' },
  { key: 30, label: '30 дней' },
  { key: 0, label: 'Все' },
];

interface Aggregated {
  name: string;
  grams: number;
  portions: number;
  days: Set<string>;
}

function fmtRange(from: string, to: string | null): string {
  const short = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}.${m}`; };
  return to ? `${short(from)}–${short(to)}` : `с ${short(from)}`;
}

export function ShoppingList({ theme }: { theme: 'light' | 'dark' }) {
  const c = colors[theme];
  const items = useNutritionPlanStore((s) => s.items);
  const bought = useShoppingStore((s) => s.checked);
  const toggle = useShoppingStore((s) => s.toggle);
  const [horizon, setHorizon] = useState<Horizon>(7);

  const from = todayStr();
  const to = horizon === 0 ? null : shiftDateStr(from, horizon - 1);

  const planItems = useMemo(
    () => items.filter((i) => i.date >= from && (to === null || i.date <= to)),
    [items, from, to],
  );

  const plannedDays = useMemo(() => new Set(planItems.map((i) => i.date)).size, [planItems]);

  // Aggregate grams per ingredient across all selected days. Dishes without an
  // ingredient breakdown fall back to the dish itself as a single product.
  const products = useMemo(() => {
    const map = new Map<string, Aggregated>();
    const add = (rawName: string, grams: number, date: string) => {
      const name = rawName.trim();
      const key = name.toLocaleLowerCase('ru');
      if (!key || grams <= 0) return;
      const prev = map.get(key);
      if (prev) { prev.grams += grams; prev.portions += 1; prev.days.add(date); }
      else map.set(key, { name, grams, portions: 1, days: new Set([date]) });
    };
    for (const it of planItems) {
      if (it.ingredients && it.ingredients.length > 0) {
        for (const ing of it.ingredients) add(ing.name, ing.grams, it.date);
      } else {
        add(it.name, it.amountGrams, it.date);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [planItems]);

  const remaining = products.filter((p) => !bought.has(p.name.toLowerCase())).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.header, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[st.headerTitle, { color: c.text }]}>
          {products.length} продуктов · {plannedDays} {plannedDays === 1 ? 'день' : 'дней'}
        </Text>
        <Text style={[st.headerSub, { color: c.textSecondary }]}>
          {fmtRange(from, to)} · куплено {products.length - remaining}/{products.length}
        </Text>
        <View style={st.chips}>
          {HORIZONS.map((h) => {
            const active = horizon === h.key;
            return (
              <TouchableOpacity
                key={h.key}
                style={[st.chip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.card }]}
                onPress={() => setHorizon(h.key)}
              >
                <Text style={{ color: active ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{h.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 6, paddingBottom: 40 }}>
        {products.length === 0 ? (
          <View style={st.empty}>
            <Text style={{ fontSize: 44, marginBottom: 8 }}>🛒</Text>
            <Text style={[st.emptyTitle, { color: c.text }]}>Список пуст</Text>
            <Text style={[st.emptyText, { color: c.textSecondary }]}>Запланируйте меню на будущие дни в табе «Меню» — продукты соберутся сюда автоматически.</Text>
          </View>
        ) : (
          products.map((p) => {
            const done = bought.has(p.name.toLowerCase());
            return (
              <TouchableOpacity key={p.name} style={[st.row, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => toggle(p.name)}>
                <View style={[st.check, { borderColor: done ? c.primary : c.border, backgroundColor: done ? c.primary : 'transparent' }]}>
                  {done && <Text style={st.checkMark}>✓</Text>}
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[st.name, { color: c.text, textDecorationLine: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1 }]} numberOfLines={2}>{p.name}</Text>
                  {p.portions > 1 && <Text style={[st.sub, { color: c.textSecondary }]}>{p.portions} порц. · {p.days.size} дн.</Text>}
                </View>
                <Text style={[st.grams, { color: c.text, opacity: done ? 0.5 : 1 }]}>{Math.round(p.grams)} г</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { marginHorizontal: 12, marginTop: 6, padding: 12, borderRadius: 12, borderWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 2 },
  chips: { flexDirection: 'row', gap: 7, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 7 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkMark: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 11, marginTop: 2 },
  grams: { fontSize: 15, fontWeight: '800' },
});
