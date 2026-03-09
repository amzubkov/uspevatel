import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface CheckItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

interface ChecklistState {
  items: CheckItem[];
  loaded: boolean;

  load: () => Promise<void>;
  addItem: (title: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  updateItem: (id: string, title: string) => void;
}

export const useChecklistStore = create<ChecklistState>()((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string; title: string; done: number; created_at: string }>(
      'SELECT * FROM checklist ORDER BY created_at DESC'
    );
    set({ items: rows.map((r) => ({ id: r.id, title: r.title, done: !!r.done, createdAt: r.created_at })), loaded: true });
  },

  addItem: async (title) => {
    const item: CheckItem = { id: Crypto.randomUUID(), title, done: false, createdAt: new Date().toISOString() };
    set((s) => ({ items: [item, ...s.items] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO checklist (id, title, done, created_at) VALUES (?, ?, 0, ?)', [item.id, title, item.createdAt]);
  },

  removeItem: async (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM checklist WHERE id = ?', [id]);
  },

  toggleItem: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const newDone = !item.done;
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, done: newDone } : i)) }));
    const db = await getDb();
    await db.runAsync('UPDATE checklist SET done = ? WHERE id = ?', [newDone ? 1 : 0, id]);
  },

  updateItem: async (id, title) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, title } : i)) }));
    const db = await getDb();
    await db.runAsync('UPDATE checklist SET title = ? WHERE id = ?', [title, id]);
  },
}));
