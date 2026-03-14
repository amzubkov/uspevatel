import { Alert } from 'react-native';
import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { File, Paths, Directory } from 'expo-file-system';
import { Task, Category, WeekStats } from '../types';
import { getDb, getImageBaseDir } from '../db/database';

function resolveImageUri(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') {
    if (val.startsWith('file://') || val.startsWith('content://') || val.startsWith('data:')) return val;
    return getImageBaseDir() + '/' + val;
  }
  return undefined;
}

interface TaskState {
  tasks: Task[];
  weekStats: WeekStats[];
  loaded: boolean;

  load: () => Promise<void>;
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
  addImageToTask: (id: string, imageUri: string) => Promise<void>;
  removeImageFromTask: (id: string) => Promise<void>;
}

function rowToTask(r: any): Task {
  return {
    id: r.id,
    subject: r.subject,
    action: r.action,
    category: r.category,
    contextCategory: r.context_category || undefined,
    project: r.project || undefined,
    notes: r.notes,
    startDate: r.start_date || undefined,
    deadline: r.deadline || undefined,
    reminderAt: r.reminder_at || undefined,
    priority: r.priority,
    isRecurring: !!r.is_recurring,
    recurDays: r.recur_days ? JSON.parse(r.recur_days) : undefined,
    completed: !!r.completed,
    completedAt: r.completed_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    imageBase64: r.image_data ? resolveImageUri(r.image_data) : undefined,
  };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  // Use global btoa if available (modern Hermes), otherwise manual encode
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

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

function blobToBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = toUint8Array(data);
  return `data:image/jpeg;base64,${uint8ArrayToBase64(bytes)}`;
}

function rowToWeekStats(r: any): WeekStats {
  return {
    weekStart: r.week_start,
    totalCompleted: r.total_completed,
    projectCompleted: r.project_completed,
    ratio: r.ratio,
    diaryEntry: r.diary_entry,
  };
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  weekStats: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM tasks');
    const wsRows = await db.getAllAsync('SELECT * FROM week_stats ORDER BY week_start DESC');
    set({ tasks: rows.map(rowToTask), weekStats: wsRows.map(rowToWeekStats), loaded: true });
  },

  addTask: async (taskData) => {
    const now = new Date().toISOString();
    const task: Task = { ...taskData, id: Crypto.randomUUID(), completed: false, createdAt: now, updatedAt: now };
    set((s) => ({ tasks: [...s.tasks, task] }));
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO tasks (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at, priority, is_recurring, recur_days, completed, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      [task.id, task.subject, task.action, task.category, task.contextCategory || null, task.project || null,
       task.notes, task.startDate || null, task.deadline || null, task.reminderAt || null,
       task.priority, task.isRecurring ? 1 : 0, task.recurDays ? JSON.stringify(task.recurDays) : null, now, now]
    );
  },

  updateTask: async (id, updates) => {
    const now = new Date().toISOString();
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, ...updates, updatedAt: now } : t) }));
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const db = await getDb();
    await db.runAsync(
      `UPDATE tasks SET subject=?, action=?, category=?, context_category=?, project=?, notes=?, start_date=?, deadline=?, reminder_at=?, priority=?, is_recurring=?, recur_days=?, completed=?, completed_at=?, updated_at=? WHERE id=?`,
      [task.subject, task.action, task.category, task.contextCategory || null, task.project || null,
       task.notes, task.startDate || null, task.deadline || null, task.reminderAt || null,
       task.priority, task.isRecurring ? 1 : 0, task.recurDays ? JSON.stringify(task.recurDays) : null,
       task.completed ? 1 : 0, task.completedAt || null, now, id]
    );
  },

  deleteTask: async (id) => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
  },

  moveTask: async (id, category) => {
    const now = new Date().toISOString();
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, category, updatedAt: now } : t) }));
    const db = await getDb();
    await db.runAsync('UPDATE tasks SET category = ?, updated_at = ? WHERE id = ?', [category, now, id]);
  },

  completeTask: async (id) => {
    const now = new Date().toISOString();
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, completed: true, completedAt: now, updatedAt: now } : t) }));
    const db = await getDb();
    await db.runAsync('UPDATE tasks SET completed = 1, completed_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  },

  uncompleteTask: async (id) => {
    const now = new Date().toISOString();
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, completed: false, completedAt: undefined, updatedAt: now } : t) }));
    const db = await getDb();
    await db.runAsync('UPDATE tasks SET completed = 0, completed_at = NULL, updated_at = ? WHERE id = ?', [now, id]);
  },

  importTask: async (task) => {
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) { const u = [...s.tasks]; u[idx] = task; return { tasks: u }; }
      return { tasks: [...s.tasks, task] };
    });
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO tasks (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at, priority, is_recurring, recur_days, completed, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [task.id, task.subject, task.action, task.category, task.contextCategory || null, task.project || null,
       task.notes, task.startDate || null, task.deadline || null, task.reminderAt || null,
       task.priority, task.isRecurring ? 1 : 0, task.recurDays ? JSON.stringify(task.recurDays) : null,
       task.completed ? 1 : 0, task.completedAt || null, task.createdAt, task.updatedAt]
    );
  },

  getTasksByCategory: (category) => get().tasks.filter((t) => t.category === category && !t.completed),
  getTasksByProject: (projectName) => get().tasks.filter((t) => t.project === projectName),
  getTasksByContext: (context) => get().tasks.filter((t) => t.contextCategory === context && !t.completed),

  getCompletedThisWeek: () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    return get().tasks.filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= startOfWeek);
  },

  addImageToTask: async (id, imageUri) => {
    try {
      const dir = new Directory(getImageBaseDir(), 'task_images');
      if (!dir.exists) dir.create();
      const ext = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      const relPath = `task_images/${id}.${ext}`;
      const dest = new File(dir, `${id}.${ext}`);
      const src = new File(imageUri);
      if (src.exists) src.move(dest);
      const absUri = dest.uri;
      set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, imageBase64: absUri } : t) }));
      const db = await getDb();
      await db.runAsync('UPDATE tasks SET image_data = ? WHERE id = ?', [relPath, id]);
    } catch (e: any) {
      Alert.alert('Ошибка картинки', String(e?.message || e));
    }
  },

  removeImageFromTask: async (id) => {
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, imageBase64: undefined } : t) }));
    const db = await getDb();
    await db.runAsync('UPDATE tasks SET image_data = NULL WHERE id = ?', [id]);
  },

  addWeekStats: async (statsData) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    const stats: WeekStats = { ...statsData, weekStart: startOfWeek.toISOString() };
    set((s) => ({ weekStats: [...s.weekStats, stats] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO week_stats (week_start, total_completed, project_completed, ratio, diary_entry) VALUES (?, ?, ?, ?, ?)',
      [stats.weekStart, stats.totalCompleted, stats.projectCompleted, stats.ratio, stats.diaryEntry]
    );
  },
}));
