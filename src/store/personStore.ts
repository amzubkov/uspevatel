import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface Person {
  id: string;
  name: string;
  sortOrder: number;
}

interface PersonState {
  persons: Person[];
  loaded: boolean;
  load: () => Promise<void>;
  addPerson: (name: string) => Promise<string>;
  updatePerson: (id: string, fields: Partial<Omit<Person, 'id'>>) => Promise<void>;
  removePerson: (id: string) => Promise<void>;
}

function rowToPerson(r: any): Person {
  return { id: r.id, name: r.name, sortOrder: r.sort_order };
}

export const usePersonStore = create<PersonState>()((set, get) => ({
  persons: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM persons ORDER BY sort_order, name');
    set({ persons: rows.map(rowToPerson), loaded: true });
  },

  addPerson: async (name) => {
    const id = Crypto.randomUUID();
    const maxOrder = Math.max(0, ...get().persons.map((p) => p.sortOrder));
    const person: Person = { id, name: name.trim(), sortOrder: maxOrder + 1 };
    set((s) => ({ persons: [...s.persons, person] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO persons (id, name, sort_order) VALUES (?,?,?)',
      [id, person.name, person.sortOrder],
    );
    return id;
  },

  updatePerson: async (id, fields) => {
    set((s) => ({ persons: s.persons.map((p) => (p.id === id ? { ...p, ...fields } : p)) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = { name: 'name', sortOrder: 'sort_order' };
    for (const [k, col] of Object.entries(map)) {
      if ((fields as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE persons SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removePerson: async (id) => {
    set((s) => ({ persons: s.persons.filter((p) => p.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM persons WHERE id = ?', [id]);
  },
}));
