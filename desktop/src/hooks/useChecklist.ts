import { useState, useCallback, useEffect } from 'react';

export interface CheckItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'checklist';

function load(): CheckItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export function useChecklist() {
  const [items, setItems] = useState<CheckItem[]>(load);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items]);

  const addItem = useCallback((title: string) => {
    const item: CheckItem = { id: crypto.randomUUID(), title, done: false, createdAt: new Date().toISOString() };
    setItems(prev => [item, ...prev]);
  }, []);

  const toggleItem = useCallback((id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  }, []);

  const updateItem = useCallback((id: string, title: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, title } : i));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  return { items, addItem, toggleItem, updateItem, removeItem };
}
