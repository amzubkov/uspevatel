import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Task, Project, Category } from "../shared/types";
import { fetchRemoteTasks, pushChanges } from "../shared/syncService";
import { mergeRemoteTasks } from "../shared/syncMerge";
import { useSettings } from "../hooks/useSettings";
import { getDb } from "../services/db";
import { useDatabase } from "./DatabaseContext";

const DIRTY_TASKS_KEY = "uspevatel-sync-dirty-task-ids";
const TOMBSTONES_KEY = "uspevatel-sync-tombstone-ids";
const SYNC_BASELINE_KEY = "uspevatel-sync-baseline-url";

export class RemoteSyncError extends Error {
  override name = "RemoteSyncError";
}

interface AppState {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  error: string | null;
  settings: ReturnType<typeof useSettings>;
  refresh: () => Promise<void>;
  syncRemote: () => Promise<void>;
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

function readIdSet(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

function addIds(key: string, ids: string[]) {
  const current = readIdSet(key);
  ids.forEach((id) => current.add(id));
  writeIdSet(key, current);
}

function removeIds(key: string, ids: string[]) {
  const current = readIdSet(key);
  ids.forEach((id) => current.delete(id));
  writeIdSet(key, current);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function dbLoadTasks(): Promise<Task[]> {
  const db = getDb();
  if (!db) return loadTasks();
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
    imageUri: typeof r.image_data === "string" ? r.image_data : undefined,
  }));
}

const taskValues = (task: Task) => [
  task.id,
  task.subject,
  task.action,
  task.category,
  task.contextCategory || null,
  task.project || null,
  task.notes,
  task.startDate || null,
  task.deadline || null,
  task.reminderAt || null,
  task.priority,
  task.isRecurring ? 1 : 0,
  task.recurDays ? JSON.stringify(task.recurDays) : null,
  task.completed ? 1 : 0,
  task.completedAt || null,
  task.createdAt,
  task.updatedAt,
];

