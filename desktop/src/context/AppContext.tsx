import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Task, Project, Category } from "../shared/types";
import { fetchRemoteTasks, pushChanges } from "../shared/syncService";
import { useSettings } from "../hooks/useSettings";
import {
  getDb,
  getSyncFolder,
  getSyncFolderSetting,
  onSyncFolderChanged,
} from "../services/db";

interface AppState {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  error: string | null;
  settings: ReturnType<typeof useSettings>;
  refresh: () => Promise<void>;
  addTask: (
    data: Partial<Task> & { action: string; category: Category },
  ) => Promise<void>;
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
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// localStorage helpers
function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem("uspevatel-tasks");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem("uspevatel-tasks", JSON.stringify(tasks));
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem("uspevatel-projects");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// SQLite helpers for tasks
async function dbLoadTasks(): Promise<Task[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select<any[]>(
    "SELECT * FROM tasks ORDER BY created_at DESC",
  );
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject || "",
    action: r.action,
    category: r.category as Category,
    contextCategory: r.context_category || undefined,
    project: r.project || undefined,
    notes: r.notes || "",
    startDate: r.start_date || undefined,
    deadline: r.deadline || undefined,
    reminderAt: r.reminder_at || undefined,
    priority: r.priority || "normal",
    isRecurring: !!r.is_recurring,
    recurDays: r.recur_days ? JSON.parse(r.recur_days) : undefined,
    completed: !!r.completed,
    completedAt: r.completed_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    imageUri: r.image_data || undefined,
  }));
}

async function dbUpsertTask(t: Task) {
  const db = getDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO tasks (id,subject,action,category,context_category,project,notes,start_date,deadline,reminder_at,priority,is_recurring,recur_days,completed,completed_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      t.id,
      t.subject,
      t.action,
      t.category,
      t.contextCategory || null,
      t.project || null,
      t.notes,
      t.startDate || null,
      t.deadline || null,
      t.reminderAt || null,
      t.priority,
      t.isRecurring ? 1 : 0,
      t.recurDays ? JSON.stringify(t.recurDays) : null,
      t.completed ? 1 : 0,
      t.completedAt || null,
      t.createdAt,
      t.updatedAt,
    ],
  );
}

async function dbDeleteTask(id: string) {
  const db = getDb();
  if (!db) return;
  await db.execute("DELETE FROM tasks WHERE id=$1", [id]);
}

// SQLite helpers for projects
async function dbLoadProjects(): Promise<Project[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select<any[]>("SELECT * FROM projects");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isCurrent: !!r.is_current,
    notes: r.notes || "",
  }));
}

async function dbUpsertProject(p: Project) {
  const db = getDb();
  if (!db) return;
  await db.execute(
    "INSERT OR REPLACE INTO projects (id,name,is_current,notes) VALUES ($1,$2,$3,$4)",
    [p.id, p.name, p.isCurrent ? 1 : 0, p.notes],
  );
}

