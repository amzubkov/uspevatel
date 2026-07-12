import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';
import { useMoneyStore } from './moneyStore';
import { todayStr } from '../utils/date';
import { schedulePaymentReminders, cancelPaymentReminders } from '../utils/notifications';

export type Recurrence = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

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
  recurrence: Recurrence;
  accountId: string | null;
  category: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export type RecurringPaymentInput = Omit<RecurringPayment, 'id' | 'createdAt' | 'active'>;

interface RecurringPaymentRow {
  id: string;
  name: string;
  amount: number;
  currency: string;
  due_date: string;
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
    recurrence: r.recurrence,
    accountId: r.account_id,
    category: r.category,
    notes: r.notes,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

/** Advance a YYYY-MM-DD date by one recurrence period (calendar-aware). */
export function nextDueDate(dateStr: string, recurrence: Recurrence): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  if (recurrence === 'weekly') base.setDate(base.getDate() + 7);
  else if (recurrence === 'monthly') base.setMonth(base.getMonth() + 1);
  else if (recurrence === 'quarterly') base.setMonth(base.getMonth() + 3);
  else if (recurrence === 'semiannual') base.setMonth(base.getMonth() + 6);
  else if (recurrence === 'yearly') base.setFullYear(base.getFullYear() + 1);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

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
    const payment: RecurringPayment = {
      ...input,
      id: Crypto.randomUUID(),
      active: true,
      createdAt: new Date().toISOString(),
    };
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO recurring_payments
        (id, name, amount, currency, due_date, recurrence, account_id, category, notes, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [payment.id, payment.name, payment.amount, payment.currency, payment.dueDate,
       payment.recurrence, payment.accountId, payment.category, payment.notes, payment.createdAt],
    );
    set((state) => ({ payments: [...state.payments, payment] }));
    schedulePaymentReminders(payment.id, payment.name, reminderLabel(payment), payment.dueDate);
  },

  updatePayment: async (id, fields) => {
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
    if (assignments.length === 0) return;
    const db = await getDb();
    await db.runAsync(`UPDATE recurring_payments SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
    set((state) => ({
      payments: state.payments.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    }));
    const updated = get().payments.find((p) => p.id === id);
    if (updated) {
      if (updated.active) schedulePaymentReminders(updated.id, updated.name, reminderLabel(updated), updated.dueDate);
      else cancelPaymentReminders(id);
    }
  },

  removePayment: async (id) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM recurring_payments WHERE id = ?', [id]);
    set((state) => ({ payments: state.payments.filter((p) => p.id !== id) }));
    cancelPaymentReminders(id);
  },

  markPaid: async (id, createTransaction) => {
    const payment = get().payments.find((p) => p.id === id);
    if (!payment) return;

    if (createTransaction && payment.accountId) {
      await useMoneyStore.getState().addTransaction({
        accountId: payment.accountId,
        amount: -Math.abs(payment.amount),
        date: payment.dueDate,
        category: payment.category || 'Платежи',
        tag: '',
        comment: payment.name,
      });
    }

    const db = await getDb();
    if (payment.recurrence === 'once') {
      await db.runAsync('UPDATE recurring_payments SET active = 0 WHERE id = ?', [id]);
      set((state) => ({ payments: state.payments.map((p) => (p.id === id ? { ...p, active: false } : p)) }));
      cancelPaymentReminders(id);
    } else {
      const next = nextDueDate(payment.dueDate < todayStr() ? todayStr() : payment.dueDate, payment.recurrence);
      await db.runAsync('UPDATE recurring_payments SET due_date = ? WHERE id = ?', [next, id]);
      set((state) => ({ payments: state.payments.map((p) => (p.id === id ? { ...p, dueDate: next } : p)) }));
      schedulePaymentReminders(payment.id, payment.name, reminderLabel(payment), next);
    }
  },
}));
