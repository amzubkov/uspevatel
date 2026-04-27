import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export type BankType = 'revolut' | 'revolut_crypto' | 'eurobank' | undefined;

export interface Account {
  id: string;
  name: string;
  currency: string;
  color?: string;
  bank?: BankType;
  sortOrder: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  timestamp: string; // YYYY-MM-DDTHH:MM:SS
  category: string;
  tag: string;
  comment: string;
  isCorrection: boolean;
  createdAt: string;
}

interface MoneyState {
  accounts: Account[];
  transactions: Transaction[];
  loaded: boolean;

  load: () => Promise<void>;

  addAccount: (name: string, currency: string, color?: string, bank?: BankType) => Promise<void>;
  updateAccount: (id: string, fields: Partial<Pick<Account, 'name' | 'currency' | 'color' | 'bank'>>) => Promise<void>;
  getLastTxDate: (accountId: string) => string | undefined;
  removeAccount: (id: string) => Promise<void>;

  addTransaction: (t: Omit<Transaction, 'id' | 'createdAt' | 'isCorrection'>) => Promise<void>;
  updateTransaction: (id: string, fields: Partial<Omit<Transaction, 'id' | 'createdAt'>>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  clearTransactions: (accountId: string) => Promise<void>;
  addCorrection: (accountId: string, actualBalance: number) => Promise<void>;
  getCorrection: (accountId: string) => Transaction | undefined;
  getCorrectionDate: (accountId: string) => string | undefined;

  getBalance: (accountId: string) => number;
  getTransactionsForAccount: (accountId: string) => Transaction[];
  getAllCategories: () => string[];
  getAllTags: () => string[];
}

export const useMoneyStore = create<MoneyState>()((set, get) => ({
  accounts: [],
  transactions: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const accRows = await db.getAllAsync<any>('SELECT * FROM accounts ORDER BY sort_order, name');
    const txRows = await db.getAllAsync<any>('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
    set({
      accounts: accRows.map((r: any) => ({
        id: r.id, name: r.name, currency: r.currency,
        color: r.color || undefined,
        bank: r.bank || undefined,
        sortOrder: r.sort_order, createdAt: r.created_at,
      })),
      transactions: txRows.map((r: any) => ({
        id: r.id, accountId: r.account_id, amount: r.amount,
        date: r.date, timestamp: r.timestamp || `${r.date}T00:00:00`,
        category: r.category || '', tag: r.tag || '',
        comment: r.comment || '', isCorrection: !!r.is_correction, createdAt: r.created_at,
      })),
      loaded: true,
    });
  },

  addAccount: async (name, currency, color, bank) => {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const sortOrder = get().accounts.length;
    const acc: Account = { id, name, currency, color, bank, sortOrder, createdAt: now };
    set((s) => ({ accounts: [...s.accounts, acc] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO accounts (id, name, currency, color, bank, sort_order, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, name, currency, color || null, bank || null, sortOrder, now]);
  },

  updateAccount: async (id, fields) => {
    set((s) => ({ accounts: s.accounts.map((a) => a.id === id ? { ...a, ...fields } : a) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name); }
    if (fields.currency !== undefined) { sets.push('currency = ?'); vals.push(fields.currency); }
    if (fields.color !== undefined) { sets.push('color = ?'); vals.push(fields.color || null); }
    if (fields.bank !== undefined) { sets.push('bank = ?'); vals.push(fields.bank || null); }
    if (sets.length) { vals.push(id); await db.runAsync(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, vals); }
  },

  removeAccount: async (id) => {
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== id),
      transactions: s.transactions.filter((t) => t.accountId !== id),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM transactions WHERE account_id = ?', [id]);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
  },

  addTransaction: async (t) => {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const timestamp = t.timestamp || `${t.date}T00:00:00`;
    const tx: Transaction = { ...t, id, timestamp, isCorrection: false, createdAt: now };
    set((s) => ({ transactions: [tx, ...s.transactions] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO transactions (id, account_id, amount, date, timestamp, category, tag, comment, is_correction, created_at) VALUES (?,?,?,?,?,?,?,?,0,?)',
      [id, t.accountId, t.amount, t.date, timestamp, t.category, t.tag, t.comment, now]);
    // Auto-adjust correction if new tx is dated on or before it
    const correction = get().getCorrection(t.accountId);
    if (correction && t.date <= correction.date) {
      const newAmount = correction.amount - t.amount;
      set((s) => ({ transactions: s.transactions.map((tr) => tr.id === correction.id ? { ...tr, amount: newAmount } : tr) }));
      await db.runAsync('UPDATE transactions SET amount = ? WHERE id = ?', [newAmount, correction.id]);
    }
  },

  updateTransaction: async (id, fields) => {
    set((s) => ({ transactions: s.transactions.map((t) => t.id === id ? { ...t, ...fields } : t) }));
    const db = await getDb();
    const map: Record<string, string> = {
      accountId: 'account_id', amount: 'amount', date: 'date', timestamp: 'timestamp',
      category: 'category', tag: 'tag', comment: 'comment',
    };
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, col] of Object.entries(map)) {
      if (k in fields) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    if (sets.length) { vals.push(id); await db.runAsync(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, vals); }
  },

  removeTransaction: async (id) => {
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  },

  clearTransactions: async (accountId) => {
    set((s) => ({ transactions: s.transactions.filter((t) => t.accountId !== accountId) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM transactions WHERE account_id = ?', [accountId]);
  },

  addCorrection: async (accountId, actualBalance) => {
    const currentBalance = get().getBalance(accountId);
    const diff = actualBalance - currentBalance;
    const today = new Date().toISOString().substring(0, 10);
    // Remove old correction for this account if exists
    const old = get().getCorrection(accountId);
    if (old) {
      set((s) => ({ transactions: s.transactions.filter((t) => t.id !== old.id) }));
      const db = await getDb();
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [old.id]);
    }
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const timestamp = `${today}T23:59:59`;
    const tx: Transaction = { id, accountId, amount: diff, date: today, timestamp, category: 'Коррекция', tag: '', comment: `Баланс: ${actualBalance}`, isCorrection: true, createdAt: now };
    set((s) => ({ transactions: [tx, ...s.transactions] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO transactions (id, account_id, amount, date, timestamp, category, tag, comment, is_correction, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
      [id, accountId, diff, today, timestamp, 'Коррекция', '', tx.comment, now]);
  },

  getCorrection: (accountId) => {
    return get().transactions.find((t) => t.accountId === accountId && t.isCorrection);
  },

  getCorrectionDate: (accountId) => {
    const c = get().transactions.find((t) => t.accountId === accountId && t.isCorrection);
    return c?.date;
  },

  getBalance: (accountId) => {
    return get().transactions
      .filter((t) => t.accountId === accountId)
      .reduce((sum, t) => sum + t.amount, 0);
  },

  getTransactionsForAccount: (accountId) => {
    return get().transactions.filter((t) => t.accountId === accountId);
  },

  getAllCategories: () => {
    const cats = new Set<string>();
    for (const t of get().transactions) if (t.category) cats.add(t.category);
    return [...cats].sort();
  },

  getAllTags: () => {
    const tags = new Set<string>();
    for (const t of get().transactions) if (t.tag) tags.add(t.tag);
    return [...tags].sort();
  },

  getLastTxDate: (accountId) => {
    const txs = get().transactions.filter((t) => t.accountId === accountId);
    if (!txs.length) return undefined;
    return txs.reduce((max, t) => t.date > max ? t.date : max, txs[0].date);
  },
}));