async function dbDeleteProject(id: string) {
  const db = getDb();
  if (!db) return;
  await db.execute("DELETE FROM projects WHERE id=$1", [id]);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const [tasks, setTasksRaw] = useState<Task[]>(loadTasks);
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncFolder, setSyncFolder] = useState<string | null>(
    getSyncFolderSetting(),
  );
  const syncUrl = settings.syncUrl;

  // Keep a ref to always have current tasks (avoids stale closure issues)
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Wrapper that persists to localStorage (or SQLite is handled per-operation)
  const setTasks = useCallback(
    (updater: Task[] | ((prev: Task[]) => Task[])) => {
      setTasksRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (!syncFolder) saveTasks(next);
        return next;
      });
    },
    [syncFolder],
  );

  // Persist projects to localStorage (skip if SQLite mode)
  useEffect(() => {
    if (!syncFolder) {
      localStorage.setItem("uspevatel-projects", JSON.stringify(projects));
    }
  }, [projects, syncFolder]);

  useEffect(() => {
    const unsubscribe = onSyncFolderChanged((folder) => {
      setSyncFolder(folder);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (syncFolder && getDb()) {
      dbLoadTasks().then(setTasksRaw);
      dbLoadProjects().then(setProjects);
      return;
    }
    setTasksRaw(loadTasks());
    setProjects(loadProjects());
  }, [syncFolder]);

  // Track in-flight pushes to avoid refresh wiping them
  const pushingRef = useRef(0);

  const refresh = useCallback(async () => {
    if (syncFolder && getDb()) {
      // SQLite mode: reload from DB
      setLoading(true);
      try {
        const [t, p] = await Promise.all([dbLoadTasks(), dbLoadProjects()]);
        setTasksRaw(t);
        setProjects(p);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!syncUrl) {
      setError("Укажите URL в настройках");
      return;
    }
    // Don't refresh while pushes are in-flight
    if (pushingRef.current > 0) {
      console.log(
        "[SYNC] skipping refresh, pushes in flight:",
        pushingRef.current,
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const remote = await fetchRemoteTasks(syncUrl);
      const remoteIds = new Set(remote.map((t) => t.id));
      const localOnly = tasksRef.current.filter((t) => !remoteIds.has(t.id));
      const merged = [...remote, ...localOnly];
      setTasks(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [syncFolder, syncUrl, setTasks]);

  // Auto-fetch on syncUrl change
  useEffect(() => {
    if (syncUrl) refresh();
  }, [syncUrl]);

  // Push helper with in-flight tracking
  const safePush = useCallback(
    async (upsert: Task[], deleteIds: string[]) => {
      if (!syncUrl) return;
      pushingRef.current++;
      try {
        await pushChanges(syncUrl, upsert, deleteIds);
      } catch (err) {
        console.error("[PUSH ERROR]", err);
        setError(
          `Ошибка отправки: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        pushingRef.current--;
      }
    },
    [syncUrl],
  );

  const addTask = useCallback(
    async (data: Partial<Task> & { action: string; category: Category }) => {
      const now = new Date().toISOString();
      const newTask: Task = {
        id: crypto.randomUUID(),
        subject: data.subject || "",
        action: data.action,
        category: data.category,
        contextCategory: data.contextCategory,
        project: data.project,
        notes: data.notes || "",
        startDate: data.startDate,
        priority: data.priority || "normal",
        isRecurring: data.isRecurring || false,
        recurDays: data.recurDays,
        completed: false,
        deadline: data.deadline,
        createdAt: now,
        updatedAt: now,
      };
      // Use functional update to always get latest state
      setTasks((prev) => [...prev, newTask]);
      if (syncFolder) await dbUpsertTask(newTask);
      else await safePush([newTask], []);
    },
    [setTasks, safePush, syncFolder],
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
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
        if (syncFolder) await dbUpsertTask(updated);
        else await safePush([updated], []);
      }
    },
    [setTasks, safePush, syncFolder],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (syncFolder) await dbDeleteTask(id);
      else await safePush([], [id]);
    },
    [setTasks, safePush, syncFolder],
  );

  const moveTask = useCallback(
    async (id: string, category: Category) => {
      await updateTask(id, { category });
    },
    [updateTask],
  );

  const completeTask = useCallback(
    async (id: string) => {
      await updateTask(id, {
        completed: true,
        completedAt: new Date().toISOString(),
      });
    },
    [updateTask],
  );

  const uncompleteTask = useCallback(
    async (id: string) => {
      await updateTask(id, { completed: false, completedAt: undefined });
    },
    [updateTask],
  );

  // Project management
  const addProject = useCallback(
    (name: string, isCurrent = true) => {
      const p: Project = {
        id: crypto.randomUUID(),
        name: name.toUpperCase(),
        isCurrent,
        notes: "",
      };
      setProjects((prev) => [...prev, p]);
      if (syncFolder) void dbUpsertProject(p);
    },
    [syncFolder],
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Project>) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === id
            ? {
                ...p,
                ...updates,
                name: updates.name ? updates.name.toUpperCase() : p.name,
              }
            : p,
        );
        const updated = next.find((p) => p.id === id);
        if (updated && syncFolder) void dbUpsertProject(updated);
        return next;
      });
    },
    [syncFolder],
  );

  const deleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (syncFolder) void dbDeleteProject(id);
    },
    [syncFolder],
  );

  const toggleProjectCurrent = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, isCurrent: !p.isCurrent } : p,
        );
        const updated = next.find((p) => p.id === id);
        if (updated && syncFolder) void dbUpsertProject(updated);
        return next;
      });
    },
    [syncFolder],
  );

  return (
    <AppContext.Provider
      value={{
        tasks,
        projects,
        loading,
        error,
        settings,
        refresh,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        completeTask,
        uncompleteTask,
        addProject,
        updateProject,
        deleteProject,
        toggleProjectCurrent,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
