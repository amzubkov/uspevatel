import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';
import { zustandStorage } from '../utils/storage';

export interface RoutineItem {
  id: string;
  title: string;
  order: number;
}

interface RoutineState {
  items: RoutineItem[];
  completedToday: Record<string, string>; // itemId -> date (YYYY-MM-DD)

  addItem: (title: string) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, title: string) => void;
  reorderItems: (items: RoutineItem[]) => void;
  toggleComplete: (id: string) => void;
  isCompletedToday: (id: string) => boolean;
  getCompletedCount: () => number;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set, get) => ({
      items: [],
      completedToday: {},

      addItem: (title) => {
        const item: RoutineItem = {
          id: Crypto.randomUUID(),
          title,
          order: get().items.length,
        };
        set((s) => ({ items: [...s.items, item] }));
      },

      removeItem: (id) => {
        set((s) => ({
          items: s.items.filter((i) => i.id !== id),
          completedToday: Object.fromEntries(
            Object.entries(s.completedToday).filter(([k]) => k !== id)
          ),
        }));
      },

      updateItem: (id, title) => {
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, title } : i)),
        }));
      },

      reorderItems: (items) => set({ items }),

      toggleComplete: (id) => {
        const today = todayStr();
        const current = get().completedToday[id];
        if (current === today) {
          // Uncheck
          set((s) => {
            const next = { ...s.completedToday };
            delete next[id];
            return { completedToday: next };
          });
        } else {
          // Check
          set((s) => ({
            completedToday: { ...s.completedToday, [id]: today },
          }));
        }
      },

      isCompletedToday: (id) => {
        return get().completedToday[id] === todayStr();
      },

      getCompletedCount: () => {
        const today = todayStr();
        return Object.values(get().completedToday).filter((d) => d === today).length;
      },
    }),
    {
      name: 'routine-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
