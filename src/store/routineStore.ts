import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface RoutineItem {
  id: string;
  title: string;
  order: number;
}

interface RoutineState {
  items: RoutineItem[];
  completedToday: Record<string, string>; // itemId -> date
  loaded: boolean;

  load: () => Promise<void>;
  addItem: (title: string) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, title: string) => void;
  reorderItems: (items: RoutineItem[]) => void;
  toggleComplete: (id: string) => void;
  isCompletedToday: (id: string) => boolean;
  getCompletedCount: () => number;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const useRoutineStore = create<RoutineState>()((set, get) => ({
  items: [],
  completedToday: {},
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string; title: string; sort_order: number }>('SELECT * FROM routines ORDER BY sort_order');
    const items: RoutineItem[] = rows.map((r) => ({ id: r.id, title: r.title, order: r.sort_order }));
    // Load completions (all, not just today — we store for toggle checks)
    const comps = await db.getAllAsync<{ routine_id: string; date: string }>('SELECT * FROM routine_completions');
    const completedToday: Record<string, string> = {};
    for (const c of comps) completedToday[c.routine_id] = c.date;
    set({ items, completedToday, loaded: true });
  },

  addItem: async (title) => {
    const item: RoutineItem = { id: Crypto.randomUUID(), title, order: get().items.length };
    set((s) => ({ items: [...s.items, item] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO routines (id, title, sort_order) VALUES (?, ?, ?)', [item.id, title, item.order]);
  },

  removeItem: async (id) => {
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      completedToday: Object.fromEntries(Object.entries(s.completedToday).filter(([k]) => k !== id)),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM routines WHERE id = ?', [id]);
  },

  updateItem: async (id, title) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, title } : i)) }));
    const db = await getDb();
    await db.runAsync('UPDATE routines SET title = ? WHERE id = ?', [title, id]);
  },

  reorderItems: async (items) => {
    set({ items });
    const db = await getDb();
    for (let i = 0; i < items.length; i++) {
      await db.runAsync('UPDATE routines SET sort_order = ? WHERE id = ?', [i, items[i].id]);
    }
  },

  toggleComplete: async (id) => {
    const today = todayStr();
    const current = get().completedToday[id];
    const db = await getDb();
    if (current === today) {
      set((s) => {
        const next = { ...s.completedToday };
        delete next[id];
        return { completedToday: next };
      });
      await db.runAsync('DELETE FROM routine_completions WHERE routine_id = ? AND date = ?', [id, today]);
    } else {
      set((s) => ({ completedToday: { ...s.completedToday, [id]: today } }));
      await db.runAsync('INSERT OR REPLACE INTO routine_completions (routine_id, date) VALUES (?, ?)', [id, today]);
    }
  },

  isCompletedToday: (id) => get().completedToday[id] === todayStr(),
  getCompletedCount: () => {
    const today = todayStr();
    return Object.values(get().completedToday).filter((d) => d === today).length;
  },
}));
