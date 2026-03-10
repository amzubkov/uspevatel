import { create } from 'zustand';
import * as FileSystem from 'expo-file-system';
import { getDb } from '../db/database';

export interface Exercise {
  id: number;
  name: string;
  description: string | null;
  imageUri: string | null;
  imageBase64: string | null; // base64 encoded image from DB BLOB
  orderNum: number;
  tag: string | null;
  weightType: number; // 0=none, 10=dumbbells, 100=barbell
  mediaType: string;
  isPreset: boolean;
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

export interface Program {
  id: number;
  name: string;
}

export interface Day {
  id: number;
  programId: number;
  dayNumber: number;
  name: string | null;
  description: string | null;
}

interface ExerciseState {
  exercises: Exercise[];
  logs: WorkoutLog[];
  programs: Program[];
  days: Day[];
  loaded: boolean;

  load: () => Promise<void>;
  addExercise: (name: string, weightType: number, tag?: string, description?: string, imageUri?: string) => Promise<number>;
  updateExercise: (id: number, updates: Partial<Pick<Exercise, 'name' | 'imageUri' | 'weightType' | 'tag' | 'description'>>) => void;
  removeExercise: (id: number) => void;
  addLog: (exerciseId: number, weight: number, reps: number, setNum: number) => void;
  removeLog: (id: number) => void;
  getExercisesForDay: (dayId: number) => Exercise[];
}

function rowToExercise(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    description: r.description || null,
    imageUri: r.image_uri || null,
    imageBase64: r.image_data ? blobToBase64Uri(r.image_data, r.media_type) : null,
    orderNum: r.order_num || 0,
    tag: r.tag || null,
    weightType: r.weight_type ?? 10,
    mediaType: r.media_type || 'photo',
    isPreset: !!r.is_preset,
  };
}

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa === 'function') return btoa(binary);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
    const c2 = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
    result += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < binary.length ? chars[((b & 15) << 2) | (c2 >> 6)] : '=';
    result += i + 2 < binary.length ? chars[c2 & 63] : '=';
  }
  return result;
}

function blobToBase64Uri(data: Uint8Array | ArrayBuffer, mediaType?: string): string {
  const bytes = toUint8Array(data);
  const base64 = uint8ArrayToBase64(bytes);
  const mime = mediaType === 'animation' ? 'image/gif' : 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

function rowToLog(r: any): WorkoutLog {
  return {
    id: r.id,
    exerciseId: r.exercise_id,
    weight: r.weight,
    reps: r.reps,
    setNum: r.set_num || 1,
    date: r.date,
    createdAt: r.created_at || r.date,
  };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const useExerciseStore = create<ExerciseState>()((set, get) => ({
  exercises: [],
  logs: [],
  programs: [],
  days: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const exRows = await db.getAllAsync('SELECT * FROM exercises ORDER BY tag, name');
    const logRows = await db.getAllAsync('SELECT * FROM workout_logs ORDER BY date DESC, created_at DESC');
    const progRows = await db.getAllAsync<{ id: number; name: string }>('SELECT * FROM programs');
    const dayRows = await db.getAllAsync<{ id: number; program_id: number; day_number: number; name: string | null; description: string | null }>(
      'SELECT * FROM days ORDER BY program_id, day_number'
    );
    set({
      exercises: exRows.map(rowToExercise),
      logs: logRows.map(rowToLog),
      programs: progRows.map((r) => ({ id: r.id, name: r.name })),
      days: dayRows.map((r) => ({ id: r.id, programId: r.program_id, dayNumber: r.day_number, name: r.name, description: r.description })),
      loaded: true,
    });
  },

  addExercise: async (name, weightType, tag, description, imageUri) => {
    const db = await getDb();
    let imageBlob: Uint8Array | null = null;
    let imageBase64: string | null = null;
    if (imageUri) {
      try {
        const b64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
        // Decode base64 to bytes for BLOB storage
        const raw = b64.replace(/[^A-Za-z0-9+/]/g, '');
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const lookup = new Uint8Array(128);
        for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
        const byteLen = (raw.length * 3) >> 2;
        const bytes = new Uint8Array(byteLen);
        let p = 0;
        for (let i = 0; i < raw.length; i += 4) {
          const a = lookup[raw.charCodeAt(i)];
          const b2 = lookup[raw.charCodeAt(i + 1)];
          const cv = i + 2 < raw.length ? lookup[raw.charCodeAt(i + 2)] : 0;
          const d = i + 3 < raw.length ? lookup[raw.charCodeAt(i + 3)] : 0;
          bytes[p++] = (a << 2) | (b2 >> 4);
          if (i + 2 < raw.length) bytes[p++] = ((b2 & 15) << 4) | (cv >> 2);
          if (i + 3 < raw.length) bytes[p++] = ((cv & 3) << 6) | d;
        }
        imageBlob = bytes;
        imageBase64 = `data:image/jpeg;base64,${b64}`;
      } catch (e) {
        console.error('addExercise image error:', e);
      }
    }
    const res = await db.runAsync(
      'INSERT INTO exercises (name, weight_type, tag, description, image_data, is_preset) VALUES (?, ?, ?, ?, ?, 0)',
      [name, weightType, tag || null, description || null, imageBlob]
    );
    const id = res.lastInsertRowId;
    const ex: Exercise = { id, name, weightType, tag: tag || null, description: description || null, imageUri: null, imageBase64, orderNum: 0, mediaType: 'photo', isPreset: false };
    set((s) => ({ exercises: [...s.exercises, ex] }));
    return id;
  },

  updateExercise: async (id, updates) => {
    // Compute merged exercise BEFORE set(), to avoid async race
    const prev = get().exercises.find((e) => e.id === id);
    if (!prev) return;
    const merged = { ...prev, ...updates };
    set((s) => ({
      exercises: s.exercises.map((e) => (e.id === id ? merged : e)),
    }));
    const db = await getDb();
    await db.runAsync(
      'UPDATE exercises SET name=?, weight_type=?, tag=?, description=? WHERE id=?',
      [merged.name, merged.weightType, merged.tag, merged.description, id]
    );
  },

  removeExercise: async (id) => {
    set((s) => ({
      exercises: s.exercises.filter((e) => e.id !== id),
      logs: s.logs.filter((l) => l.exerciseId !== id),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
  },

  addLog: async (exerciseId, weight, reps, setNum) => {
    const db = await getDb();
    const date = todayStr();
    const createdAt = nowTimestamp();
    const res = await db.runAsync(
      'INSERT INTO workout_logs (exercise_id, weight, reps, set_num, date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [exerciseId, weight, reps, setNum, date, createdAt]
    );
    const log: WorkoutLog = { id: res.lastInsertRowId, exerciseId, weight, reps, setNum, date, createdAt };
    set((s) => ({ logs: [log, ...s.logs] }));
  },

  removeLog: async (id) => {
    set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM workout_logs WHERE id = ?', [id]);
  },

  getExercisesForDay: (dayId) => {
    // This needs day_exercises table — load on demand
    return []; // Will be loaded via direct query in UI
  },
}));

// Helper to load exercises for a specific day (used in UI)
export async function loadDayExercises(dayId: number): Promise<Exercise[]> {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT e.* FROM exercises e
     JOIN day_exercises de ON de.exercise_id = e.id
     WHERE de.day_id = ?
     ORDER BY de.order_num, e.name`,
    [dayId]
  );
  return rows.map(rowToExercise);
}
