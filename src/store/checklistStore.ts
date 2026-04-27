import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface Checklist {
  id: string;
  name: string;
  sortOrder: number;
}

export interface CheckItem {
  id: string;
  listId: string;
  title: string;
  done: boolean;
  createdAt: string;
}

interface ChecklistState {
  lists: Checklist[];
  items: CheckItem[];
  activeListId: string;
  loaded: boolean;

  load: () => Promise<void>;

  // List operations
  addList: (name: string) => Promise<void>;
  removeList: (id: string) => void;
  renameList: (id: string, name: string) => void;
  setActiveList: (id: string) => void;

  // Item operations
  addItem: (title: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  updateItem: (id: string, title: string) => void;
}

export const useChecklistStore = create<ChecklistState>()((set, get) => ({
  lists: [],
  items: [],
  activeListId: 'default',
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const listRows = await db.getAllAsync<{ id: string; name: string; sort_order: number }>(
      'SELECT * FROM checklists ORDER BY sort_order'
    );
    const lists = listRows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
    if (lists.length === 0) {
      await db.runAsync("INSERT INTO checklists (id, name, sort_order) VALUES ('default', 'Чеклист', 0)");
      lists.push({ id: 'default', name: 'Чеклист', sortOrder: 0 });
    }
    const rows = await db.getAllAsync<{ id: string; list_id: string; title: string; done: number; created_at: string }>(
      'SELECT * FROM checklist ORDER BY created_at DESC'
    );
    set({
      lists,
      items: rows.map((r) => ({ id: r.id, listId: r.list_id, title: r.title, done: !!r.done, createdAt: r.created_at })),
      activeListId: lists[0]?.id ?? 'default',
      loaded: true,
    });
  },

  addList: async (name) => {
    const id = Crypto.randomUUID();
    const sortOrder = get().lists.length;
    const list: Checklist = { id, name, sortOrder };
    set((s) => ({ lists: [...s.lists, list], activeListId: id }));
    try {
      const db = await getDb();
      await db.runAsync('INSERT INTO checklists (id, name, sort_order) VALUES (?, ?, ?)', [id, name, sortOrder]);
    } catch (e: any) {
      console.warn('addList DB error:', e?.message);
    }
  },

  removeList: async (id) => {
    if (id === 'default') return;
    const { lists, activeListId } = get();
    const remaining = lists.filter((l) => l.id !== id);
    const newActive = activeListId === id ? (remaining[0]?.id ?? 'default') : activeListId;
    set((s) => ({
      lists: remaining,
      items: s.items.filter((i) => i.listId !== id),
      activeListId: newActive,
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM checklist WHERE list_id = ?', [id]);
    await db.runAsync('DELETE FROM checklists WHERE id = ?', [id]);
  },

  renameList: async (id, name) => {
    set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)) }));
    const db = await getDb();
    await db.runAsync('UPDATE checklists SET name = ? WHERE id = ?', [name, id]);
  },

  setActiveList: (id) => set({ activeListId: id }),

  addItem: async (title) => {
    const listId = get().activeListId;
    const item: CheckItem = { id: Crypto.randomUUID(), listId, title, done: false, createdAt: new Date().toISOString() };
    set((s) => ({ items: [item, ...s.items] }));
    try {
      const db = await getDb();
      await db.runAsync('INSERT INTO checklist (id, list_id, title, done, created_at) VALUES (?, ?, ?, 0, ?)', [item.id, listId, title, item.createdAt]);
    } catch (e: any) {
      console.warn('addItem DB error:', e?.message);
    }
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
