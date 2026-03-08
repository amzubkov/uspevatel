import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';
import { zustandStorage } from '../utils/storage';

export interface CheckItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

interface ChecklistState {
  items: CheckItem[];
  addItem: (title: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  updateItem: (id: string, title: string) => void;
}

export const useChecklistStore = create<ChecklistState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (title) => {
        const item: CheckItem = {
          id: Crypto.randomUUID(),
          title,
          done: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ items: [item, ...s.items] }));
      },

      removeItem: (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      },

      toggleItem: (id) => {
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
        }));
      },

      updateItem: (id, title) => {
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, title } : i)),
        }));
      },
    }),
    {
      name: 'checklist-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
