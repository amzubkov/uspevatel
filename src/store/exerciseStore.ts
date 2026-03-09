import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';
import { zustandStorage } from '../utils/storage';

export interface Exercise {
  id: string;
  name: string;
  imageUri?: string; // local file URI
  weightType: 'none' | 'dumbbells' | 'barbell';
  tag?: string; // группа мышц
}

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  weight: number;
  reps: number;
  sets: number;
  date: string;
  time: string;
}

interface ExerciseState {
  exercises: Exercise[];
  logs: ExerciseLog[];
  addExercise: (name: string, weightType: Exercise['weightType'], imageUri?: string, tag?: string) => void;
  updateExercise: (id: string, updates: Partial<Pick<Exercise, 'name' | 'imageUri' | 'weightType'>>) => void;
  removeExercise: (id: string) => void;
  addLog: (exerciseId: string, weight: number, reps: number, sets: number) => void;
  removeLog: (id: string) => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const useExerciseStore = create<ExerciseState>()(
  persist(
    (set) => ({
      exercises: [],
      logs: [],

      addExercise: (name, weightType, imageUri, tag) => {
        const exercise: Exercise = { id: Crypto.randomUUID(), name, weightType, imageUri, ...(tag ? { tag } : {}) };
        set((s) => ({ exercises: [...s.exercises, exercise] }));
      },

      updateExercise: (id, updates) => {
        set((s) => ({
          exercises: s.exercises.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }));
      },

      removeExercise: (id) => {
        set((s) => ({
          exercises: s.exercises.filter((e) => e.id !== id),
          logs: s.logs.filter((l) => l.exerciseId !== id),
        }));
      },

      addLog: (exerciseId, weight, reps, sets) => {
        const log: ExerciseLog = {
          id: Crypto.randomUUID(),
          exerciseId,
          weight,
          reps,
          sets,
          date: todayStr(),
          time: nowTime(),
        };
        set((s) => ({ logs: [log, ...s.logs] }));
      },

      removeLog: (id) => {
        set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
      },
    }),
    {
      name: 'exercise-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
