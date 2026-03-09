import { create } from 'zustand';
import { Settings } from '../types';
import { getDb } from '../db/database';

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
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

async function getSetting(key: string, fallback: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? fallback;
}

async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  contextCategories: [],
  dailyReminderTime: '09:00',
  weeklyReminderTime: '10:00',
  weeklyReminderDay: 0,
  theme: 'dark',
  fontSize: 15,
  syncUrl: '',
  lastSyncAt: null,
  knownSyncIds: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const contextCategories = JSON.parse(await getSetting('contextCategories', '[]'));
    const dailyReminderTime = await getSetting('dailyReminderTime', '09:00');
    const weeklyReminderTime = await getSetting('weeklyReminderTime', '10:00');
    const weeklyReminderDay = parseInt(await getSetting('weeklyReminderDay', '0'));
    const theme = (await getSetting('theme', 'dark')) as 'light' | 'dark';
    const fontSize = parseInt(await getSetting('fontSize', '15'));
    const syncUrl = await getSetting('syncUrl', '');
    const lastSyncAt = await getSetting('lastSyncAt', '');
    const knownSyncIds = JSON.parse(await getSetting('knownSyncIds', '[]'));
    set({
      contextCategories, dailyReminderTime, weeklyReminderTime, weeklyReminderDay,
      theme, fontSize, syncUrl, lastSyncAt: lastSyncAt || null, knownSyncIds, loaded: true,
    });
  },

  addContextCategory: (name) => {
    const current = get().contextCategories;
    if (current.length >= 5 || current.includes(name)) return false;
    const next = [...current, name];
    set({ contextCategories: next });
    setSetting('contextCategories', JSON.stringify(next));
    return true;
  },

  removeContextCategory: (name) => {
    const next = get().contextCategories.filter((c) => c !== name);
    set({ contextCategories: next });
    setSetting('contextCategories', JSON.stringify(next));
  },

  setDailyReminderTime: (time) => { set({ dailyReminderTime: time }); setSetting('dailyReminderTime', time); },
  setWeeklyReminderTime: (time) => { set({ weeklyReminderTime: time }); setSetting('weeklyReminderTime', time); },
  setWeeklyReminderDay: (day) => { set({ weeklyReminderDay: day }); setSetting('weeklyReminderDay', String(day)); },
  setTheme: (theme) => { set({ theme }); setSetting('theme', theme); },
  setFontSize: (size) => { const s = Math.max(12, Math.min(20, size)); set({ fontSize: s }); setSetting('fontSize', String(s)); },
  setSyncUrl: (url) => { set({ syncUrl: url }); setSetting('syncUrl', url); },
  setLastSyncAt: (date) => { set({ lastSyncAt: date }); setSetting('lastSyncAt', date || ''); },
  addKnownSyncIds: (ids) => {
    const merged = Array.from(new Set([...get().knownSyncIds, ...ids]));
    set({ knownSyncIds: merged });
    setSetting('knownSyncIds', JSON.stringify(merged));
  },
}));
