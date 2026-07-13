import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/database';
import { isValidDateStr, todayStr } from '../utils/date';
import { calculateCorrectionAmount } from '../utils/moneyLogic';

export type BankType = 'revolut' | 'revolut_crypto' | 'eurobank' | 'bog' | 'solo' | 'kolo' | undefined;

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

export type LedgerTransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'isCorrection' | 'timestamp'> & {
  timestamp?: string;
};

export interface LedgerInsertResult {
  transaction: Transaction;
  inserted: boolean;
}

function rowToTransaction(r: any): Transaction {
  return {
    id: r.id,
    accountId: r.account_id,
    amount: r.amount,
    date: r.date,
    timestamp: r.timestamp || `${r.date}T00:00:00`,
    category: r.category || '',
    tag: r.tag || '',
    comment: r.comment || '',
    isCorrection: !!r.is_correction,
    createdAt: r.created_at,
  };
}

/**
 * Insert a ledger row and preserve a later balance correction in the same DB
 * transaction. A supplied stable id makes retries safe via INSERT OR IGNORE.
 */
export async function insertLedgerTransaction(
  db: SQLiteDatabase,
  input: LedgerTransactionInput,
  options: { id?: string; createdAt?: string; idempotent?: boolean } = {},
): Promise<LedgerInsertResult> {
  if (!Number.isFinite(input.amount)) throw new Error('Некорректная сумма транзакции');
  if (!isValidDateStr(input.date)) throw new Error('Некорректная дата транзакции');
  const id = options.id || Crypto.randomUUID();
  const createdAt = options.createdAt || new Date().toISOString();
  const timestamp = input.timestamp || `${input.date}T00:00:00`;
  const transaction: Transaction = {
    ...input,
    id,
    timestamp,
    isCorrection: false,
    createdAt,
  };
  const insert = options.idempotent ? 'INSERT OR IGNORE' : 'INSERT';
  const result = await db.runAsync(
    `${insert} INTO transactions
      (id, account_id, amount, date, timestamp, category, tag, comment, is_correction, created_at)
     VALUES (?,?,?,?,?,?,?,?,0,?)`,
    [id, input.accountId, input.amount, input.date, timestamp, input.category, input.tag, input.comment, createdAt],
  );
  const inserted = result.changes > 0;
  if (inserted) {
    const correction = await db.getFirstAsync<{ id: string; amount: number; date: string }>(
      `SELECT id, amount, date FROM transactions
       WHERE account_id = ? AND is_correction = 1
       ORDER BY created_at ASC LIMIT 1`,
      [input.accountId],
    );
    if (correction && input.date <= correction.date) {
      await db.runAsync(
        'UPDATE transactions SET amount = ? WHERE id = ?',
        [correction.amount - input.amount, correction.id],
      );
    }
  }
  return { transaction, inserted };
}

