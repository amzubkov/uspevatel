import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, Alert } from 'react-native';
import { useMoneyStore, Account, Transaction, BankType } from '../store/moneyStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { DatePickerField } from '../components/DatePickerField';
import { UpcomingPayments } from './money/UpcomingPayments';
import { parseBankFile, parseBankFileXlsx, BANK_LABELS, ParsedTransaction } from '../services/bankParsers';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFS from 'expo-file-system/legacy';
import * as PdfTextExtract from 'expo-pdf-text-extract';

const CURRENCIES = ['RUB', 'EUR', 'USD', 'USDT'];
const ACC_COLORS = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#6B7280'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function dayOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
}
const DATE_QUICK = [
  { key: 'today', label: 'Сегодня', date: dayOffset(0) },
  { key: 'yesterday', label: 'Вчера', date: dayOffset(1) },
  { key: 'before', label: 'Пзвчера', date: dayOffset(2) },
];

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}
function fmtDateNum(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}
const CUR_SYMBOL: Record<string, string> = { RUB: '₽', EUR: '€', USD: '$', USDT: '₮' };
function curSym(c: string) { return CUR_SYMBOL[c] || c; }

function fmtAmount(n: number, currency: string): string {
  const abs = Math.abs(n);
  const s = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2);
  const parts = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : n > 0 ? '+' : ''}${parts} ${curSym(currency)}`;
}

function fmtBalance(n: number, currency: string): string {
  const abs = Math.abs(n);
  const s = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2);
  const parts = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${parts} ${curSym(currency)}`;
}

// Global ref to trigger add account from navigation header
let _showAddAccount: (() => void) | null = null;
export function triggerAddAccount() { _showAddAccount?.(); }

