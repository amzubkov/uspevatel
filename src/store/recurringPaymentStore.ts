import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';
import { insertLedgerTransaction, reloadMoneyTransactions } from './moneyStore';
import { isValidDateStr, todayStr } from '../utils/date';
import { recurringPaymentTransactionId } from '../utils/moneyLogic';
import { nextAnchoredDueDate, nextDueDate, type Recurrence } from '../utils/recurrence';
import { schedulePaymentReminders, cancelPaymentReminders } from '../utils/notifications';

export { nextDueDate };
export type { Recurrence };

const CUR_SYMBOL: Record<string, string> = { RUB: '₽', EUR: '€', USD: '$', USDT: '₮' };

function reminderLabel(p: { amount: number; currency: string }): string {
  return `${Math.round(p.amount)} ${CUR_SYMBOL[p.currency] || p.currency}`;
}

export interface RecurringPayment {
  id: string;
  name: string;
  amount: number;
  currency: string;
  dueDate: string;      // YYYY-MM-DD, next due date
  anchorDate: string;   // persisted original/manual due date for calendar clamping
  recurrence: Recurrence;
  accountId: string | null;
  category: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export type RecurringPaymentInput = Omit<RecurringPayment, 'id' | 'createdAt' | 'active' | 'anchorDate'>;

interface RecurringPaymentRow {
  id: string;
  name: string;
  amount: number;
  currency: string;
  due_date: string;
  anchor_date: string;
  recurrence: Recurrence;
  account_id: string | null;
  category: string;
  notes: string;
  active: number;
  created_at: string;
}

function rowToPayment(r: RecurringPaymentRow): RecurringPayment {
  return {
    id: r.id,
    name: r.name,
    amount: r.amount,
    currency: r.currency,
    dueDate: r.due_date,
    anchorDate: r.anchor_date || r.due_date,
    recurrence: r.recurrence,
    accountId: r.account_id,
    category: r.category,
    notes: r.notes,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

const markPaidInFlight = new Set<string>();

interface RecurringPaymentState {
  payments: RecurringPayment[];
  loaded: boolean;
  load: () => Promise<void>;
  addPayment: (input: RecurringPaymentInput) => Promise<void>;
  updatePayment: (id: string, fields: Partial<RecurringPaymentInput>) => Promise<void>;
  removePayment: (id: string) => Promise<void>;
  markPaid: (id: string, createTransaction: boolean) => Promise<void>;
}

export const useRecurringPaymentStore = create<RecurringPaymentState>()((set, get) => ({
  payments: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync<RecurringPaymentRow>(
      'SELECT * FROM recurring_payments ORDER BY active DESC, due_date ASC',
    );
    set({ payments: rows.map(rowToPayment), loaded: true });
  },

  addPayment: async (input) => {
    if (!isValidDateStr(input.dueDate)) throw new Error('Некорректная дата платежа');
    const payment: RecurringPayment = {
      ...input,
      id: Crypto.randomUUID(),
      anchorDate: input.dueDate,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO recurring_payments
        (id, name, amount, currency, due_date, anchor_date, recurrence, account_id, category, notes, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [payment.id, payment.name, payment.amount, payment.currency, payment.dueDate, payment.anchorDate,
       payment.recurrence, payment.accountId, payment.category, payment.notes, payment.createdAt],
    );
    set((state) => ({ payments: [...state.payments, payment] }));
    void schedulePaymentReminders(payment.id, payment.name, reminderLabel(payment), payment.dueDate).catch(() => {});
  },

  updatePayment: async (id, fields) => {
    if (fields.dueDate !== undefined && !isValidDateStr(fields.dueDate)) {
      throw new Error('Некорректная дата платежа');
    }
    const existing = get().payments.find((payment) => payment.id === id);
    const dueDateChanged = fields.dueDate !== undefined && fields.dueDate !== existing?.dueDate;
    const map: Record<string, string> = {
      name: 'name', amount: 'amount', currency: 'currency', dueDate: 'due_date',
      recurrence: 'recurrence', accountId: 'account_id', category: 'category', notes: 'notes',
    };
    const assignments: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [key, col] of Object.entries(map)) {
      if (key in fields) {
        assignments.push(`${col} = ?`);
        values.push((fields as any)[key] ?? null);
      }
    }
    if (dueDateChanged && fields.dueDate !== undefined) {
      assignments.push('anchor_date = ?');
      values.push(fields.dueDate);
    }
    if (assignments.length === 0) return;
    const db = await getDb();
    await db.runAsync(`UPDATE recurring_payments SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
    set((state) => ({
      payments: state.payments.map((p) => (p.id === id
        ? { ...p, ...fields, ...(dueDateChanged && fields.dueDate !== undefined ? { anchorDate: fields.dueDate } : {}) }
        : p)),
    }));
    const updated = get().payments.find((p) => p.id === id);
    if (updated) {
      if (updated.active) {
        void schedulePaymentReminders(updated.id, updated.name, reminderLabel(updated), updated.dueDate).catch(() => {});
      } else {
        void cancelPaymentReminders(id).catch(() => {});
      }
    }
  },

  removePayment: async (id) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM recurring_payments WHERE id = ?', [id]);
    set((state) => ({ payments: state.payments.filter((p) => p.id !== id) }));
    void cancelPaymentReminders(id).catch(() => {});
  },

  markPaid: async (id, createTransaction) => {
    if (markPaidInFlight.has(id)) return;
    const payment = get().payments.find((p) => p.id === id);
    if (!payment) return;
    markPaidInFlight.add(id);
    try {
      const recurrence = payment.recurrence;
      const isOnce = recurrence === 'once';
      const next = recurrence === 'once'
        ? null
        : nextAnchoredDueDate(payment.anchorDate, payment.dueDate, recurrence, todayStr());
      let insertedTransaction = false;
      const db = await getDb();
      await db.withExclusiveTransactionAsync(async (tx) => {
        if (createTransaction && payment.accountId) {
          const result = await insertLedgerTransaction(tx, {
            accountId: payment.accountId,
            amount: -Math.abs(payment.amount),
            date: payment.dueDate,
            category: payment.category || 'Платежи',
            tag: '',
            comment: payment.name,
          }, {
            id: recurringPaymentTransactionId(payment.id, payment.dueDate),
            idempotent: true,
          });
          insertedTransaction = result.inserted;
        }
        if (isOnce) {
          await tx.runAsync('UPDATE recurring_payments SET active = 0 WHERE id = ?', [id]);
        } else {
          await tx.runAsync('UPDATE recurring_payments SET due_date = ? WHERE id = ?', [next, id]);
        }
      });

      if (insertedTransaction) await reloadMoneyTransactions();
      if (isOnce) {
        set((state) => ({ payments: state.payments.map((p) => (p.id === id ? { ...p, active: false } : p)) }));
        void cancelPaymentReminders(id).catch(() => {});
      } else if (next) {
        set((state) => ({ payments: state.payments.map((p) => (p.id === id ? { ...p, dueDate: next } : p)) }));
        void schedulePaymentReminders(payment.id, payment.name, reminderLabel(payment), next).catch(() => {});
      }
    } finally {
      markPaidInFlight.delete(id);
    }
  },
}));
