import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Settings } from '../types';
import { zustandStorage } from '../utils/storage';

interface SettingsState extends Settings {
  addContextCategory: (name: string) => boolean;
  removeContextCategory: (name: string) => void;
  setDailyReminderTime: (time: string) => void;
  setWeeklyReminderTime: (time: string) => void;
  setWeeklyReminderDay: (day: number) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setFontSize: (size: number) => void;
  setSyncUrl: (url: string) => void;
  setLastSyncAt: (date: string | null) => void;
  addKnownSyncIds: (ids: string[]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      contextCategories: [],
      dailyReminderTime: '09:00',
      weeklyReminderTime: '10:00',
      weeklyReminderDay: 0, // Sunday
      theme: 'dark',
      fontSize: 15,
      syncUrl: '',
      lastSyncAt: null,
      knownSyncIds: [],

      addContextCategory: (name) => {
        const current = get().contextCategories;
        if (current.length >= 5) return false;
        if (current.includes(name)) return false;
        set({ contextCategories: [...current, name] });
        return true;
      },

      removeContextCategory: (name) => {
        set((state) => ({
          contextCategories: state.contextCategories.filter((c) => c !== name),
        }));
      },

      setDailyReminderTime: (time) => set({ dailyReminderTime: time }),
      setWeeklyReminderTime: (time) => set({ weeklyReminderTime: time }),
      setWeeklyReminderDay: (day) => set({ weeklyReminderDay: day }),
      setTheme: (theme) => set({ theme }),
      setFontSize: (size) => set({ fontSize: Math.max(12, Math.min(20, size)) }),
      setSyncUrl: (url) => set({ syncUrl: url }),
      setLastSyncAt: (date) => set({ lastSyncAt: date }),
      addKnownSyncIds: (ids) => {
        const current = get().knownSyncIds;
        const merged = Array.from(new Set([...current, ...ids]));
        set({ knownSyncIds: merged });
      },
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
