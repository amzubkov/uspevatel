import React, { useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { colors } from '../../utils/theme';
import { todayStr } from '../../utils/date';
import { DatePickerField } from '../../components/DatePickerField';
import { useMoneyStore } from '../../store/moneyStore';
import {
  useRecurringPaymentStore, RecurringPayment, Recurrence,
} from '../../store/recurringPaymentStore';

const CURRENCIES = ['RUB', 'EUR', 'USD', 'USDT'];
const CUR_SYMBOL: Record<string, string> = { RUB: '₽', EUR: '€', USD: '$', USDT: '₮' };

const RECURRENCES: { key: Recurrence; label: string }[] = [
  { key: 'once', label: 'Разово' },
  { key: 'weekly', label: 'Еженедельно' },
  { key: 'monthly', label: 'Ежемесячно' },
  { key: 'quarterly', label: 'Раз в 3 мес' },
  { key: 'semiannual', label: 'Раз в полгода' },
  { key: 'yearly', label: 'Ежегодно' },
];
const RECURRENCE_SHORT: Record<Recurrence, string> = { once: 'разово', weekly: '/нед', monthly: '/мес', quarterly: '/3мес', semiannual: '/6мес', yearly: '/год' };

function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

function dueLabel(dueDate: string): { text: string; color: string } {
  const diff = daysBetween(todayStr(), dueDate);
  if (diff < 0) return { text: `просрочено ${-diff} дн`, color: '#EF4444' };
  if (diff === 0) return { text: 'сегодня', color: '#F59E0B' };
  if (diff === 1) return { text: 'завтра', color: '#F59E0B' };
  if (diff <= 7) return { text: `через ${diff} дн`, color: '#F59E0B' };
  return { text: `через ${diff} дн`, color: '#22C55E' };
}

function fmtDue(dueDate: string): string {
  const [, m, d] = dueDate.split('-');
  return `${d}.${m}`;
}

// Normalize a recurring payment to its average monthly cost (once = not recurring).
const MONTHLY_FACTOR: Record<Recurrence, number> = {
  once: 0, weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12,
};

function parseAmount(raw: string): number | null {
  const v = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

interface FormState {
  name: string;
  amount: string;
  currency: string;
  dueDate: string;
  recurrence: Recurrence;
  accountId: string | null;
  category: string;
  notes: string;
}

function emptyForm(): FormState {
  return { name: '', amount: '', currency: 'RUB', dueDate: todayStr(), recurrence: 'monthly', accountId: null, category: '', notes: '' };
}

export function UpcomingPayments({ theme }: { theme: 'light' | 'dark' }) {
  const c = colors[theme];
  const accounts = useMoneyStore((s) => s.accounts);
  const payments = useRecurringPaymentStore((s) => s.payments);
  const addPayment = useRecurringPaymentStore((s) => s.addPayment);
  const updatePayment = useRecurringPaymentStore((s) => s.updatePayment);
  const removePayment = useRecurringPaymentStore((s) => s.removePayment);
  const markPaid = useRecurringPaymentStore((s) => s.markPaid);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringPayment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const active = useMemo(
    () => payments.filter((p) => p.active).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [payments],
  );

  // Sum of payments due within the next 30 days, grouped by currency.
  const soonTotals = useMemo(() => {
    const horizon = 30;
    const totals: Record<string, number> = {};
    for (const p of active) {
      if (daysBetween(todayStr(), p.dueDate) <= horizon) {
        totals[p.currency] = (totals[p.currency] || 0) + p.amount;
      }
    }
    return totals;
  }, [active]);

  // Average monthly load from recurring payments, grouped by currency.
  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of active) {
      const factor = MONTHLY_FACTOR[p.recurrence];
      if (factor > 0) totals[p.currency] = (totals[p.currency] || 0) + p.amount * factor;
    }
    return totals;
  }, [active]);

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setShowForm(true); };

  const openEdit = (p: RecurringPayment) => {
    setEditing(p);
    setForm({
      name: p.name, amount: String(p.amount), currency: p.currency, dueDate: p.dueDate,
      recurrence: p.recurrence, accountId: p.accountId, category: p.category, notes: p.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    const name = form.name.trim();
    const amount = parseAmount(form.amount);
    if (!name) { Alert.alert('Платёж', 'Укажите название'); return; }
    if (amount == null) { Alert.alert('Платёж', 'Сумма должна быть больше нуля'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) { Alert.alert('Платёж', 'Укажите дату'); return; }
    const input = {
      name, amount, currency: form.currency, dueDate: form.dueDate,
      recurrence: form.recurrence, accountId: form.accountId, category: form.category.trim(), notes: form.notes.trim(),
    };
    try {
      if (editing) await updatePayment(editing.id, input);
      else await addPayment(input);
      setShowForm(false);
      setEditing(null);
    } catch (e: any) {
      Alert.alert('Не удалось сохранить', String(e?.message || e));
    }
  };

  const onPaid = (p: RecurringPayment) => {
    const acc = accounts.find((a) => a.id === p.accountId);
    if (acc) {
      Alert.alert('Оплачено', `Создать расход ${p.amount} ${CUR_SYMBOL[p.currency] || p.currency} по счёту «${acc.name}»?`, [
        { text: 'Без транзакции', onPress: () => markPaid(p.id, false) },
        { text: 'Создать расход', onPress: () => markPaid(p.id, true) },
        { text: 'Отмена', style: 'cancel' },
      ]);
    } else {
      markPaid(p.id, false);
    }
  };

  const confirmRemove = (p: RecurringPayment) => {
    Alert.alert('Удалить платёж?', p.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removePayment(p.id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      {(Object.keys(soonTotals).length > 0 || Object.keys(monthlyTotals).length > 0) && (
        <View style={[st.summary, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={st.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={[st.summaryLabel, { color: c.textSecondary }]}>К оплате за 30 дней</Text>
              <Text style={[st.summaryValue, { color: c.text }]}>
                {Object.entries(soonTotals).map(([cur, sum]) => `${Math.round(sum)} ${CUR_SYMBOL[cur] || cur}`).join('  ·  ') || '—'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.summaryLabel, { color: c.textSecondary }]}>В среднем в месяц</Text>
              <Text style={[st.summaryValue, { color: c.text }]}>
                {Object.entries(monthlyTotals).map(([cur, sum]) => `${Math.round(sum)} ${CUR_SYMBOL[cur] || cur}`).join('  ·  ') || '—'}
              </Text>
            </View>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }}>
        {active.length === 0 ? (
          <View style={st.empty}>
            <Text style={st.emptyIcon}>📅</Text>
            <Text style={[st.emptyTitle, { color: c.text }]}>Нет предстоящих платежей</Text>
            <Text style={[st.emptyText, { color: c.textSecondary }]}>Добавьте регулярные счета: аренда, подписки, кредиты.</Text>
          </View>
        ) : (
          active.map((p) => {
            const due = dueLabel(p.dueDate);
            const acc = accounts.find((a) => a.id === p.accountId);
            return (
              <TouchableOpacity
                key={p.id}
                style={[st.row, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => openEdit(p)}
                onLongPress={() => confirmRemove(p)}
                delayLongPress={450}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[st.rowName, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
                  <View style={st.rowMeta}>
                    <Text style={[st.rowDue, { color: due.color }]}>{fmtDue(p.dueDate)} · {due.text}</Text>
                    <Text style={[st.rowSub, { color: c.textSecondary }]}> · {RECURRENCE_SHORT[p.recurrence]}</Text>
                  </View>
                  {acc ? <Text style={[st.rowSub, { color: c.textSecondary }]} numberOfLines={1}>{acc.name}{p.category ? ` · ${p.category}` : ''}</Text> : (p.category ? <Text style={[st.rowSub, { color: c.textSecondary }]}>{p.category}</Text> : null)}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[st.rowAmount, { color: c.text }]}>{Math.round(p.amount)} {CUR_SYMBOL[p.currency] || p.currency}</Text>
                  <TouchableOpacity style={[st.paidBtn, { backgroundColor: c.primary }]} onPress={() => onPaid(p)}>
                    <Text style={st.paidBtnText}>Оплачено</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={[st.fab, { backgroundColor: c.primary }]} onPress={openAdd}>
        <Text style={st.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={[st.formTitle, { color: c.text }]}>{editing ? 'Изменить платёж' : 'Новый платёж'}</Text>

            <Text style={[st.label, { color: c.textSecondary }]}>Название</Text>
            <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
              value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              placeholder="Аренда, Netflix, кредит…" placeholderTextColor={c.textSecondary} autoFocus={!editing} />

            <Text style={[st.label, { color: c.textSecondary }]}>Сумма</Text>
            <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 20, fontWeight: '700' }]}
              value={form.amount} onChangeText={(amount) => setForm((f) => ({ ...f, amount }))}
              placeholder="0" placeholderTextColor={c.textSecondary} keyboardType="decimal-pad" />

            <Text style={[st.label, { color: c.textSecondary }]}>Валюта</Text>
            <View style={st.chipRow}>
              {CURRENCIES.map((cur) => (
                <TouchableOpacity key={cur}
                  style={[st.chip, { backgroundColor: form.currency === cur ? c.primary : c.card, borderColor: form.currency === cur ? c.primary : c.border }]}
                  onPress={() => setForm((f) => ({ ...f, currency: cur }))}>
                  <Text style={{ color: form.currency === cur ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{CUR_SYMBOL[cur]} {cur}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[st.label, { color: c.textSecondary }]}>Дата платежа</Text>
            <DatePickerField value={form.dueDate} onChange={(dueDate) => setForm((f) => ({ ...f, dueDate }))}
              textColor={c.text} secondaryColor={c.textSecondary} borderColor={c.border} backgroundColor={c.card} />

            <Text style={[st.label, { color: c.textSecondary }]}>Повтор</Text>
            <View style={st.chipRow}>
              {RECURRENCES.map((r) => (
                <TouchableOpacity key={r.key}
                  style={[st.chip, { backgroundColor: form.recurrence === r.key ? c.primary : c.card, borderColor: form.recurrence === r.key ? c.primary : c.border }]}
                  onPress={() => setForm((f) => ({ ...f, recurrence: r.key }))}>
                  <Text style={{ color: form.recurrence === r.key ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[st.label, { color: c.textSecondary }]}>Счёт (необязательно)</Text>
            <View style={st.chipRow}>
              <TouchableOpacity
                style={[st.chip, { backgroundColor: !form.accountId ? c.primary : c.card, borderColor: !form.accountId ? c.primary : c.border }]}
                onPress={() => setForm((f) => ({ ...f, accountId: null }))}>
                <Text style={{ color: !form.accountId ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>—</Text>
              </TouchableOpacity>
              {accounts.map((a) => (
                <TouchableOpacity key={a.id}
                  style={[st.chip, { backgroundColor: form.accountId === a.id ? c.primary : c.card, borderColor: form.accountId === a.id ? c.primary : c.border }]}
                  onPress={() => setForm((f) => ({ ...f, accountId: a.id, currency: a.currency }))}>
                  <Text style={{ color: form.accountId === a.id ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[st.label, { color: c.textSecondary }]}>Категория (необязательно)</Text>
            <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
              value={form.category} onChangeText={(category) => setForm((f) => ({ ...f, category }))}
              placeholder="Жильё, подписки…" placeholderTextColor={c.textSecondary} />

            <Text style={[st.label, { color: c.textSecondary }]}>Заметка</Text>
            <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, minHeight: 60 }]}
              value={form.notes} onChangeText={(notes) => setForm((f) => ({ ...f, notes }))}
              placeholder="Необязательно" placeholderTextColor={c.textSecondary} multiline textAlignVertical="top" />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity style={[st.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={save}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>{editing ? 'Сохранить' : 'Добавить'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={() => { setShowForm(false); setEditing(null); }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  summary: { marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  rowDue: { fontSize: 12, fontWeight: '600' },
  rowSub: { fontSize: 11, marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '800' },
  paidBtn: { marginTop: 6, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  paidBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  fabText: { color: '#FFF', fontSize: 30, lineHeight: 33, fontWeight: '400' },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});
