import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';
import { Task, Category, WeekStats } from '../types';
import { zustandStorage } from '../utils/storage';

interface TaskState {
  tasks: Task[];
  weekStats: WeekStats[];

  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completed' | 'completedAt'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, category: Category) => void;
  completeTask: (id: string) => void;
  uncompleteTask: (id: string) => void;
  importTask: (task: Task) => void;
  getTasksByCategory: (category: Category) => Task[];
  getTasksByProject: (projectName: string) => Task[];
  getTasksByContext: (context: string) => Task[];
  getCompletedThisWeek: () => Task[];
  addWeekStats: (stats: Omit<WeekStats, 'weekStart'>) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      weekStats: [],

      addTask: (taskData) => {
        const now = new Date().toISOString();
        const task: Task = {
          ...taskData,
          id: Crypto.randomUUID(),
          completed: false,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ tasks: [...state.tasks, task] }));
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
          ),
        }));
      },

      deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      },

      moveTask: (id, category) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, category, updatedAt: new Date().toISOString() } : t
          ),
        }));
      },

      completeTask: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, completed: true, completedAt: now, updatedAt: now } : t
          ),
        }));
      },

      uncompleteTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, completed: false, completedAt: undefined, updatedAt: new Date().toISOString() } : t
          ),
        }));
      },

      importTask: (task) => {
        set((state) => {
          const idx = state.tasks.findIndex((t) => t.id === task.id);
          if (idx >= 0) {
            const updated = [...state.tasks];
            updated[idx] = task;
            return { tasks: updated };
          }
          return { tasks: [...state.tasks, task] };
        });
      },

      getTasksByCategory: (category) => {
        return get().tasks.filter((t) => t.category === category && !t.completed);
      },

      getTasksByProject: (projectName) => {
        return get().tasks.filter((t) => t.project === projectName);
      },

      getTasksByContext: (context) => {
        return get().tasks.filter((t) => t.contextCategory === context && !t.completed);
      },

      getCompletedThisWeek: () => {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
        startOfWeek.setHours(0, 0, 0, 0);
        return get().tasks.filter(
          (t) => t.completed && t.completedAt && new Date(t.completedAt) >= startOfWeek
        );
      },

      addWeekStats: (statsData) => {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1);
        startOfWeek.setHours(0, 0, 0, 0);
        const stats: WeekStats = {
          ...statsData,
          weekStart: startOfWeek.toISOString(),
        };
        set((state) => ({ weekStats: [...state.weekStats, stats] }));
      },
    }),
    {
      name: 'task-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
