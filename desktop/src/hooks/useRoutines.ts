import { useState, useCallback, useEffect, useMemo } from 'react';

export interface RoutineItem {
  id: string;
  title: string;
  order: number;
}

const ITEMS_KEY = 'routine_items';
const COMPLETIONS_KEY = 'routine_completions'; // { [date]: string[] }

function loadItems(): RoutineItem[] {
  try { return JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]'); } catch { return []; }
}
function loadCompletions(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(COMPLETIONS_KEY) || '{}'); } catch { return {}; }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useRoutines() {
  const [items, setItems] = useState<RoutineItem[]>(loadItems);
  const [completions, setCompletions] = useState<Record<string, string[]>>(loadCompletions);

  useEffect(() => { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions)); }, [completions]);

  const today = todayStr();
  const completedToday = useMemo(() => completions[today] || [], [completions, today]);

  const addItem = useCallback((title: string) => {
    const item: RoutineItem = { id: crypto.randomUUID(), title, order: items.length };
    setItems(prev => [...prev, item]);
  }, [items.length]);

  const updateItem = useCallback((id: string, title: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, title } : i));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const toggleComplete = useCallback((id: string) => {
    setCompletions(prev => {
      const arr = prev[today] || [];
      const next = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
      return { ...prev, [today]: next };
    });
  }, [today]);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setItems(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      return sorted.map((item, i) => ({ ...item, order: i }));
    });
  }, []);

  return { items, completedToday, addItem, updateItem, removeItem, toggleComplete, reorder };
}
