import { useState, useEffect, useCallback } from 'react';

interface Settings {
  syncUrl: string;
  theme: 'light' | 'dark';
  fontSize: number;
  contextCategories: string[];
  lastSyncAt: string | null;
}

const DEFAULTS: Settings = {
  syncUrl: '',
  theme: 'dark',
  fontSize: 15,
  contextCategories: [],
  lastSyncAt: null,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('uspevatel-settings');
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings(s: Settings) {
  localStorage.setItem('uspevatel-settings', JSON.stringify(s));
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);

  const update = useCallback((partial: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      if (next.fontSize < 12) next.fontSize = 12;
      if (next.fontSize > 20) next.fontSize = 20;
      saveSettings(next);
      return next;
    });
  }, []);

  const addContextCategory = useCallback((name: string): boolean => {
    const s = loadSettings();
    if (s.contextCategories.length >= 5) return false;
    if (s.contextCategories.includes(name)) return false;
    update({ contextCategories: [...s.contextCategories, name] });
    return true;
  }, [update]);

  const removeContextCategory = useCallback((name: string) => {
    const s = loadSettings();
    update({ contextCategories: s.contextCategories.filter((c) => c !== name) });
  }, [update]);

  return { ...settings, update, addContextCategory, removeContextCategory };
}
