import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface HealthMetric {
  id: string;
  name: string;
  unit: string;
  refMin?: number;
  refMax?: number;
  periodDays?: number;
  sortOrder: number;
}

export interface HealthEntry {
  id: string;
  metricId: string;
  value: number;
  date: string;       // YYYY-MM-DD
  notes: string;
  createdAt: string;
}

interface HealthState {
  metrics: HealthMetric[];
  entries: HealthEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  addMetric: (m: Omit<HealthMetric, 'id' | 'sortOrder'>) => Promise<void>;
  updateMetric: (id: string, fields: Partial<Omit<HealthMetric, 'id'>>) => Promise<void>;
  removeMetric: (id: string) => Promise<void>;
  addEntry: (e: Omit<HealthEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateEntry: (id: string, fields: Partial<Omit<HealthEntry, 'id' | 'createdAt'>>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  bulkImport: (lines: { name: string; value: number }[], date: string) => Promise<number>;
}

function rowToMetric(r: any): HealthMetric {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit,
    refMin: r.ref_min != null ? r.ref_min : undefined,
    refMax: r.ref_max != null ? r.ref_max : undefined,
    periodDays: r.period_days != null ? r.period_days : undefined,
    sortOrder: r.sort_order,
  };
}

function rowToEntry(r: any): HealthEntry {
  return {
    id: r.id,
    metricId: r.metric_id,
    value: r.value,
    date: r.date,
    notes: r.notes || '',
    createdAt: r.created_at,
  };
}

export const useHealthStore = create<HealthState>()((set, get) => ({
  metrics: [],
  entries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const mRows = await db.getAllAsync('SELECT * FROM health_metrics ORDER BY sort_order, name');
    const eRows = await db.getAllAsync('SELECT * FROM health_entries ORDER BY date DESC');
    set({ metrics: mRows.map(rowToMetric), entries: eRows.map(rowToEntry), loaded: true });
  },

  addMetric: async (m) => {
    const maxOrder = Math.max(0, ...get().metrics.map((x) => x.sortOrder));
    const metric: HealthMetric = { ...m, id: Crypto.randomUUID(), sortOrder: maxOrder + 1 };
    set((s) => ({ metrics: [...s.metrics, metric] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO health_metrics (id, name, unit, ref_min, ref_max, period_days, sort_order) VALUES (?,?,?,?,?,?,?)',
      [metric.id, metric.name, metric.unit, metric.refMin ?? null, metric.refMax ?? null, metric.periodDays ?? null, metric.sortOrder],
    );
  },

  updateMetric: async (id, fields) => {
    set((s) => ({ metrics: s.metrics.map((m) => (m.id === id ? { ...m, ...fields } : m)) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = {
      name: 'name', unit: 'unit', refMin: 'ref_min', refMax: 'ref_max', periodDays: 'period_days', sortOrder: 'sort_order',
    };
    for (const [k, col] of Object.entries(map)) {
      if ((fields as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE health_metrics SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removeMetric: async (id) => {
    set((s) => ({
      metrics: s.metrics.filter((m) => m.id !== id),
      entries: s.entries.filter((e) => e.metricId !== id),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM health_metrics WHERE id = ?', [id]);
  },

  addEntry: async (e) => {
    const entry: HealthEntry = { ...e, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
    set((s) => ({ entries: [entry, ...s.entries] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO health_entries (id, metric_id, value, date, notes, created_at) VALUES (?,?,?,?,?,?)',
      [entry.id, entry.metricId, entry.value, entry.date, entry.notes, entry.createdAt],
    );
  },

  updateEntry: async (id, fields) => {
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...fields } : e)) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = {
      metricId: 'metric_id', value: 'value', date: 'date', notes: 'notes',
    };
    for (const [k, col] of Object.entries(map)) {
      if ((fields as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE health_entries SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removeEntry: async (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM health_entries WHERE id = ?', [id]);
  },

  bulkImport: async (lines, date) => {
    const db = await getDb();
    const now = new Date().toISOString();
    let currentMetrics = [...get().metrics];
    const newEntries: HealthEntry[] = [];
    const newMetrics: HealthMetric[] = [];
    let maxOrder = Math.max(0, ...currentMetrics.map((x) => x.sortOrder));

    for (const { name, value } of lines) {
      const nameLower = name.toLowerCase();
      let metric = currentMetrics.find((m) => m.name.toLowerCase() === nameLower);
      if (!metric) {
        maxOrder++;
        metric = { id: Crypto.randomUUID(), name, unit: '', sortOrder: maxOrder };
        newMetrics.push(metric);
        currentMetrics.push(metric);
        await db.runAsync(
          'INSERT INTO health_metrics (id, name, unit, ref_min, ref_max, period_days, sort_order) VALUES (?,?,?,?,?,?,?)',
          [metric.id, metric.name, '', null, null, null, metric.sortOrder],
        );
      }
      const entry: HealthEntry = {
        id: Crypto.randomUUID(), metricId: metric.id, value, date, notes: '', createdAt: now,
      };
      newEntries.push(entry);
      await db.runAsync(
        'INSERT INTO health_entries (id, metric_id, value, date, notes, created_at) VALUES (?,?,?,?,?,?)',
        [entry.id, entry.metricId, entry.value, entry.date, entry.notes, entry.createdAt],
      );
    }

    set((s) => ({
      metrics: [...s.metrics, ...newMetrics],
      entries: [...newEntries, ...s.entries],
    }));
    return lines.length;
  },
}));
