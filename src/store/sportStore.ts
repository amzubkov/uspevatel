import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface SportEntry {
  id: string;
  type: 'pullups' | 'abs' | 'triceps' | 'run' | 'weight';
  label?: string;
  count: number;
  date: string;
  time: string;
}

interface SportState {
  entries: SportEntry[];
  loaded: boolean;

  load: () => Promise<void>;
  addEntry: (type: SportEntry['type'], count: number, label?: string) => void;
  updateEntry: (id: string, fields: Partial<Pick<SportEntry, 'count' | 'label' | 'date' | 'time'>>) => void;
  removeEntry: (id: string) => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const useSportStore = create<SportState>()((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string; type: string; label: string | null; count: number; date: string; time: string }>(
      'SELECT * FROM sport_entries ORDER BY date DESC, time DESC'
    );
    set({
      entries: rows.map((r) => ({ id: r.id, type: r.type as SportEntry['type'], label: r.label || undefined, count: r.count, date: r.date, time: r.time })),
      loaded: true,
    });
  },

  addEntry: async (type, count, label) => {
    const entry: SportEntry = { id: Crypto.randomUUID(), type, count, date: todayStr(), time: nowTime(), ...(label ? { label } : {}) };
    set((s) => ({ entries: [entry, ...s.entries] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO sport_entries (id, type, label, count, date, time) VALUES (?, ?, ?, ?, ?, ?)',
      [entry.id, type, label || null, count, entry.date, entry.time]);
  },

  updateEntry: async (id, fields) => {
    set((s) => ({ entries: s.entries.map((e) => e.id === id ? { ...e, ...fields } : e) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.count !== undefined) { sets.push('count = ?'); vals.push(fields.count); }
    if (fields.label !== undefined) { sets.push('label = ?'); vals.push(fields.label); }
    if (fields.date !== undefined) { sets.push('date = ?'); vals.push(fields.date); }
    if (fields.time !== undefined) { sets.push('time = ?'); vals.push(fields.time); }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE sport_entries SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removeEntry: async (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM sport_entries WHERE id = ?', [id]);
  },
}));
