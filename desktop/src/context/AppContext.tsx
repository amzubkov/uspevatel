import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Task, Project, Category } from '../shared/types';
import { fetchRemoteTasks, pushChanges } from '../shared/syncService';
import { useSettings } from '../hooks/useSettings';

interface AppState {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  error: string | null;
  settings: ReturnType<typeof useSettings>;
  refresh: () => Promise<void>;
  addTask: (data: Partial<Task> & { action: string; category: Category }) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  moveTask: (id: string, category: Category) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
  addProject: (name: string, isCurrent?: boolean) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleProjectCurrent: (id: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// localStorage helpers
function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem('uspevatel-tasks');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem('uspevatel-tasks', JSON.stringify(tasks));
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem('uspevatel-projects');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const [tasks, setTasksRaw] = useState<Task[]>(loadTasks);
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncUrl = settings.syncUrl;

  // Keep a ref to always have current tasks (avoids stale closure issues)
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Wrapper that persists to localStorage
  const setTasks = useCallback((updater: Task[] | ((prev: Task[]) => Task[])) => {
    setTasksRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveTasks(next);
      return next;
    });
  }, []);

  // Persist projects to localStorage
  useEffect(() => {
    localStorage.setItem('uspevatel-projects', JSON.stringify(projects));
  }, [projects]);

  // Track in-flight pushes to avoid refresh wiping them
  const pushingRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!syncUrl) { setError('Укажите URL в настройках'); return; }
    // Don't refresh while pushes are in-flight
    if (pushingRef.current > 0) {
      console.log('[SYNC] skipping refresh, pushes in flight:', pushingRef.current);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const remote = await fetchRemoteTasks(syncUrl);
      // Merge: remote is source of truth, but keep local tasks that don't exist remotely yet
      // (they might have been just created and push hasn't completed)
      const remoteIds = new Set(remote.map((t) => t.id));
      const localOnly = tasksRef.current.filter((t) => !remoteIds.has(t.id));
      const merged = [...remote, ...localOnly];
      setTasks(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // On error, keep local tasks (don't wipe)
    } finally {
      setLoading(false);
    }
  }, [syncUrl, setTasks]);

  // Auto-fetch on syncUrl change
  useEffect(() => {
    if (syncUrl) refresh();
  }, [syncUrl]);

  // Push helper with in-flight tracking
  const safePush = useCallback(async (upsert: Task[], deleteIds: string[]) => {
    if (!syncUrl) return;
    pushingRef.current++;
    try {
      await pushChanges(syncUrl, upsert, deleteIds);
    } catch (err) {
      console.error('[PUSH ERROR]', err);
      setError(`Ошибка отправки: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      pushingRef.current--;
    }
  }, [syncUrl]);

  const addTask = useCallback(async (data: Partial<Task> & { action: string; category: Category }) => {
    const now = new Date().toISOString();
    const newTask: Task = {
      id: crypto.randomUUID(),
      subject: data.subject || '',
      action: data.action,
      category: data.category,
      contextCategory: data.contextCategory,
      project: data.project,
      notes: data.notes || '',
      startDate: data.startDate,
      priority: data.priority || 'normal',
      isRecurring: data.isRecurring || false,
      recurDays: data.recurDays,
      completed: false,
      deadline: data.deadline,
      createdAt: now,
      updatedAt: now,
    };
    // Use functional update to always get latest state
    setTasks((prev) => [...prev, newTask]);
    await safePush([newTask], []);
  }, [setTasks, safePush]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const now = new Date().toISOString();
    let updated: Task | undefined;
    setTasks((prev) => {
      const next = prev.map((t) => {
        if (t.id === id) {
          updated = { ...t, ...updates, updatedAt: now };
          return updated;
        }
        return t;
      });
      return next;
    });
    // Wait a tick for state to settle, then push
    if (updated) {
      await safePush([updated], []);
    }
  }, [setTasks, safePush]);

  const deleteTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await safePush([], [id]);
  }, [setTasks, safePush]);

  const moveTask = useCallback(async (id: string, category: Category) => {
    await updateTask(id, { category });
  }, [updateTask]);

  const completeTask = useCallback(async (id: string) => {
    await updateTask(id, { completed: true, completedAt: new Date().toISOString() });
  }, [updateTask]);

  const uncompleteTask = useCallback(async (id: string) => {
    await updateTask(id, { completed: false, completedAt: undefined });
  }, [updateTask]);

  // Project management (local only)
  const addProject = useCallback((name: string, isCurrent = true) => {
    setProjects((prev) => [...prev, {
      id: crypto.randomUUID(),
      name: name.toUpperCase(),
      isCurrent,
      notes: '',
    }]);
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects((prev) => prev.map((p) =>
      p.id === id ? { ...p, ...updates, name: updates.name ? updates.name.toUpperCase() : p.name } : p
    ));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const toggleProjectCurrent = useCallback((id: string) => {
    setProjects((prev) => prev.map((p) =>
      p.id === id ? { ...p, isCurrent: !p.isCurrent } : p
    ));
  }, []);

  return (
    <AppContext.Provider value={{
      tasks, projects, loading, error, settings,
      refresh, addTask, updateTask, deleteTask, moveTask,
      completeTask, uncompleteTask,
      addProject, updateProject, deleteProject, toggleProjectCurrent,
    }}>
      {children}
    </AppContext.Provider>
  );
}
