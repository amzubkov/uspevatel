import { useState, useCallback, useEffect } from 'react';

export interface Exercise {
  id: number;
  name: string;
  description: string | null;
  tag: string | null;
  weightType: number; // 0=none, 10=dumbbells, 100=barbell
  imageUri?: string;
}

export interface WorkoutLog {
  id: number;
  exerciseId: number;
  weight: number;
  reps: number;
  setNum: number;
  date: string;
  createdAt: string;
}

const EX_KEY = 'exercises';
const LOG_KEY = 'workout_logs';

function loadEx(): Exercise[] {
  try { return JSON.parse(localStorage.getItem(EX_KEY) || '[]'); } catch { return []; }
}
function loadLogs(): WorkoutLog[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

let nextExId = 1;
let nextLogId = 1;

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>(() => {
    const ex = loadEx();
    nextExId = ex.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    return ex;
  });
  const [logs, setLogs] = useState<WorkoutLog[]>(() => {
    const l = loadLogs();
    nextLogId = l.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    return l;
  });

  useEffect(() => { localStorage.setItem(EX_KEY, JSON.stringify(exercises)); }, [exercises]);
  useEffect(() => { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); }, [logs]);

  const addExercise = useCallback((name: string, weightType: number, tag?: string, description?: string) => {
    const id = nextExId++;
    const ex: Exercise = { id, name, description: description || null, tag: tag || null, weightType };
    setExercises(prev => [...prev, ex]);
    return id;
  }, []);

  const updateExercise = useCallback((id: number, updates: Partial<Pick<Exercise, 'name' | 'weightType' | 'tag' | 'description'>>) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  const removeExercise = useCallback((id: number) => {
    setExercises(prev => prev.filter(e => e.id !== id));
    setLogs(prev => prev.filter(l => l.exerciseId !== id));
  }, []);

  const addLog = useCallback((exerciseId: number, weight: number, reps: number, setNum: number) => {
    const id = nextLogId++;
    const log: WorkoutLog = { id, exerciseId, weight, reps, setNum, date: todayStr(), createdAt: nowTimestamp() };
    setLogs(prev => [log, ...prev]);
  }, []);

  const removeLog = useCallback((id: number) => {
    setLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  return { exercises, logs, addExercise, updateExercise, removeExercise, addLog, removeLog };
}
