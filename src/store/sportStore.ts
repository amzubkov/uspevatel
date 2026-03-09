import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';
import { zustandStorage } from '../utils/storage';

export interface SportEntry {
  id: string;
  type: 'pullups' | 'abs' | 'triceps' | 'run' | 'weight';
  label?: string; // e.g. 'football', '5km', '10km', '20km'
  count: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

interface SportState {
  entries: SportEntry[];
  addEntry: (type: SportEntry['type'], count: number, label?: string) => void;
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

export const useSportStore = create<SportState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (type, count, label) => {
        const entry: SportEntry = {
          id: Crypto.randomUUID(),
          type,
          count,
          date: todayStr(),
          time: nowTime(),
          ...(label ? { label } : {}),
        };
        set((s) => ({ entries: [entry, ...s.entries] }));
      },

      removeEntry: (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
      },
    }),
    {
      name: 'sport-storage',
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted: any) => {
        // Migrate from old format (pullUps array) to new (entries array)
        if (persisted && persisted.pullUps && !persisted.entries) {
          return {
            ...persisted,
            entries: persisted.pullUps.map((e: any) => ({ ...e, type: 'pullups' })),
          };
        }
        return persisted;
      },
      version: 1,
    }
  )
);
