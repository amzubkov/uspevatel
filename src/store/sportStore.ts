import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';
import { zustandStorage } from '../utils/storage';

export interface PullUpEntry {
  id: string;
  count: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

interface SportState {
  pullUps: PullUpEntry[];
  addPullUps: (count: number) => void;
  removePullUp: (id: string) => void;
  getTodayTotal: () => number;
  getTodayEntries: () => PullUpEntry[];
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const useSportStore = create<SportState>()(
  persist(
    (set, get) => ({
      pullUps: [],

      addPullUps: (count) => {
        const entry: PullUpEntry = {
          id: Crypto.randomUUID(),
          count,
          date: todayStr(),
          time: nowTime(),
        };
        set((s) => ({ pullUps: [entry, ...s.pullUps] }));
      },

      removePullUp: (id) => {
        set((s) => ({ pullUps: s.pullUps.filter((e) => e.id !== id) }));
      },

      getTodayTotal: () => {
        const today = todayStr();
        return get().pullUps.filter((e) => e.date === today).reduce((sum, e) => sum + e.count, 0);
      },

      getTodayEntries: () => {
        const today = todayStr();
        return get().pullUps.filter((e) => e.date === today);
      },
    }),
    {
      name: 'sport-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
