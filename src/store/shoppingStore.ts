import { create } from 'zustand';
import { getDb } from '../db/database';

const KEY = 'shoppingChecked';

interface ShoppingState {
  checked: Set<string>;   // lowercased product names marked as bought
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (name: string) => Promise<void>;
  clear: () => Promise<void>;
}

async function persist(checked: Set<string>): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [KEY, JSON.stringify([...checked])]);
}

export const useShoppingStore = create<ShoppingState>()((set, get) => ({
  checked: new Set(),
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [KEY]);
    let arr: string[] = [];
    try { arr = JSON.parse(row?.value || '[]'); } catch {}
    set({ checked: new Set(Array.isArray(arr) ? arr : []), loaded: true });
  },

  toggle: async (name) => {
    const key = name.trim().toLowerCase();
    const next = new Set(get().checked);
    if (next.has(key)) next.delete(key); else next.add(key);
    set({ checked: next });
    await persist(next);
  },

  clear: async () => {
    set({ checked: new Set() });
    await persist(new Set());
  },
}));