export function MoneyScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const { accounts, addAccount, updateAccount, removeAccount, addTransaction, updateTransaction, removeTransaction, addCorrection, getCorrection, getCorrectionDate, getBalance, getTransactionsForAccount, getLastTxDate, getAllCategories, getAllTags } = useMoneyStore();

  const [mainTab, setMainTab] = useState<'accounts' | 'upcoming'>('accounts');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);

  useEffect(() => {
    _showAddAccount = () => setShowAccountForm(true);
    return () => { _showAddAccount = null; };
  }, []);
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [periodFilter, setPeriodFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [overviewPeriod, setOverviewPeriod] = useState<'month' | 'year' | 'all'>('month');
  const [categorizingMode, setCategorizingMode] = useState(false);
  const [viewingCategory, setViewingCategory] = useState<string | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [newCatInput, setNewCatInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionBalance, setCorrectionBalance] = useState('');

  // Account form
  const [accName, setAccName] = useState('');
  const [accCurrency, setAccCurrency] = useState('RUB');
  const [accColor, setAccColor] = useState<string | undefined>(undefined);
  const [accBank, setAccBank] = useState<BankType>(undefined);

  // Transaction form
  const [txAmount, setTxAmount] = useState('');
  const [txMode, setTxMode] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [txTargetAccountId, setTxTargetAccountId] = useState<string | null>(null);
  const [txTargetAmount, setTxTargetAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().substring(0, 10));
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [txCategory, setTxCategory] = useState('');
  const [txTag, setTxTag] = useState('');
  const [txComment, setTxComment] = useState('');

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === selectedAccountId), [accounts, selectedAccountId]);
  const accountTxs = useMemo(() => selectedAccountId ? getTransactionsForAccount(selectedAccountId) : [], [selectedAccountId, useMoneyStore((s) => s.transactions)]);

  const { duplicateIds, duplicateGroups } = useMemo(() => {
    const ids = new Set<string>();
    const groups = new Map<string, Transaction[]>();
    for (const tx of accountTxs) {
      const key = `${tx.accountId}|${tx.date}|${tx.amount}|${tx.category}|${tx.tag}|${tx.comment}`;
      const arr = groups.get(key) || [];
      arr.push(tx);
      groups.set(key, arr);
    }
    const dupGroups: Transaction[][] = [];
    for (const arr of groups.values()) {
      if (arr.length > 1) {
        for (const tx of arr) ids.add(tx.id);
        dupGroups.push(arr);
      }
    }
    return { duplicateIds: ids, duplicateGroups: dupGroups };
  }, [accountTxs]);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const filteredTxs = useMemo(() => {
    let txs = accountTxs;
    if (periodFilter) {
      const now = new Date();
      let cutoff: string;
      if (periodFilter === 'today') cutoff = now.toISOString().substring(0, 10);
      else if (periodFilter === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); cutoff = d.toISOString().substring(0, 10); }
      else if (periodFilter === 'month') { const d = new Date(now); d.setMonth(d.getMonth() - 1); cutoff = d.toISOString().substring(0, 10); }
      else if (periodFilter === 'year') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); cutoff = d.toISOString().substring(0, 10); }
      else cutoff = '0000';
      txs = txs.filter((t) => t.date >= cutoff);
    }
    if (categoryFilter) txs = txs.filter((t) => t.category === categoryFilter);
    return txs;
  }, [accountTxs, periodFilter, categoryFilter]);

  const accountCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const t of accountTxs) if (t.category && t.category !== 'Коррекция') cats.add(t.category);
    return [...cats].sort();
  }, [accountTxs]);

  const existingCategories = useMemo(() => getAllCategories(), [useMoneyStore((s) => s.transactions)]);
  const existingTags = useMemo(() => getAllTags(), [useMoneyStore((s) => s.transactions)]);

  const allTransactions = useMoneyStore((s) => s.transactions);
  const overviewData = useMemo(() => {
    const now = new Date();
    let cutoff = '0000';
    if (overviewPeriod === 'month') {
      cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (overviewPeriod === 'year') {
      cutoff = `${now.getFullYear()}-01-01`;
    }
    const txs = allTransactions.filter((t) => !t.isCorrection && t.amount < 0 && t.date >= cutoff);
    const catMap = new Map<string, { total: number; currency: string }[]>();
    for (const t of txs) {
      const cat = t.category || 'Без категории';
      const acc = accounts.find((a) => a.id === t.accountId);
      const cur = acc?.currency || 'RUB';
      let arr = catMap.get(cat);
      if (!arr) { arr = []; catMap.set(cat, arr); }
      let entry = arr.find((e) => e.currency === cur);
      if (!entry) { entry = { total: 0, currency: cur }; arr.push(entry); }
      entry.total += Math.abs(t.amount);
    }
    return [...catMap.entries()]
      .map(([cat, totals]) => ({ cat, totals }))
      .sort((a, b) => {
        const sumA = a.totals.reduce((s, t) => s + t.total, 0);
        const sumB = b.totals.reduce((s, t) => s + t.total, 0);
        return sumB - sumA;
      });
  }, [allTransactions, accounts, overviewPeriod]);

  const uncategorizedTxs = useMemo(() =>
    allTransactions.filter((t) => !t.isCorrection && !t.category).sort((a, b) => b.date.localeCompare(a.date)),
    [allTransactions],
  );
  const uncategorizedCount = uncategorizedTxs.length;

  const resetAccountForm = () => {
    setAccName(''); setAccCurrency('RUB'); setAccColor(undefined); setAccBank(undefined); setShowAccountForm(false); setEditingAccountId(null);
  };

  const handleSaveAccount = async () => {
    if (!accName.trim()) { Alert.alert('Введите название счёта'); return; }
    if (editingAccountId) {
      await updateAccount(editingAccountId, { name: accName.trim(), currency: accCurrency, color: accColor, bank: accBank });
    } else {
      await addAccount(accName.trim(), accCurrency, accColor, accBank);
    }
    resetAccountForm();
  };

  const handleEditAccount = (acc: Account) => {
    setEditingAccountId(acc.id);
    setAccName(acc.name);
    setAccCurrency(acc.currency);
    setAccColor(acc.color);
    setAccBank(acc.bank);
    setShowAccountForm(true);
  };

  const handleDeleteAccount = (acc: Account) => {
    Alert.alert('Удалить счёт?', `"${acc.name}" и все транзакции будут удалены`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        if (selectedAccountId === acc.id) setSelectedAccountId(null);
        removeAccount(acc.id);
      }},
    ]);
  };

  const { clearTransactions } = useMoneyStore();

  const handleClearTransactions = (acc: Account) => {
    const count = getTransactionsForAccount(acc.id).length;
    Alert.alert('Удалить все транзакции?', `Счёт «${acc.name}»: ${count} транзакций`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить все', style: 'destructive', onPress: () => {
        Alert.alert('Точно удалить?', `Все ${count} транзакций будут удалены безвозвратно`, [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Да, удалить всё', style: 'destructive', onPress: () => clearTransactions(acc.id) },
        ]);
      }},
    ]);
  };

  const handleAccountLongPress = (acc: Account) => {
    Alert.alert(acc.name, '', [
      { text: 'Редактировать', onPress: () => handleEditAccount(acc) },
      { text: 'Удалить все транзакции', style: 'destructive', onPress: () => handleClearTransactions(acc) },
      { text: 'Удалить счёт', style: 'destructive', onPress: () => handleDeleteAccount(acc) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  const resetTxForm = () => {
    setTxAmount(''); setTxMode('expense'); setTxTargetAccountId(null); setTxTargetAmount('');
    setTxDate(new Date().toISOString().substring(0, 10)); setShowCustomDate(false);
    setTxCategory(''); setTxTag(''); setTxComment(''); setShowTxForm(false); setEditingTxId(null);
  };

  const startEditTx = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setTxAmount(String(Math.abs(tx.amount)));
    setTxMode(tx.amount >= 0 ? 'income' : 'expense');
    setTxDate(tx.date);
    setTxCategory(tx.category);
    setTxTag(tx.tag);
    setTxComment(tx.comment);
    setTxTargetAccountId(null);
    setTxTargetAmount('');
    setShowTxForm(true);
  };

  const targetAccount = useMemo(() => accounts.find((a) => a.id === txTargetAccountId), [accounts, txTargetAccountId]);
  const needsConversion = txMode === 'transfer' && selectedAccount && targetAccount && selectedAccount.currency !== targetAccount.currency;

  const handleSaveTx = async () => {
    const num = parseFloat(txAmount.replace(',', '.'));
    if (!num || !selectedAccountId) { Alert.alert('Введите сумму'); return; }

    if (editingTxId) {
      await updateTransaction(editingTxId, {
        amount: txMode === 'expense' ? -Math.abs(num) : Math.abs(num),
        date: txDate,
        category: txCategory.trim(),
        tag: txTag.trim(),
        comment: txComment.trim(),
      });
      resetTxForm();
      return;
    }

    if (txMode === 'transfer') {
      if (!txTargetAccountId) { Alert.alert('Выберите счёт назначения'); return; }
      if (txTargetAccountId === selectedAccountId) { Alert.alert('Нельзя перевести на тот же счёт'); return; }
      const targetNum = needsConversion ? parseFloat(txTargetAmount.replace(',', '.')) : num;
      if (!targetNum) { Alert.alert('Введите сумму в валюте получателя'); return; }
      const comment = txComment.trim() || `→ ${targetAccount?.name}`;
      const commentBack = txComment.trim() || `← ${selectedAccount?.name}`;
      await addTransaction({ accountId: selectedAccountId, amount: -Math.abs(num), date: txDate, category: 'Перевод', tag: txTag.trim(), comment });
      await addTransaction({ accountId: txTargetAccountId, amount: Math.abs(targetNum), date: txDate, category: 'Перевод', tag: txTag.trim(), comment: commentBack });
    } else {
      await addTransaction({
        accountId: selectedAccountId,
        amount: txMode === 'expense' ? -Math.abs(num) : Math.abs(num),
        date: txDate,
        category: txCategory.trim(),
        tag: txTag.trim(),
        comment: txComment.trim(),
      });
    }
    resetTxForm();
  };

  const handleCopyTx = (tx: Transaction) => {
    setTxAmount(String(Math.abs(tx.amount)));
    setTxMode(tx.amount >= 0 ? 'income' : 'expense');
    setTxDate(new Date().toISOString().substring(0, 10));
    setTxCategory(tx.category);
    setTxTag(tx.tag);
    setTxComment(tx.comment);
    setTxTargetAccountId(null);
    setTxTargetAmount('');
    setEditingTxId(null);
    setShowCustomDate(false);
    setShowTxForm(true);
  };

  const toggleDeleteSelect = (id: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const enterDeleteMode = (firstId: string) => {
    setDeleteMode(true);
    setSelectedForDelete(new Set([firstId]));
  };

  const confirmDeleteSelected = () => {
    const count = selectedForDelete.size;
    Alert.alert(`Удалить ${count} транзакций?`, '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        for (const id of selectedForDelete) removeTransaction(id);
        setDeleteMode(false);
        setSelectedForDelete(new Set());
      }},
    ]);
  };

  const cancelDeleteMode = () => {
    setDeleteMode(false);
    setSelectedForDelete(new Set());
  };

  const handleTxLongPress = (tx: Transaction) => {
    if (deleteMode) return;
    Alert.alert('Транзакция', `${fmtAmount(tx.amount, selectedAccount?.currency || '')} ${tx.comment}`, [
      { text: 'Копировать', onPress: () => handleCopyTx(tx) },
      { text: 'Выбрать для удаления', style: 'destructive', onPress: () => enterDeleteMode(tx.id) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  // ── Account form ──
  if (showAccountForm) {
    return (
      <View style={[st.container, { backgroundColor: c.background }]}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={[st.formTitle, { color: c.text }]}>{editingAccountId ? 'Редактировать счёт' : 'Новый счёт'}</Text>
          <Text style={[st.label, { color: c.textSecondary }]}>Название</Text>
          <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={accName} onChangeText={setAccName} placeholder="Tinkoff, Наличные..." placeholderTextColor={c.textSecondary} autoFocus />
          <Text style={[st.label, { color: c.textSecondary }]}>Валюта</Text>
          <View style={st.chipRow}>
            {CURRENCIES.map((cur) => (
              <TouchableOpacity key={cur}
                style={[st.chip, { backgroundColor: accCurrency === cur ? c.primary : c.card, borderColor: accCurrency === cur ? c.primary : c.border }]}
                onPress={() => setAccCurrency(cur)}>
                <Text style={{ color: accCurrency === cur ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{curSym(cur)} {cur}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[st.label, { color: c.textSecondary }]}>Цвет</Text>
          <View style={st.chipRow}>
            <TouchableOpacity
              style={[st.colorDot, { backgroundColor: c.card, borderColor: c.border, borderWidth: !accColor ? 2 : 1 }]}
              onPress={() => setAccColor(undefined)}>
              <Text style={{ fontSize: 10, color: c.textSecondary }}>—</Text>
            </TouchableOpacity>
            {ACC_COLORS.map((clr) => (
              <TouchableOpacity key={clr}
                style={[st.colorDot, { backgroundColor: clr, borderColor: accColor === clr ? '#FFF' : clr, borderWidth: accColor === clr ? 3 : 1 }]}
                onPress={() => setAccColor(clr)} />
            ))}
          </View>
          <Text style={[st.label, { color: c.textSecondary }]}>Банк (для импорта выписок)</Text>
          <View style={st.chipRow}>
            <TouchableOpacity
              style={[st.chip, { backgroundColor: !accBank ? c.primary : c.card, borderColor: !accBank ? c.primary : c.border }]}
              onPress={() => setAccBank(undefined)}>
              <Text style={{ color: !accBank ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>—</Text>
            </TouchableOpacity>
            {(['revolut', 'revolut_crypto', 'eurobank', 'bog', 'solo', 'kolo'] as BankType[]).map((b) => (
              <TouchableOpacity key={b}
                style={[st.chip, { backgroundColor: accBank === b ? c.primary : c.card, borderColor: accBank === b ? c.primary : c.border }]}
                onPress={() => setAccBank(b)}>
                <Text style={{ color: accBank === b ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{BANK_LABELS[b!]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={st.formBtns}>
            <TouchableOpacity style={[st.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSaveAccount}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>{editingAccountId ? 'Сохранить' : 'Добавить'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.btn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={resetAccountForm}>
              <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Transaction form ──
  if (showTxForm && selectedAccountId) {
    return (
      <KeyboardAvoidingView style={[st.container, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={[st.formTitle, { color: c.text }]}>{editingTxId ? 'Редактировать' : 'Новая транзакция'}</Text>
          <Text style={[st.formSubtitle, { color: c.textSecondary }]}>{selectedAccount?.name} ({curSym(selectedAccount?.currency || '')})</Text>

          <View style={st.chipRow}>
            <TouchableOpacity style={[st.chip, { flex: 1, backgroundColor: txMode === 'expense' ? '#EF4444' : c.card, borderColor: txMode === 'expense' ? '#EF4444' : c.border }]}
              onPress={() => setTxMode('expense')}>
              <Text style={{ color: txMode === 'expense' ? '#FFF' : c.text, fontWeight: '700', fontSize: 12 }}>− Расход</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.chip, { flex: 1, backgroundColor: txMode === 'income' ? '#22C55E' : c.card, borderColor: txMode === 'income' ? '#22C55E' : c.border }]}
              onPress={() => setTxMode('income')}>
              <Text style={{ color: txMode === 'income' ? '#FFF' : c.text, fontWeight: '700', fontSize: 12 }}>+ Доход</Text>
            </TouchableOpacity>
            {!editingTxId && (
              <TouchableOpacity style={[st.chip, { flex: 1, backgroundColor: txMode === 'transfer' ? '#3B82F6' : c.card, borderColor: txMode === 'transfer' ? '#3B82F6' : c.border }]}
                onPress={() => setTxMode('transfer')}>
                <Text style={{ color: txMode === 'transfer' ? '#FFF' : c.text, fontWeight: '700', fontSize: 12 }}>↔ Перевод</Text>
              </TouchableOpacity>
            )}
          </View>

          {txMode === 'transfer' && (
            <>
              <Text style={[st.label, { color: c.textSecondary }]}>На счёт</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {accounts.filter((a) => a.id !== selectedAccountId).map((a) => (
                  <TouchableOpacity key={a.id}
                    style={[st.chip, { marginRight: 6, backgroundColor: txTargetAccountId === a.id ? '#3B82F6' : c.card, borderColor: txTargetAccountId === a.id ? '#3B82F6' : c.border }]}
                    onPress={() => setTxTargetAccountId(a.id)}>
                    <Text style={{ color: txTargetAccountId === a.id ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{a.name} ({curSym(a.currency)})</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <Text style={[st.label, { color: c.textSecondary }]}>Сумма</Text>
          <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 24, fontWeight: '700' }]}
            value={txAmount} onChangeText={setTxAmount} placeholder="0" placeholderTextColor={c.textSecondary}
            keyboardType="decimal-pad" autoFocus />

          {needsConversion && (
            <>
              <Text style={[st.label, { color: c.textSecondary }]}>Сумма в {curSym(targetAccount?.currency || '')}</Text>
              <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 24, fontWeight: '700' }]}
                value={txTargetAmount} onChangeText={setTxTargetAmount} placeholder="0" placeholderTextColor={c.textSecondary}
                keyboardType="decimal-pad" />
            </>
          )}

          <Text style={[st.label, { color: c.textSecondary }]}>Дата</Text>
          <View style={st.chipRow}>
            {DATE_QUICK.map((dq) => {
              const active = txDate === dq.date;
              return (
                <TouchableOpacity key={dq.key}
                  style={[st.chip, { flex: 1, backgroundColor: active ? c.primary : c.card, borderColor: active ? c.primary : c.border }]}
                  onPress={() => { setTxDate(dq.date); setShowCustomDate(false); }}>
                  <Text style={{ color: active ? '#FFF' : c.text, fontSize: 11, fontWeight: '600' }}>{dq.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[st.chip, { flex: 1, backgroundColor: showCustomDate ? c.primary : c.card, borderColor: showCustomDate ? c.primary : c.border }]}
              onPress={() => setShowCustomDate(true)}>
              <Text style={{ color: showCustomDate ? '#FFF' : c.text, fontSize: 11, fontWeight: '600' }}>Другая</Text>
            </TouchableOpacity>
          </View>
          {showCustomDate && (
            <DatePickerField value={txDate} onChange={setTxDate} label=""
              textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} backgroundColor={c.card} />
          )}

          {txMode !== 'transfer' && (
            <>
              <Text style={[st.label, { color: c.textSecondary }]}>Категория</Text>
              <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
                value={txCategory} onChangeText={setTxCategory} placeholder="Еда, Транспорт..." placeholderTextColor={c.textSecondary} />
              {existingCategories.length > 0 && !txCategory && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {existingCategories.map((cat) => (
                    <TouchableOpacity key={cat} style={[st.chip, { backgroundColor: c.card, borderColor: c.border, marginRight: 4 }]}
                      onPress={() => setTxCategory(cat)}>
                      <Text style={{ color: c.text, fontSize: 11 }}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          )}

          <Text style={[st.label, { color: c.textSecondary }]}>Тег</Text>
          <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={txTag} onChangeText={setTxTag} placeholder="Необязательно" placeholderTextColor={c.textSecondary} />
          {existingTags.length > 0 && !txTag && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {existingTags.map((tag) => (
                <TouchableOpacity key={tag} style={[st.chip, { backgroundColor: c.card, borderColor: c.border, marginRight: 4 }]}
                  onPress={() => setTxTag(tag)}>
                  <Text style={{ color: c.text, fontSize: 11 }}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={[st.label, { color: c.textSecondary }]}>Комментарий</Text>
          <TextInput style={[st.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={txComment} onChangeText={setTxComment} placeholder="Описание" placeholderTextColor={c.textSecondary} />

          <View style={st.formBtns}>
            <TouchableOpacity style={[st.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSaveTx}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>{editingTxId ? 'Сохранить' : 'Добавить'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.btn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={resetTxForm}>
              <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
            </TouchableOpacity>
          </View>
          {editingTxId && (
            <TouchableOpacity style={[st.btn, { marginTop: 8 }]} onPress={() => {
              Alert.alert('Удалить транзакцию?', '', [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: () => { removeTransaction(editingTxId); resetTxForm(); } },
              ]);
            }}>
              <Text style={{ color: c.danger, fontWeight: '600', fontSize: 14 }}>Удалить транзакцию</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const handleImportFile = async () => {
    if (!selectedAccountId || !selectedAccount?.bank) return;
    try {
      const isPdf = selectedAccount.bank === 'eurobank';
      const isXlsx = selectedAccount.bank === 'solo';
      const fileType = isPdf ? ['application/pdf', '*/*'] : isXlsx ? ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'] : ['text/csv', 'text/comma-separated-values', '*/*'];
      const result = await DocumentPicker.getDocumentAsync({ type: fileType, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      let parsed: ParsedTransaction[];
      if (isPdf) {
        const extracted = await PdfTextExtract.extractText(uri);
        const text = Array.isArray(extracted) ? extracted.join('\n') : String(extracted);
        parsed = parseBankFile(text, selectedAccount.bank);
      } else if (isXlsx) {
        const base64 = await LegacyFS.readAsStringAsync(uri, { encoding: LegacyFS.EncodingType.Base64 });
        parsed = await parseBankFileXlsx(base64, selectedAccount.bank, selectedAccount.currency);
      } else {
        const content = await LegacyFS.readAsStringAsync(uri, { encoding: LegacyFS.EncodingType.UTF8 });
        parsed = parseBankFile(content, selectedAccount.bank, selectedAccount.currency);
      }
      if (parsed.length === 0) {
        Alert.alert('Импорт', 'Не удалось найти транзакции в файле');
        return;
      }
      // Filter out duplicates (same date + amount + comment)
      const existingKeys = new Set(
        getTransactionsForAccount(selectedAccountId).map((t) => `${t.date}|${t.amount}|${t.comment}`)
      );
      const newTxs = parsed.filter((t) => !existingKeys.has(`${t.date}|${t.amount}|${t.comment}`));
      if (newTxs.length === 0) {
        Alert.alert('Импорт', `Найдено ${parsed.length} транзакций, все уже импортированы`);
        return;
      }
      Alert.alert(
        'Импорт',
        `Найдено ${parsed.length} транзакций, новых: ${newTxs.length}`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: `Импорт ${newTxs.length}`, onPress: async () => {
            for (const t of newTxs) {
              await addTransaction({
                accountId: selectedAccountId,
                amount: t.amount,
                date: t.date,
                timestamp: t.timestamp,
                category: t.category,
                tag: t.tag,
                comment: t.comment,
              });
            }
            Alert.alert('Готово', `Импортировано ${newTxs.length} транзакций`);
          }},
        ]
      );
    } catch (e: any) {
      Alert.alert('Ошибка импорта', String(e?.message || e));
    }
  };

  // ── Category transactions view ──
  if (viewingCategory) {
    const isUncategorized = viewingCategory === 'Без категории';
    const catTxs = allTransactions
      .filter((t) => {
        if (!t.isCorrection && t.date >= (() => {
          const now = new Date();
          if (overviewPeriod === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          if (overviewPeriod === 'year') return `${now.getFullYear()}-01-01`;
          return '0000';
        })()) {
          return isUncategorized ? !t.category : t.category === viewingCategory;
        }
        return false;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    const handleCatViewReassign = async (tx: Transaction, newCategory: string) => {
      const comment = tx.comment.trim();
      const similar = comment ? catTxs.filter((t) => t.comment.trim() === comment) : [tx];
      if (similar.length > 1) {
        Alert.alert('Применить ко всем?', `«${comment.substring(0, 40)}» → ${newCategory}\n\n${similar.length} транзакций`, [
          { text: 'Только эту', onPress: () => updateTransaction(tx.id, { category: newCategory }) },
          { text: `Все ${similar.length}`, onPress: async () => { for (const t of similar) await updateTransaction(t.id, { category: newCategory }); setExpandedTxId(null); } },
          { text: 'Отмена', style: 'cancel' },
        ]);
      } else {
        await updateTransaction(tx.id, { category: newCategory });
        setExpandedTxId(null);
      }
    };

    return (
      <View style={[st.container, { backgroundColor: c.background }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 }}>
          <TouchableOpacity onPress={() => { setViewingCategory(null); setExpandedTxId(null); }}>
            <Text style={{ color: c.primary, fontSize: 15, fontWeight: '600' }}>← Назад</Text>
          </TouchableOpacity>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{viewingCategory} ({catTxs.length})</Text>
        </View>
        <FlatList
          data={catTxs}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const acc = accounts.find((a) => a.id === item.accountId);
            const isExp = expandedTxId === item.id;
            return (
              <View style={{ borderBottomWidth: 0.5, borderColor: c.border }}>
                <TouchableOpacity style={[st.txRow, { borderBottomWidth: 0 }]}
                  onPress={() => { setSelectedAccountId(item.accountId); startEditTx(item); }}
                  onLongPress={() => setExpandedTxId(isExp ? null : item.id)}>
                  <View style={{ flex: 1 }}>
                    {item.comment ? <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={1}>{item.comment}</Text> : null}
                    <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                      {fmtDate(item.date)}{item.timestamp && !item.timestamp.endsWith('T00:00:00') ? ` ${item.timestamp.substring(11, 16)}` : ''}
                      {acc ? ` · ${acc.name}` : ''}
                      {item.tag ? ` #${item.tag}` : ''}
                    </Text>
                  </View>
                  <Text style={[st.txAmount, { color: item.amount >= 0 ? c.success : c.danger }]}>
                    {fmtAmount(item.amount, acc?.currency || 'EUR')}
                  </Text>
                </TouchableOpacity>
                {isExp && (
                  <View style={{ paddingBottom: 8 }}>
                    <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>КАТЕГОРИЯ</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {existingCategories.filter((cat) => cat !== viewingCategory).map((cat) => (
                        <TouchableOpacity key={cat}
                          style={[st.chip, { backgroundColor: c.card, borderColor: c.border }]}
                          onPress={() => handleCatViewReassign(item, cat)}>
                          <Text style={{ color: c.text, fontSize: 12 }}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={st.empty}><Text style={{ color: c.textSecondary }}>Нет транзакций</Text></View>
          }
        />
      </View>
    );
  }

  // ── Categorization mode ──
  if (categorizingMode) {
    const handleSetCategory = async (txId: string, category: string) => {
      await updateTransaction(txId, { category });
      setExpandedTxId(null);
      setNewCatInput('');
    };
    const handleApplySimilar = async (tx: Transaction, category: string) => {
      const comment = tx.comment.trim();
      if (!comment) return;
      const similar = uncategorizedTxs.filter((t) => t.id !== tx.id && t.comment.trim() === comment);
      if (similar.length === 0) { Alert.alert('Нет похожих'); return; }
      Alert.alert(
        'Применить ко всем?',
        `«${comment}» → ${category}\n\nНайдено: ${similar.length} транзакций`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: `Применить (${similar.length})`, onPress: async () => {
            for (const t of similar) await updateTransaction(t.id, { category });
            await updateTransaction(tx.id, { category });
            setExpandedTxId(null);
          }},
        ],
      );
    };
    const handleSetTag = async (txId: string, tag: string) => {
      await updateTransaction(txId, { tag });
    };
    return (
      <View style={[st.container, { backgroundColor: c.background }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 }}>
          <TouchableOpacity onPress={() => { setCategorizingMode(false); setExpandedTxId(null); }}>
            <Text style={{ color: c.primary, fontSize: 15, fontWeight: '600' }}>← Назад</Text>
          </TouchableOpacity>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Без категории ({uncategorizedCount})</Text>
        </View>
        <FlatList
          data={uncategorizedTxs}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          renderItem={({ item: tx }) => {
            const acc = accounts.find((a) => a.id === tx.accountId);
            const isExpanded = expandedTxId === tx.id;
            return (
              <View style={{ borderBottomWidth: 0.5, borderColor: c.border, paddingVertical: 8 }}>
                <TouchableOpacity onPress={() => setExpandedTxId(isExpanded ? null : tx.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      {tx.comment ? <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={1}>{tx.comment}</Text> : null}
                      <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                        {fmtDate(tx.date)} · {acc?.name || ''}
                        {tx.tag ? ` #${tx.tag}` : ''}
                      </Text>
                    </View>
                    <Text style={{ color: tx.amount >= 0 ? c.success : c.danger, fontSize: 15, fontWeight: '700' }}>
                      {fmtAmount(tx.amount, acc?.currency || 'RUB')}
                    </Text>
                  </View>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>КАТЕГОРИЯ</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {existingCategories.map((cat) => (
                        <TouchableOpacity key={cat}
                          style={[st.chip, { backgroundColor: c.card, borderColor: c.border }]}
                          onPress={() => handleSetCategory(tx.id, cat)}
                          onLongPress={() => handleApplySimilar(tx, cat)}>
                          <Text style={{ color: c.text, fontSize: 12 }}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                      <TextInput
                        style={[st.input, { flex: 1, color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 13, paddingVertical: 4, marginBottom: 0 }]}
                        value={newCatInput} onChangeText={setNewCatInput}
                        placeholder="Новая категория..." placeholderTextColor={c.textSecondary}
                        returnKeyType="done"
                        onSubmitEditing={() => { if (newCatInput.trim()) { handleSetCategory(tx.id, newCatInput.trim()); setNewCatInput(''); } }}
                      />
                      {newCatInput.trim() ? (
                        <TouchableOpacity style={[st.btn, { backgroundColor: c.primary, paddingVertical: 6, paddingHorizontal: 12 }]}
                          onPress={() => { handleSetCategory(tx.id, newCatInput.trim()); setNewCatInput(''); }}>
                          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>+</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {tx.comment.trim() && uncategorizedTxs.filter((t) => t.id !== tx.id && t.comment.trim() === tx.comment.trim()).length > 0 && (
                      <Text style={{ color: c.textSecondary, fontSize: 10, marginBottom: 6 }}>
                        Похожих: {uncategorizedTxs.filter((t) => t.id !== tx.id && t.comment.trim() === tx.comment.trim()).length} · долгий тап на категорию → применить ко всем
                      </Text>
                    )}
                    <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>ТЕГ</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {tx.tag ? (
                        <TouchableOpacity
                          style={[st.chip, { backgroundColor: c.primary, borderColor: c.primary }]}
                          onPress={() => handleSetTag(tx.id, '')}>
                          <Text style={{ color: '#FFF', fontSize: 12 }}>#{tx.tag} ✕</Text>
                        </TouchableOpacity>
                      ) : null}
                      {existingTags.filter((t) => t !== tx.tag).map((tag) => (
                        <TouchableOpacity key={tag}
                          style={[st.chip, { backgroundColor: c.card, borderColor: c.border }]}
                          onPress={() => handleSetTag(tx.id, tag)}>
                          <Text style={{ color: c.text, fontSize: 12 }}>#{tag}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TextInput
                        style={[st.input, { flex: 1, color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 13, paddingVertical: 4, marginBottom: 0 }]}
                        value={newTagInput} onChangeText={setNewTagInput}
                        placeholder="Новый тег..." placeholderTextColor={c.textSecondary}
                        returnKeyType="done"
                        onSubmitEditing={() => { if (newTagInput.trim()) { handleSetTag(tx.id, newTagInput.trim()); setNewTagInput(''); } }}
                      />
                      {newTagInput.trim() ? (
                        <TouchableOpacity style={[st.btn, { backgroundColor: c.primary, paddingVertical: 6, paddingHorizontal: 12 }]}
                          onPress={() => { handleSetTag(tx.id, newTagInput.trim()); setNewTagInput(''); }}>
                          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>+</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={{ color: c.success, fontSize: 16, fontWeight: '600' }}>Все транзакции категоризованы!</Text>
              <TouchableOpacity style={{ marginTop: 12 }} onPress={() => setCategorizingMode(false)}>
                <Text style={{ color: c.primary, fontSize: 14, fontWeight: '600' }}>← К обзору</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>
    );
  }

  const renderTabBar = () => (
    <View style={st.mainTabs}>
      {([['accounts', 'Счета'], ['upcoming', 'Платежи']] as const).map(([key, label]) => (
        <TouchableOpacity
          key={key}
          style={[st.mainTab, { borderBottomColor: mainTab === key ? c.primary : 'transparent' }]}
          onPress={() => { setMainTab(key); if (key === 'upcoming') setSelectedAccountId(null); }}
        >
          <Text style={{ color: mainTab === key ? c.primary : c.textSecondary, fontWeight: '700', fontSize: 14 }}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── Upcoming payments tab ──
  if (mainTab === 'upcoming') {
    return (
      <View style={[st.container, { backgroundColor: c.background }]}>
        {renderTabBar()}
        <UpcomingPayments theme={theme} />
      </View>
    );
  }

  // ── Main screen ──
  return (
    <View style={[st.container, { backgroundColor: c.background }]}>
      {renderTabBar()}
      {/* Accounts list */}
      <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
        {accounts.map((acc) => {
          const bal = getBalance(acc.id);
          const isSelected = selectedAccountId === acc.id;
          const lastDate = getLastTxDate(acc.id);
          return (
            <TouchableOpacity key={acc.id}
              style={[st.accCard, {
                backgroundColor: isSelected ? (acc.color || c.primary) : c.card,
                borderColor: isSelected ? (acc.color || c.primary) : acc.color || c.border,
                borderLeftWidth: acc.color ? 4 : 1,
                borderLeftColor: acc.color || c.border,
              }]}
              onPress={() => setSelectedAccountId(isSelected ? null : acc.id)}
              onLongPress={() => handleAccountLongPress(acc)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[st.accName, { color: isSelected ? '#FFF' : c.text }]}>{acc.name}</Text>
                  {lastDate && <Text style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : c.textSecondary, fontSize: 10 }}>{fmtDateNum(lastDate)}</Text>}
                  {(() => { const corr = getCorrection(acc.id); return corr ? <Text style={{ color: isSelected ? 'rgba(255,255,255,0.5)' : '#F59E0B', fontSize: 9 }}>✓{fmtDateNum(corr.date)} ({corr.amount >= 0 ? '+' : ''}{corr.amount % 1 === 0 ? corr.amount : corr.amount.toFixed(2)})</Text> : null; })()}
                </View>
              </View>
              <Text style={[st.accBalance, { color: isSelected ? '#FFF' : bal >= 0 ? c.success : c.danger }]}>
                {fmtBalance(bal, acc.currency)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Buttons */}
      {selectedAccountId && !deleteMode && !showCorrectionForm && (
        <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 12, marginBottom: 4 }}>
          <TouchableOpacity style={[st.btn, { backgroundColor: c.primary, flex: 1, paddingVertical: 8 }]} onPress={() => setShowTxForm(true)}>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>+ Транзакция</Text>
          </TouchableOpacity>
          {selectedAccount?.bank && (
            <TouchableOpacity style={[st.btn, { backgroundColor: '#8B5CF6', paddingVertical: 8, paddingHorizontal: 12 }]} onPress={handleImportFile}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>
                {selectedAccount.bank === 'eurobank' ? 'PDF' : selectedAccount.bank === 'solo' ? 'XLSX' : 'CSV'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[st.btn, { backgroundColor: '#F59E0B', paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => { setShowCorrectionForm(true); setCorrectionBalance(''); }}>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>✓</Text>
          </TouchableOpacity>
        </View>
      )}
      {showCorrectionForm && selectedAccountId && (
        <View style={{ marginHorizontal: 12, marginBottom: 4, padding: 12, backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B' }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 14, marginBottom: 4 }}>Реальный баланс</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>Введите фактический баланс {selectedAccount?.name}</Text>
          <TextInput
            style={[st.input, { color: c.text, backgroundColor: c.background, borderColor: c.border, fontSize: 22, fontWeight: '700' }]}
            value={correctionBalance} onChangeText={setCorrectionBalance}
            placeholder={String(Math.round(getBalance(selectedAccountId)))}
            placeholderTextColor={c.textSecondary}
            keyboardType="decimal-pad" autoFocus />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[st.btn, { backgroundColor: '#F59E0B', flex: 1 }]} onPress={async () => {
              const num = parseFloat(correctionBalance.replace(',', '.'));
              if (isNaN(num)) { Alert.alert('Введите баланс'); return; }
              await addCorrection(selectedAccountId, num);
              setShowCorrectionForm(false);
            }}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Применить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.btn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={() => setShowCorrectionForm(false)}>
              <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {deleteMode && (
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 12, marginBottom: 4 }}>
          <TouchableOpacity style={[st.btn, { backgroundColor: '#EF4444', flex: 1 }]} onPress={confirmDeleteSelected}>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Удалить ({selectedForDelete.size})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={cancelDeleteMode}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filters */}
      {selectedAccountId && !deleteMode && !showCorrectionForm && (
        <>
          <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: 12, marginVertical: 2, height: 24 }}>
            {[{ key: null, label: 'Все' }, { key: 'today', label: 'День' }, { key: 'week', label: 'Неделя' }, { key: 'month', label: 'Месяц' }, { key: 'year', label: 'Год' }].map((p) => (
              <TouchableOpacity key={p.key ?? 'all'}
                style={[st.filterChip, { backgroundColor: periodFilter === p.key && !showDuplicates ? c.primary : c.card, borderColor: periodFilter === p.key && !showDuplicates ? c.primary : c.border }]}
                onPress={() => { setPeriodFilter(p.key); setShowDuplicates(false); }}>
                <Text style={{ color: periodFilter === p.key && !showDuplicates ? '#FFF' : c.text, fontSize: 10, fontWeight: '600' }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
            {duplicateGroups.length > 0 && (
              <TouchableOpacity
                style={[st.filterChip, { backgroundColor: showDuplicates ? '#F59E0B' : c.card, borderColor: showDuplicates ? '#F59E0B' : c.border }]}
                onPress={() => setShowDuplicates(!showDuplicates)}>
                <Text style={{ color: showDuplicates ? '#FFF' : '#F59E0B', fontSize: 10, fontWeight: '700' }}>Дубли {duplicateGroups.length}</Text>
              </TouchableOpacity>
            )}
          </View>
          {accountCategories.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 28, marginVertical: 2 }}
              contentContainerStyle={{ gap: 4, paddingHorizontal: 12, alignItems: 'center' }}>
              <TouchableOpacity
                style={[st.chip, { backgroundColor: !categoryFilter ? c.primary : c.card, borderColor: !categoryFilter ? c.primary : c.border }]}
                onPress={() => setCategoryFilter(null)}>
                <Text style={{ color: !categoryFilter ? '#FFF' : c.text, fontSize: 10, fontWeight: '600' }}>Все</Text>
              </TouchableOpacity>
              {accountCategories.map((cat) => (
                <TouchableOpacity key={cat}
                  style={[st.chip, { backgroundColor: categoryFilter === cat ? c.primary : c.card, borderColor: categoryFilter === cat ? c.primary : c.border }]}
                  onPress={() => setCategoryFilter(categoryFilter === cat ? null : cat)}>
                  <Text style={{ color: categoryFilter === cat ? '#FFF' : c.text, fontSize: 10, fontWeight: '600' }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* Transactions */}
      {selectedAccountId && showDuplicates ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}>
          {duplicateGroups.map((group, gi) => (
            <View key={gi} style={{ marginBottom: 12, borderWidth: 1, borderColor: '#F59E0B', borderRadius: 10, overflow: 'hidden' }}>
              <View style={{ backgroundColor: theme === 'dark' ? '#3D2E00' : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>
                  {group.length} дубля · {fmtAmount(group[0].amount, selectedAccount?.currency || '')} · {fmtDate(group[0].date)}
                </Text>
              </View>
              {group.map((tx, ti) => {
                const isMarked = selectedForDelete.has(tx.id);
                return (
                  <TouchableOpacity key={tx.id}
                    style={[st.txRow, { borderColor: c.border, paddingHorizontal: 10, backgroundColor: isMarked ? (theme === 'dark' ? '#3B1818' : '#FEE2E2') : 'transparent' }]}
                    onPress={() => deleteMode ? toggleDeleteSelect(tx.id) : undefined}
                    onLongPress={() => !deleteMode ? enterDeleteMode(tx.id) : undefined}>
                    {deleteMode && (
                      <Text style={{ fontSize: 16, marginRight: 8 }}>{isMarked ? '☑' : '☐'}</Text>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {tx.category ? <Text style={[st.txCat, { color: c.primary }]}>{tx.category}</Text> : null}
                        {tx.tag ? <Text style={[st.txTag, { color: c.textSecondary }]}>#{tx.tag}</Text> : null}
                      </View>
                      {tx.comment ? <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={1}>{tx.comment}</Text> : null}
                      <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                        {fmtDate(tx.date)}{tx.timestamp && !tx.timestamp.endsWith('T00:00:00') ? ` ${tx.timestamp.substring(11, 16)}` : ''}
                        {` · id: ...${tx.id.slice(-6)}`}
                      </Text>
                    </View>
                    <Text style={[st.txAmount, { color: tx.amount >= 0 ? c.success : c.danger }]}>
                      {fmtAmount(tx.amount, selectedAccount?.currency || '')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          {duplicateGroups.length === 0 && (
            <View style={st.empty}>
              <Text style={{ color: c.success, fontSize: 14, fontWeight: '600' }}>Нет дублей</Text>
            </View>
          )}
        </ScrollView>
      ) : selectedAccountId ? (
        <FlatList
          data={filteredTxs}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const isMarked = selectedForDelete.has(item.id);
            return (
              <TouchableOpacity
                style={[st.txRow, { borderColor: c.border, backgroundColor: isMarked ? (theme === 'dark' ? '#3B1818' : '#FEE2E2') : 'transparent' }]}
                onPress={() => deleteMode ? toggleDeleteSelect(item.id) : startEditTx(item)}
                onLongPress={() => handleTxLongPress(item)}>
                {deleteMode && (
                  <Text style={{ fontSize: 16, marginRight: 8 }}>{isMarked ? '☑' : '☐'}</Text>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {item.isCorrection && <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>✓ Коррекция</Text>}
                    {!item.isCorrection && item.category ? <Text style={[st.txCat, { color: c.primary }]}>{item.category}</Text> : null}
                    {item.tag ? <Text style={[st.txTag, { color: c.textSecondary }]}>#{item.tag}</Text> : null}
                  </View>
                  {item.comment ? <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={1}>{item.comment}</Text> : null}
                  <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                  {fmtDate(item.date)}{item.timestamp && !item.timestamp.endsWith('T00:00:00') ? ` ${item.timestamp.substring(11, 16)}` : ''}
                </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {duplicateIds.has(item.id) && <Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '600' }}>дубль?</Text>}
                  <Text style={[st.txAmount, { color: item.amount >= 0 ? c.success : c.danger }]}>
                    {fmtAmount(item.amount, selectedAccount?.currency || '')}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={{ color: c.textSecondary, fontSize: 14 }}>Нет транзакций</Text>
            </View>
          }
        />
      ) : accounts.length === 0 ? (
        <View style={st.empty}>
          <Text style={{ fontSize: 48 }}>💰</Text>
          <Text style={{ color: c.textSecondary, fontSize: 14, marginTop: 8 }}>Добавьте первый счёт</Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: 12, marginVertical: 6, height: 28 }}>
            {([{ key: 'month' as const, label: 'Месяц' }, { key: 'year' as const, label: 'Год' }, { key: 'all' as const, label: 'Все' }]).map((p) => (
              <TouchableOpacity key={p.key}
                style={[st.filterChip, { backgroundColor: overviewPeriod === p.key ? c.primary : c.card, borderColor: overviewPeriod === p.key ? c.primary : c.border }]}
                onPress={() => setOverviewPeriod(p.key)}>
                <Text style={{ color: overviewPeriod === p.key ? '#FFF' : c.text, fontSize: 11, fontWeight: '600' }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={overviewData}
            keyExtractor={(item) => item.cat}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={[st.txRow, { borderColor: c.border }]}
                onPress={() => setViewingCategory(item.cat)}
                onLongPress={item.cat === 'Без категории' ? () => setCategorizingMode(true) : undefined}
                activeOpacity={0.6}>
                <Text style={{ color: item.cat === 'Без категории' ? c.textSecondary : c.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                  {item.cat} →
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  {item.totals.map((t) => (
                    <Text key={t.currency} style={{ color: c.danger, fontSize: 14, fontWeight: '700' }}>
                      −{t.total % 1 === 0 ? t.total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : t.total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} {curSym(t.currency)}
                    </Text>
                  ))}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={st.empty}>
                <Text style={{ color: c.textSecondary, fontSize: 14 }}>Нет расходов</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  mainTabs: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 6 },
  mainTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderBottomWidth: 2 },
  accCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, borderWidth: 1 },
  accName: { fontSize: 15, fontWeight: '600' },
  accBalance: { fontSize: 15, fontWeight: '700' },
  addAccBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, padding: 10, alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' },
  filterChip: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  colorDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, marginBottom: 6 },
  formTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  formSubtitle: { fontSize: 13, marginBottom: 10 },
  formBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, gap: 8 },
  txCat: { fontSize: 12, fontWeight: '600' },
  txTag: { fontSize: 11 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
});