async function readTransactions(db: SQLiteDatabase): Promise<Transaction[]> {
  const rows = await db.getAllAsync<any>('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
  return rows.map(rowToTransaction);
}

async function shiftCorrectionForContribution(
  db: SQLiteDatabase,
  accountId: string,
  transactionDate: string,
  contributionDelta: number,
): Promise<void> {
  const correction = await db.getFirstAsync<{ id: string; amount: number; date: string }>(
    `SELECT id, amount, date FROM transactions
     WHERE account_id = ? AND is_correction = 1
     ORDER BY created_at ASC LIMIT 1`,
    [accountId],
  );
  if (correction && transactionDate <= correction.date) {
    await db.runAsync(
      'UPDATE transactions SET amount = ? WHERE id = ?',
      [correction.amount - contributionDelta, correction.id],
    );
  }
}

async function deleteLedgerTransaction(db: SQLiteDatabase, id: string): Promise<void> {
  const row = await db.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!row) return;
  const transaction = rowToTransaction(row);
  if (!transaction.isCorrection) {
    await shiftCorrectionForContribution(db, transaction.accountId, transaction.date, -transaction.amount);
  }
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

function clearRecurringAccountInMemory(accountId: string): void {
  try {
    const { useRecurringPaymentStore } = require('./recurringPaymentStore') as typeof import('./recurringPaymentStore');
    useRecurringPaymentStore.setState((state) => ({
      payments: state.payments.map((payment) => (
        payment.accountId === accountId ? { ...payment, accountId: null } : payment
      )),
    }));
  } catch {}
}

export async function reloadMoneyTransactions(): Promise<void> {
  const db = await getDb();
  useMoneyStore.setState({ transactions: await readTransactions(db) });
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

  addTransaction: (t: LedgerTransactionInput) => Promise<void>;
  addTransactionsBatch: (transactions: LedgerTransactionInput[]) => Promise<void>;
  addTransfer: (input: {
    fromAccountId: string;
    toAccountId: string;
    fromAmount: number;
    toAmount: number;
    date: string;
    tag: string;
    fromComment: string;
    toComment: string;
    operationId?: string;
  }) => Promise<void>;
  updateTransaction: (id: string, fields: Partial<Omit<Transaction, 'id' | 'createdAt' | 'isCorrection'>>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  removeTransactions: (ids: string[]) => Promise<void>;
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
    const transactions = await readTransactions(db);
    set({
      accounts: accRows.map((r: any) => ({
        id: r.id, name: r.name, currency: r.currency,
        color: r.color || undefined,
        bank: r.bank || undefined,
        sortOrder: r.sort_order, createdAt: r.created_at,
      })),
      transactions,
      loaded: true,
    });
  },

  addAccount: async (name, currency, color, bank) => {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const sortOrder = get().accounts.length;
    const acc: Account = { id, name, currency, color, bank, sortOrder, createdAt: now };
    const db = await getDb();
    await db.runAsync('INSERT INTO accounts (id, name, currency, color, bank, sort_order, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, name, currency, color || null, bank || null, sortOrder, now]);
    set((s) => ({ accounts: [...s.accounts, acc] }));
  },

  updateAccount: async (id, fields) => {
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name); }
    if (fields.currency !== undefined) { sets.push('currency = ?'); vals.push(fields.currency); }
    if (fields.color !== undefined) { sets.push('color = ?'); vals.push(fields.color || null); }
    if (fields.bank !== undefined) { sets.push('bank = ?'); vals.push(fields.bank || null); }
    if (sets.length) {
      vals.push(id);
      await db.runAsync(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, vals);
      set((s) => ({ accounts: s.accounts.map((a) => a.id === id ? { ...a, ...fields } : a) }));
    }
  },

  removeAccount: async (id) => {
    const db = await getDb();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE recurring_payments SET account_id = NULL WHERE account_id = ?', [id]);
      await tx.runAsync('DELETE FROM transactions WHERE account_id = ?', [id]);
      await tx.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
    });
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== id),
      transactions: s.transactions.filter((t) => t.accountId !== id),
    }));
    clearRecurringAccountInMemory(id);
  },

  addTransaction: async (t) => {
    await get().addTransactionsBatch([t]);
  },

  addTransactionsBatch: async (transactions) => {
    if (transactions.length === 0) return;
    const db = await getDb();
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const transaction of transactions) {
        await insertLedgerTransaction(tx, transaction);
      }
    });
    await reloadMoneyTransactions();
  },

  addTransfer: async (input) => {
    if (input.fromAccountId === input.toAccountId) throw new Error('Нельзя перевести на тот же счёт');
    if (!Number.isFinite(input.fromAmount) || !Number.isFinite(input.toAmount)
      || !(input.fromAmount > 0) || !(input.toAmount > 0)) {
      throw new Error('Сумма перевода должна быть больше нуля');
    }
    if (!isValidDateStr(input.date)) throw new Error('Некорректная дата перевода');
    const operationId = input.operationId?.trim() || Crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const db = await getDb();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await insertLedgerTransaction(tx, {
        accountId: input.fromAccountId,
        amount: -Math.abs(input.fromAmount),
        date: input.date,
        category: 'Перевод',
        tag: input.tag,
        comment: input.fromComment,
      }, { id: `${operationId}:out`, createdAt, idempotent: true });
      await insertLedgerTransaction(tx, {
        accountId: input.toAccountId,
        amount: Math.abs(input.toAmount),
        date: input.date,
        category: 'Перевод',
        tag: input.tag,
        comment: input.toComment,
      }, { id: `${operationId}:in`, createdAt, idempotent: true });
    });
    await reloadMoneyTransactions();
  },

  updateTransaction: async (id, fields) => {
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
    if (sets.length === 0) return;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!row) return;
      const oldTransaction = rowToTransaction(row);
      if (oldTransaction.isCorrection) {
        throw new Error('Коррекцию баланса нельзя редактировать как обычную транзакцию');
      }
      const updated = { ...oldTransaction, ...fields };
      if (!Number.isFinite(updated.amount)) throw new Error('Некорректная сумма транзакции');
      if (!isValidDateStr(updated.date)) throw new Error('Некорректная дата транзакции');
      await shiftCorrectionForContribution(
        tx,
        oldTransaction.accountId,
        oldTransaction.date,
        -oldTransaction.amount,
      );
      await tx.runAsync(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
      await shiftCorrectionForContribution(
        tx,
        updated.accountId,
        updated.date,
        updated.amount,
      );
    });
    await reloadMoneyTransactions();
  },

  removeTransaction: async (id) => {
    await get().removeTransactions([id]);
  },

  removeTransactions: async (ids) => {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return;
    const db = await getDb();
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const id of uniqueIds) await deleteLedgerTransaction(tx, id);
    });
    await reloadMoneyTransactions();
  },

  clearTransactions: async (accountId) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM transactions WHERE account_id = ?', [accountId]);
    set((s) => ({ transactions: s.transactions.filter((t) => t.accountId !== accountId) }));
  },

  addCorrection: async (accountId, actualBalance) => {
    if (!Number.isFinite(actualBalance)) throw new Error('Некорректный баланс');
    const today = todayStr();
    const timestamp = `${today}T23:59:59`;
    const db = await getDb();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const rows = await tx.getAllAsync<{ id: string; amount: number; is_correction: number; created_at: string }>(
        `SELECT id, amount, is_correction, created_at FROM transactions
         WHERE account_id = ? ORDER BY created_at ASC`,
        [accountId],
      );
      const amount = calculateCorrectionAmount(
        actualBalance,
        rows.map((row) => ({ amount: row.amount, isCorrection: !!row.is_correction })),
      );
      const corrections = rows.filter((row) => !!row.is_correction);
      const existing = corrections[0];
      const comment = `Баланс: ${actualBalance}`;
      if (existing) {
        await tx.runAsync(
          `UPDATE transactions SET amount = ?, date = ?, timestamp = ?, category = 'Коррекция',
           tag = '', comment = ? WHERE id = ?`,
          [amount, today, timestamp, comment, existing.id],
        );
        for (const duplicate of corrections.slice(1)) {
          await tx.runAsync('DELETE FROM transactions WHERE id = ?', [duplicate.id]);
        }
      } else {
        await tx.runAsync(
          `INSERT INTO transactions
            (id, account_id, amount, date, timestamp, category, tag, comment, is_correction, created_at)
           VALUES (?,?,?,?,?,?,?,?,1,?)`,
          [Crypto.randomUUID(), accountId, amount, today, timestamp, 'Коррекция', '', comment, new Date().toISOString()],
        );
      }
    });
    await reloadMoneyTransactions();
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
