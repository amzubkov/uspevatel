import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface DailyLog {
  id: string;
  date: string;           // YYYY-MM-DD
  sleepHours?: number;
  sleepQuality?: number;  // percent; current UI uses 70, 75, 80, 85, 90
  productivity?: number;  // 1-5, legacy read-only: UI input removed in v8.13, old values still shown in history
  motivation?: number;    // 1-5
  dayRating?: number;     // 1-5
  sportFootball: number;  // minutes
  sportRun: number;       // minutes
  notes: string;
  createdAt: string;
}

interface DailyLogState {
  logs: DailyLog[];
  loaded: boolean;
  load: () => Promise<void>;
  saveLog: (date: string, fields: Partial<Omit<DailyLog, 'id' | 'date' | 'createdAt'>>) => Promise<void>;
  getLog: (date: string) => DailyLog | undefined;
}

export const useDailyLogStore = create<DailyLogState>()((set, get) => ({
  logs: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync<any>('SELECT * FROM daily_logs ORDER BY date DESC');
    set({
      logs: rows.map((r) => ({
        id: r.id,
        date: r.date,
        sleepHours: r.sleep_hours ?? undefined,
        sleepQuality: r.sleep_quality ?? undefined,
        productivity: r.productivity ?? undefined,
        motivation: r.motivation ?? undefined,
        dayRating: r.day_rating ?? undefined,
        sportFootball: r.sport_football || 0,
        sportRun: r.sport_run || 0,
        notes: r.notes || '',
        createdAt: r.created_at,
      })),
      loaded: true,
    });
  },

  saveLog: async (date, fields) => {
    const existing = get().logs.find((l) => l.date === date);
    if (existing) {
      const updated = { ...existing, ...fields };
      set((s) => ({ logs: s.logs.map((l) => l.date === date ? updated : l) }));
      const db = await getDb();
      await db.runAsync(
        `UPDATE daily_logs SET sleep_hours=?, sleep_quality=?, motivation=?, day_rating=?, sport_football=?, sport_run=?, notes=? WHERE id=?`,
        [updated.sleepHours ?? null, updated.sleepQuality ?? null,
         updated.motivation ?? null, updated.dayRating ?? null, updated.sportFootball, updated.sportRun, updated.notes, existing.id]
      );
    } else {
      const log: DailyLog = {
        id: Crypto.randomUUID(),
        date,
        sleepHours: fields.sleepHours,
        sleepQuality: fields.sleepQuality,
        motivation: fields.motivation,
        dayRating: fields.dayRating,
        sportFootball: fields.sportFootball ?? 0,
        sportRun: fields.sportRun ?? 0,
        notes: fields.notes ?? '',
        createdAt: new Date().toISOString(),
      };
      set((s) => ({ logs: [log, ...s.logs] }));
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO daily_logs (id, date, sleep_hours, sleep_quality, motivation, day_rating, sport_football, sport_run, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [log.id, log.date, log.sleepHours ?? null, log.sleepQuality ?? null,
         log.motivation ?? null, log.dayRating ?? null, log.sportFootball, log.sportRun, log.notes, log.createdAt]
      );
    }
  },

  getLog: (date) => get().logs.find((l) => l.date === date),
}));
