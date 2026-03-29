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

export interface MetricRef {
  id: string;
  metricId: string;
  source: string; // WHO, MZ_RF, USPSTF
  refMin?: number;
  refMax?: number;
  periodDays?: number;
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
  metricRefs: MetricRef[];
  entries: HealthEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  addMetric: (m: Omit<HealthMetric, 'id' | 'sortOrder'>) => Promise<void>;
  updateMetric: (id: string, fields: Partial<Omit<HealthMetric, 'id'>>) => Promise<void>;
  removeMetric: (id: string) => Promise<void>;
  addEntry: (e: Omit<HealthEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateEntry: (id: string, fields: Partial<Omit<HealthEntry, 'id' | 'createdAt'>>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  bulkImport: (lines: { name: string; value: number; unit?: string; refMin?: number; refMax?: number }[], date: string) => Promise<number>;
  loadPresets: () => Promise<number>;
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
  metricRefs: [],
  entries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const mRows = await db.getAllAsync('SELECT * FROM health_metrics ORDER BY sort_order, name');
    const eRows = await db.getAllAsync('SELECT * FROM health_entries ORDER BY date DESC');
    const rRows = await db.getAllAsync('SELECT * FROM health_metric_refs') as any[];
    const metricRefs: MetricRef[] = rRows.map((r: any) => ({
      id: r.id, metricId: r.metric_id, source: r.source,
      refMin: r.ref_min != null ? r.ref_min : undefined,
      refMax: r.ref_max != null ? r.ref_max : undefined,
      periodDays: r.period_days != null ? r.period_days : undefined,
    }));
    set({ metrics: mRows.map(rowToMetric), metricRefs, entries: eRows.map(rowToEntry), loaded: true });
    // Auto-load presets if no metrics, no refs, or new sources missing
    const hasSources = new Set(rRows.map((r: any) => r.source));
    if (mRows.length === 0 || rRows.length === 0 || !hasSources.has('JSHC') || !hasSources.has('CN_WST') || !hasSources.has('ESC')) {
      await get().loadPresets();
    }
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

    for (const { name, value, unit, refMin, refMax } of lines) {
      const nameLower = name.toLowerCase();
      let metric = currentMetrics.find((m) => m.name.toLowerCase() === nameLower);
      if (!metric) {
        maxOrder++;
        metric = { id: Crypto.randomUUID(), name, unit: unit || '', refMin, refMax, sortOrder: maxOrder };
        newMetrics.push(metric);
        currentMetrics.push(metric);
        await db.runAsync(
          'INSERT INTO health_metrics (id, name, unit, ref_min, ref_max, period_days, sort_order) VALUES (?,?,?,?,?,?,?)',
          [metric.id, metric.name, metric.unit, refMin ?? null, refMax ?? null, null, metric.sortOrder],
        );
      } else if (unit || refMin != null || refMax != null) {
        // Update existing metric with new ref data if provided
        if (unit && !metric.unit) { metric.unit = unit; await db.runAsync('UPDATE health_metrics SET unit = ? WHERE id = ?', [unit, metric.id]); }
        if (refMin != null && metric.refMin == null) { metric.refMin = refMin; await db.runAsync('UPDATE health_metrics SET ref_min = ? WHERE id = ?', [refMin, metric.id]); }
        if (refMax != null && metric.refMax == null) { metric.refMax = refMax; await db.runAsync('UPDATE health_metrics SET ref_max = ? WHERE id = ?', [refMax, metric.id]); }
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

  loadPresets: async () => {
    const { HEALTH_PRESETS } = require('../db/healthPresets');
    const db = await getDb();
    let currentMetrics = [...get().metrics];
    const newMetrics: HealthMetric[] = [];
    const newRefs: MetricRef[] = [];
    let maxOrder = Math.max(0, ...currentMetrics.map((x) => x.sortOrder));
    let added = 0;

    for (const p of HEALTH_PRESETS) {
      let metric = currentMetrics.find((m) => m.name.toLowerCase() === p.name.toLowerCase());
      if (!metric) {
        maxOrder++;
        // Use first ref as default
        const firstRef = p.refs[0];
        metric = {
          id: Crypto.randomUUID(), name: p.name, unit: p.unit,
          refMin: firstRef?.refMin, refMax: firstRef?.refMax,
          periodDays: firstRef?.periodDays, sortOrder: maxOrder,
        };
        newMetrics.push(metric);
        currentMetrics.push(metric);
        await db.runAsync(
          'INSERT INTO health_metrics (id, name, unit, ref_min, ref_max, period_days, sort_order) VALUES (?,?,?,?,?,?,?)',
          [metric.id, metric.name, metric.unit, metric.refMin ?? null, metric.refMax ?? null, metric.periodDays ?? null, metric.sortOrder],
        );
        added++;
      } else if (!metric.unit && p.unit) {
        metric.unit = p.unit;
        await db.runAsync('UPDATE health_metrics SET unit = ? WHERE id = ?', [p.unit, metric.id]);
      }

      // Insert refs for each source
      for (const ref of p.refs) {
        const refId = Crypto.randomUUID();
        try {
          await db.runAsync(
            'INSERT OR IGNORE INTO health_metric_refs (id, metric_id, source, ref_min, ref_max, period_days) VALUES (?,?,?,?,?,?)',
            [refId, metric.id, ref.source, ref.refMin ?? null, ref.refMax ?? null, ref.periodDays ?? null],
          );
          newRefs.push({ id: refId, metricId: metric.id, source: ref.source, refMin: ref.refMin, refMax: ref.refMax, periodDays: ref.periodDays });
        } catch {}
      }
    }

    set((s) => ({
      metrics: [...s.metrics, ...newMetrics],
      metricRefs: [...s.metricRefs, ...newRefs],
    }));
    return added;
  },
}));
