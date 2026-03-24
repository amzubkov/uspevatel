import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface Traveler {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  createdAt: string;
}

// "Я" is a virtual traveler with id = null (flights with traveler_id IS NULL)
export const ME_TRAVELER: Traveler = {
  id: '__me__',
  name: 'Я',
  icon: '🙂',
  sortOrder: -1,
  createdAt: '',
};

interface TravelerState {
  travelers: Traveler[];
  loaded: boolean;
  load: () => Promise<void>;
  addTraveler: (name: string, icon: string) => Promise<void>;
  updateTraveler: (id: string, fields: Partial<Pick<Traveler, 'name' | 'icon'>>) => Promise<void>;
  removeTraveler: (id: string) => Promise<void>;
}

function rowToTraveler(r: any): Traveler {
  return { id: r.id, name: r.name, icon: r.icon, sortOrder: r.sort_order, createdAt: r.created_at };
}

export const useTravelerStore = create<TravelerState>()((set, get) => ({
  travelers: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM travelers ORDER BY sort_order');
    set({ travelers: rows.map(rowToTraveler), loaded: true });
  },

  addTraveler: async (name, icon) => {
    const maxOrder = Math.max(0, ...get().travelers.map((t) => t.sortOrder));
    const t: Traveler = { id: Crypto.randomUUID(), name, icon, sortOrder: maxOrder + 1, createdAt: new Date().toISOString() };
    set((s) => ({ travelers: [...s.travelers, t] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO travelers (id, name, icon, sort_order, created_at) VALUES (?,?,?,?,?)',
      [t.id, t.name, t.icon, t.sortOrder, t.createdAt],
    );
  },

  updateTraveler: async (id, fields) => {
    set((s) => ({ travelers: s.travelers.map((t) => t.id === id ? { ...t, ...fields } : t) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name); }
    if (fields.icon !== undefined) { sets.push('icon = ?'); vals.push(fields.icon); }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE travelers SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removeTraveler: async (id) => {
    set((s) => ({ travelers: s.travelers.filter((t) => t.id !== id) }));
    const db = await getDb();
    // Unlink flights from removed traveler
    await db.runAsync('UPDATE flights SET traveler_id = NULL WHERE traveler_id = ?', [id]);
    await db.runAsync('DELETE FROM travelers WHERE id = ?', [id]);
  },
}));
