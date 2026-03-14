import { useState, useCallback, useEffect } from 'react';

export type SportType = 'pullups' | 'abs' | 'triceps' | 'run' | 'weight';

export interface SportEntry {
  id: string;
  type: SportType;
  label?: string;
  count: number;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
}

const STORAGE_KEY = 'sport_entries';

function load(): SportEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(entries: SportEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function useSport() {
  const [entries, setEntries] = useState<SportEntry[]>(load);

  useEffect(() => { save(entries); }, [entries]);

  const addEntry = useCallback((type: SportType, count: number, label?: string) => {
    const entry: SportEntry = {
      id: crypto.randomUUID(),
      type,
      count,
      label,
      date: todayStr(),
      time: nowTime(),
    };
    setEntries(prev => [entry, ...prev]);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const updateEntry = useCallback((id: string, updates: Partial<Pick<SportEntry, 'count' | 'label'>>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  return { entries, addEntry, removeEntry, updateEntry };
}