async function dbInsertTask(task: Task): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.execute(
    `INSERT INTO tasks
      (id,subject,action,category,context_category,project,notes,start_date,deadline,reminder_at,priority,is_recurring,recur_days,completed,completed_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    taskValues(task),
  );
}

async function dbUpdateTask(task: Task): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const result = await db.execute(
    `UPDATE tasks SET
      subject=$1, action=$2, category=$3, context_category=$4, project=$5,
      notes=$6, start_date=$7, deadline=$8, reminder_at=$9, priority=$10,
      is_recurring=$11, recur_days=$12, completed=$13, completed_at=$14,
      updated_at=$15
     WHERE id=$16`,
    [
      task.subject,
      task.action,
      task.category,
      task.contextCategory || null,
      task.project || null,
      task.notes,
      task.startDate || null,
      task.deadline || null,
      task.reminderAt || null,
      task.priority,
      task.isRecurring ? 1 : 0,
      task.recurDays ? JSON.stringify(task.recurDays) : null,
      task.completed ? 1 : 0,
      task.completedAt || null,
      task.updatedAt,
      task.id,
    ],
  );
  return result.rowsAffected;
}

async function dbMergeTask(task: Task): Promise<void> {
  if ((await dbUpdateTask(task)) === 0) await dbInsertTask(task);
}

async function dbDeleteTask(id: string) {
  const db = getDb();
  if (db) await db.execute("DELETE FROM tasks WHERE id=$1", [id]);
}

async function dbLoadProjects(): Promise<Project[]> {
  const db = getDb();
  if (!db) return loadProjects();
  const rows = await db.select<any[]>("SELECT * FROM projects");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isCurrent: !!r.is_current,
    notes: r.notes || "",
  }));
}

async function dbUpsertProject(project: Project) {
  const db = getDb();
  if (!db) return;
  await db.execute(
    `INSERT INTO projects (id,name,is_current,notes) VALUES ($1,$2,$3,$4)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, is_current=excluded.is_current, notes=excluded.notes`,
    [project.id, project.name, project.isCurrent ? 1 : 0, project.notes],
  );
}

async function dbDeleteProject(id: string) {
  const db = getDb();
  if (db) await db.execute("DELETE FROM projects WHERE id=$1", [id]);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { ready: databaseReady } = useDatabase();
  const settings = useSettings();
  const [tasks, setTasksRaw] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasksRef = useRef(tasks);
  const pushQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pushGenerationRef = useRef(new Map<string, number>());
  tasksRef.current = tasks;

  const setTasks = useCallback(
    (updater: Task[] | ((prev: Task[]) => Task[])) => {
      setTasksRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (!getDb()) saveTasks(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!getDb()) {
      localStorage.setItem("uspevatel-projects", JSON.stringify(projects));
    }
  }, [projects]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextTasks, nextProjects] = await Promise.all([
        dbLoadTasks(),
        dbLoadProjects(),
      ]);
      setTasksRaw(nextTasks);
      setProjects(nextProjects);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!databaseReady) {
      setHydrated(false);
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }

    setHydrated(false);
    void refresh()
      .then(() => {
        if (!cancelled) setHydrated(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [databaseReady, refresh]);

  const safePush = useCallback(
    (upsert: Task[], deleteIds: string[]): Promise<void> => {
      if (upsert.length === 0 && deleteIds.length === 0) {
        return Promise.resolve();
      }
      const upsertIds = upsert.map((task) => task.id);
      const touchedIds = [...new Set([...upsertIds, ...deleteIds])];
      const generations = new Map<string, number>();
      for (const id of touchedIds) {
        const generation = (pushGenerationRef.current.get(id) ?? 0) + 1;
        pushGenerationRef.current.set(id, generation);
        generations.set(id, generation);
      }
      removeIds(TOMBSTONES_KEY, upsertIds);
      removeIds(DIRTY_TASKS_KEY, deleteIds);
      addIds(DIRTY_TASKS_KEY, upsertIds);
      addIds(TOMBSTONES_KEY, deleteIds);
      if (!settings.syncUrl) return Promise.resolve();

      const execute = async () => {
        try {
          await pushChanges(settings.syncUrl, upsert, deleteIds);
          for (const id of upsertIds) {
            if (pushGenerationRef.current.get(id) === generations.get(id)) {
              removeIds(DIRTY_TASKS_KEY, [id]);
            }
          }
          for (const id of deleteIds) {
            if (pushGenerationRef.current.get(id) === generations.get(id)) {
              removeIds(TOMBSTONES_KEY, [id]);
            }
          }
          setError(null);
        } catch (err) {
          const surfaced = new RemoteSyncError(
            `Изменение сохранено локально, но синхронизация не выполнена: ${messageOf(err)}`,
          );
          setError(surfaced.message);
          throw surfaced;
        }
      };

      const queued = pushQueueRef.current.then(execute, execute);
      pushQueueRef.current = queued.catch(() => undefined);
      return queued;
    },
    [settings.syncUrl],
  );

  const syncRemote = useCallback(async () => {
    if (!databaseReady || !hydrated) {
      const error = new Error("Локальная база ещё загружается");
      setError(error.message);
      throw error;
    }
    const syncUrl = settings.syncUrl;
    if (!syncUrl) {
      const error = new Error("Укажите URL в настройках");
      setError(error.message);
      throw error;
    }

    setLoading(true);
    setError(null);
    try {
      await pushQueueRef.current;
      const dirtyIds = readIdSet(DIRTY_TASKS_KEY);
      const tombstones = readIdSet(TOMBSTONES_KEY);
      const pendingUpserts = tasksRef.current.filter((task) =>
        dirtyIds.has(task.id),
      );
      if (pendingUpserts.length || tombstones.size) {
        await safePush(pendingUpserts, [...tombstones]);
      }

      const remote = await fetchRemoteTasks(syncUrl);
      const current = tasksRef.current;
      const hasRemoteBaseline =
        localStorage.getItem(SYNC_BASELINE_KEY) === syncUrl;
      const merge = mergeRemoteTasks(
        remote,
        current,
        readIdSet(DIRTY_TASKS_KEY),
        readIdSet(TOMBSTONES_KEY),
        hasRemoteBaseline,
      );

      const mergedIds = new Set(merge.tasks.map((task) => task.id));
      for (const local of current) {
        if (!mergedIds.has(local.id)) await dbDeleteTask(local.id);
      }
      for (const task of merge.tasks) await dbMergeTask(task);
      setTasks(merge.tasks);

      if (merge.retryUpserts.length) {
        await safePush(merge.retryUpserts, []);
      }
      localStorage.setItem(SYNC_BASELINE_KEY, syncUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [databaseReady, hydrated, safePush, setTasks, settings.syncUrl]);

  useEffect(() => {
    if (databaseReady && hydrated && settings.syncUrl) {
      void syncRemote().catch(() => undefined);
    }
  }, [databaseReady, hydrated, settings.syncUrl, syncRemote]);

  const addTask = useCallback(
    async (data: Partial<Task> & { action: string; category: Category }) => {
      const now = new Date().toISOString();
      const task: Task = {
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
      setTasks((prev) => [...prev, task]);
      try {
        if (getDb()) await dbInsertTask(task);
      } catch (error) {
        setTasks((prev) => prev.filter((item) => item.id !== task.id));
        const surfaced = new Error(
          `Не удалось сохранить задачу локально: ${messageOf(error)}`,
        );
        setError(surfaced.message);
        throw surfaced;
      }
      await safePush([task], []);
    },
    [safePush, setTasks],
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
      const current = tasksRef.current.find((task) => task.id === id);
      if (!current) return;
      const updated: Task = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? updated : task)),
      );
      try {
        if (getDb() && (await dbUpdateTask(updated)) === 0) {
          throw new Error("задача отсутствует в SQLite");
        }
      } catch (error) {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === id && task.updatedAt === updated.updatedAt
              ? current
              : task,
          ),
        );
        const surfaced = new Error(
          `Не удалось обновить задачу локально: ${messageOf(error)}`,
        );
        setError(surfaced.message);
        throw surfaced;
      }
      await safePush([updated], []);
    },
    [safePush, setTasks],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const current = tasksRef.current.find((task) => task.id === id);
      const currentIndex = tasksRef.current.findIndex((task) => task.id === id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
      try {
        await dbDeleteTask(id);
      } catch (error) {
        if (current) {
          setTasks((prev) => {
            if (prev.some((task) => task.id === id)) return prev;
            const next = [...prev];
            next.splice(Math.max(0, currentIndex), 0, current);
            return next;
          });
        }
        const surfaced = new Error(
          `Не удалось удалить задачу локально: ${messageOf(error)}`,
        );
        setError(surfaced.message);
        throw surfaced;
      }
      await safePush([], [id]);
    },
    [safePush, setTasks],
  );

  const moveTask = useCallback(
    async (id: string, category: Category) => updateTask(id, { category }),
    [updateTask],
  );

  const completeTask = useCallback(
    async (id: string) =>
      updateTask(id, {
        completed: true,
        completedAt: new Date().toISOString(),
      }),
    [updateTask],
  );

  const uncompleteTask = useCallback(
    async (id: string) =>
      updateTask(id, { completed: false, completedAt: undefined }),
    [updateTask],
  );

  const addProject = useCallback((name: string, isCurrent = true) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name: name.toUpperCase(),
      isCurrent,
      notes: "",
    };
    setProjects((prev) => [...prev, project]);
    void dbUpsertProject(project);
  }, []);

  const updateProject = useCallback(
    (id: string, updates: Partial<Project>) => {
      setProjects((prev) => {
        const next = prev.map((project) =>
          project.id === id
            ? {
                ...project,
                ...updates,
                name: updates.name
                  ? updates.name.toUpperCase()
                  : project.name,
              }
            : project,
        );
        const updated = next.find((project) => project.id === id);
        if (updated) void dbUpsertProject(updated);
        return next;
      });
    },
    [],
  );

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== id));
    void dbDeleteProject(id);
  }, []);

  const toggleProjectCurrent = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.map((project) =>
        project.id === id
          ? { ...project, isCurrent: !project.isCurrent }
          : project,
      );
      const updated = next.find((project) => project.id === id);
      if (updated) void dbUpsertProject(updated);
      return next;
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        tasks,
        projects,
        loading,
        error,
        settings,
        refresh,
        syncRemote,
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
