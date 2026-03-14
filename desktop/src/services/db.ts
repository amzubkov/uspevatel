import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;
let currentFolder: string | null = null;

const SYNC_FOLDER_KEY = "syncFolder";
const SETTINGS_KEY = "uspevatel-settings";
const SYNC_FOLDER_CHANGED_EVENT = "uspevatel-sync-folder-changed";

export interface AppSettings {
  syncUrl: string;
  theme: "light" | "dark";
  fontSize: number;
  contextCategories: string[];
  lastSyncAt: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  syncUrl: "",
  theme: "dark",
  fontSize: 15,
  contextCategories: [],
  lastSyncAt: null,
};

export interface BackupData {
  tasks: any[];
  projects: any[];
  sport_entries: any[];
  exercises: any[];
  workout_logs: any[];
  flights: any[];
  routine_items: any[];
  routine_completions: any[];
  checklist: any[];
  settings: AppSettings;
}

export interface MigrationSummary {
  imported: string[];
  skipped: string[];
}

const SCHEMA_STMTS = [
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, subject TEXT NOT NULL, action TEXT NOT NULL, category TEXT NOT NULL, context_category TEXT, project TEXT, notes TEXT NOT NULL DEFAULT '', start_date TEXT, deadline TEXT, reminder_at TEXT, priority TEXT NOT NULL DEFAULT 'normal', is_recurring INTEGER NOT NULL DEFAULT 0, recur_days TEXT, completed INTEGER NOT NULL DEFAULT 0, completed_at TEXT, image_data BLOB, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_current INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS routines (id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS routine_completions (routine_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (routine_id, date))`,
  `CREATE TABLE IF NOT EXISTS checklist (id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS flights (id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'flight', title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned', depart_date TEXT NOT NULL, depart_time TEXT, arrive_date TEXT, arrive_time TEXT, notes TEXT NOT NULL DEFAULT '', image_data TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sport_entries (id TEXT PRIMARY KEY, type TEXT NOT NULL, label TEXT, count REAL NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS exercises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, image_uri TEXT, image_data BLOB, order_num INTEGER DEFAULT 0, tag TEXT, weight_type INTEGER DEFAULT 10, media_type TEXT DEFAULT 'photo', is_preset INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS workout_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, weight REAL NOT NULL DEFAULT 0, reps INTEGER NOT NULL, set_num INTEGER DEFAULT 1, date TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS programs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS days (id INTEGER PRIMARY KEY AUTOINCREMENT, program_id INTEGER NOT NULL, day_number INTEGER NOT NULL, name TEXT, description TEXT)`,
  `CREATE TABLE IF NOT EXISTS week_stats (week_start TEXT PRIMARY KEY, total_completed INTEGER NOT NULL DEFAULT 0, project_completed INTEGER NOT NULL DEFAULT 0, ratio REAL NOT NULL DEFAULT 0, diary_entry TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)`,
  `CREATE INDEX IF NOT EXISTS idx_sport_entries_type_date ON sport_entries(type, date)`,
  `CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise ON workout_logs(exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date)`,
];

export async function openDatabase(syncFolder: string): Promise<Database> {
  if (db && currentFolder === syncFolder) return db;
  if (db) {
    try {
      await db.close();
    } catch {}
  }
  const path = syncFolder.startsWith("/")
    ? `sqlite:${syncFolder}/uspevatel.db`
    : `sqlite:${syncFolder}/uspevatel.db`;
  db = await Database.load(path);
  currentFolder = syncFolder;
  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA foreign_keys = ON");
  for (const stmt of SCHEMA_STMTS) {
    await db.execute(stmt);
  }
  return db;
}

export function getDb(): Database | null {
  return db;
}
export function getSyncFolder(): string | null {
  return currentFolder;
}

export function getSyncFolderSetting(): string | null {
  return localStorage.getItem(SYNC_FOLDER_KEY);
}

export function setSyncFolderSetting(folder: string) {
  localStorage.setItem(SYNC_FOLDER_KEY, folder);
  notifySyncFolderChanged(folder);
}

export function clearSyncFolderSetting() {
  localStorage.removeItem(SYNC_FOLDER_KEY);
  currentFolder = null;
  db = null;
  notifySyncFolderChanged(null);
}

export function onSyncFolderChanged(
  listener: (folder: string | null) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<string | null>).detail ?? null);
  };
  window.addEventListener(SYNC_FOLDER_CHANGED_EVENT, handler as EventListener);
  return () =>
    window.removeEventListener(
      SYNC_FOLDER_CHANGED_EVENT,
      handler as EventListener,
    );
}

function notifySyncFolderChanged(folder: string | null) {
  window.dispatchEvent(
    new CustomEvent(SYNC_FOLDER_CHANGED_EVENT, { detail: folder }),
  );
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadLegacySettings(): AppSettings {
  const parsed = parseJson<Partial<AppSettings>>(
    localStorage.getItem(SETTINGS_KEY),
    {},
  );
  const next: AppSettings = { ...DEFAULT_APP_SETTINGS, ...parsed };
  if (next.fontSize < 12) next.fontSize = 12;
  if (next.fontSize > 20) next.fontSize = 20;
  if (!Array.isArray(next.contextCategories)) next.contextCategories = [];
  return next;
}

function saveLegacySettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function clampSettings(input: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...DEFAULT_APP_SETTINGS, ...input };
  if (next.fontSize < 12) next.fontSize = 12;
  if (next.fontSize > 20) next.fontSize = 20;
  if (!Array.isArray(next.contextCategories)) next.contextCategories = [];
  return next;
}

async function getTableCount(table: string): Promise<number> {
  if (!db) return 0;
  const row = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM ${table}`,
  );
  return row[0]?.count ?? 0;
}

async function writeSettingsToDb(settings: AppSettings): Promise<void> {
  if (!db) return;
  const payload: Record<string, string> = {
    theme: settings.theme,
    fontSize: String(settings.fontSize),
    contextCategories: JSON.stringify(settings.contextCategories),
    syncUrl: settings.syncUrl,
    lastSyncAt: settings.lastSyncAt ?? "",
  };
  for (const [key, value] of Object.entries(payload)) {
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
      [key, value],
    );
  }
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (!getSyncFolder() || !db) {
    return loadLegacySettings();
  }
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  );
  if (rows.length === 0) return loadLegacySettings();
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return clampSettings({
    theme: map.get("theme") as AppSettings["theme"] | undefined,
    fontSize: map.get("fontSize") ? Number(map.get("fontSize")) : undefined,
    contextCategories: parseJson<string[]>(
      map.get("contextCategories") ?? null,
      [],
    ),
    syncUrl: map.get("syncUrl") ?? "",
    lastSyncAt: map.get("lastSyncAt") || null,
  });
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const next = clampSettings(settings);
  if (!getSyncFolder() || !db) {
    saveLegacySettings(next);
    return;
  }
  await writeSettingsToDb(next);
}

export async function migrateLegacyDesktopDataToDb(): Promise<MigrationSummary> {
  const summary: MigrationSummary = { imported: [], skipped: [] };
  if (!db) return summary;

  const legacyTasks = parseJson<any[]>(
    localStorage.getItem("uspevatel-tasks"),
    [],
  );
  const legacyProjects = parseJson<any[]>(
    localStorage.getItem("uspevatel-projects"),
    [],
  );
  const legacySport = parseJson<any[]>(
    localStorage.getItem("sport_entries"),
    [],
  );
  const legacyExercises = parseJson<any[]>(
    localStorage.getItem("exercises"),
    [],
  );
  const legacyLogs = parseJson<any[]>(localStorage.getItem("workout_logs"), []);
  const legacyFlights = parseJson<any[]>(localStorage.getItem("flights"), []);
  const legacyRoutineItems = parseJson<any[]>(
    localStorage.getItem("routine_items"),
    [],
  );
  const legacyRoutineCompletions = parseJson<Record<string, string[]>>(
    localStorage.getItem("routine_completions"),
    {},
  );
  const legacyChecklist = parseJson<any[]>(
    localStorage.getItem("checklist"),
    [],
  );
  const legacySettings = loadLegacySettings();

  if ((await getTableCount("tasks")) === 0 && legacyTasks.length > 0) {
    for (const task of legacyTasks) {
      await db.execute(
        `INSERT OR REPLACE INTO tasks
          (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at, priority, is_recurring, recur_days, completed, completed_at, image_data, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          task.id,
          task.subject ?? "",
          task.action,
          task.category,
          task.contextCategory ?? null,
          task.project ?? null,
          task.notes ?? "",
          task.startDate ?? null,
          task.deadline ?? null,
          task.reminderAt ?? null,
          task.priority ?? "normal",
          task.isRecurring ? 1 : 0,
          task.recurDays ? JSON.stringify(task.recurDays) : null,
          task.completed ? 1 : 0,
          task.completedAt ?? null,
          task.imageUri ?? null,
          task.createdAt ?? new Date().toISOString(),
          task.updatedAt ?? new Date().toISOString(),
        ],
      );
    }
    summary.imported.push(`tasks:${legacyTasks.length}`);
  } else if (legacyTasks.length > 0) {
    summary.skipped.push("tasks");
  }

  if ((await getTableCount("projects")) === 0 && legacyProjects.length > 0) {
    for (const project of legacyProjects) {
      await db.execute(
        "INSERT OR REPLACE INTO projects (id, name, is_current, notes) VALUES ($1,$2,$3,$4)",
        [
          project.id,
          project.name,
          project.isCurrent ? 1 : 0,
          project.notes ?? "",
        ],
      );
    }
    summary.imported.push(`projects:${legacyProjects.length}`);
  } else if (legacyProjects.length > 0) {
    summary.skipped.push("projects");
  }

  if ((await getTableCount("sport_entries")) === 0 && legacySport.length > 0) {
    for (const entry of legacySport) {
      await db.execute(
        "INSERT OR REPLACE INTO sport_entries (id, type, label, count, date, time) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          entry.id,
          entry.type,
          entry.label ?? null,
          entry.count,
          entry.date,
          entry.time,
        ],
      );
    }
    summary.imported.push(`sport:${legacySport.length}`);
  } else if (legacySport.length > 0) {
    summary.skipped.push("sport");
  }

  if ((await getTableCount("exercises")) === 0 && legacyExercises.length > 0) {
    for (const exercise of legacyExercises) {
      await db.execute(
        `INSERT OR REPLACE INTO exercises
          (id, name, description, image_uri, image_data, order_num, tag, weight_type, media_type, is_preset)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          exercise.id,
          exercise.name,
          exercise.description ?? null,
          exercise.imageUri ?? null,
          exercise.imageUri ?? null,
          exercise.orderNum ?? 0,
          exercise.tag ?? null,
          exercise.weightType ?? 10,
          exercise.mediaType ?? "photo",
          exercise.isPreset ? 1 : 0,
        ],
      );
    }
    summary.imported.push(`exercises:${legacyExercises.length}`);
  } else if (legacyExercises.length > 0) {
    summary.skipped.push("exercises");
  }

  if ((await getTableCount("workout_logs")) === 0 && legacyLogs.length > 0) {
    for (const log of legacyLogs) {
      await db.execute(
        `INSERT OR REPLACE INTO workout_logs
          (id, exercise_id, weight, reps, set_num, date, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          log.id,
          log.exerciseId,
          log.weight,
          log.reps,
          log.setNum ?? 1,
          log.date,
          log.createdAt ?? log.date,
        ],
      );
    }
    summary.imported.push(`workout_logs:${legacyLogs.length}`);
  } else if (legacyLogs.length > 0) {
    summary.skipped.push("workout_logs");
  }

  if ((await getTableCount("flights")) === 0 && legacyFlights.length > 0) {
    for (const flight of legacyFlights) {
      await db.execute(
        `INSERT OR REPLACE INTO flights
          (id, kind, title, status, depart_date, depart_time, arrive_date, arrive_time, notes, image_data, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          flight.id,
          flight.kind ?? "flight",
          flight.title,
          flight.status,
          flight.departDate,
          flight.departTime ?? null,
          flight.arriveDate ?? null,
          flight.arriveTime ?? null,
          flight.notes ?? "",
          flight.imageUri ?? null,
          flight.createdAt ?? new Date().toISOString(),
        ],
      );
    }
    summary.imported.push(`flights:${legacyFlights.length}`);
  } else if (legacyFlights.length > 0) {
    summary.skipped.push("flights");
  }

  if (
    (await getTableCount("routines")) === 0 &&
    legacyRoutineItems.length > 0
  ) {
    for (const item of legacyRoutineItems) {
      await db.execute(
        "INSERT OR REPLACE INTO routines (id, title, sort_order) VALUES ($1,$2,$3)",
        [item.id, item.title, item.order ?? 0],
      );
    }
    summary.imported.push(`routines:${legacyRoutineItems.length}`);
  } else if (legacyRoutineItems.length > 0) {
    summary.skipped.push("routines");
  }

  if (
    (await getTableCount("routine_completions")) === 0 &&
    Object.keys(legacyRoutineCompletions).length > 0
  ) {
    let count = 0;
    for (const [date, ids] of Object.entries(legacyRoutineCompletions)) {
      for (const id of ids) {
        await db.execute(
          "INSERT OR IGNORE INTO routine_completions (routine_id, date) VALUES ($1,$2)",
          [id, date],
        );
        count += 1;
      }
    }
    summary.imported.push(`routine_completions:${count}`);
  } else if (Object.keys(legacyRoutineCompletions).length > 0) {
    summary.skipped.push("routine_completions");
  }

  if ((await getTableCount("checklist")) === 0 && legacyChecklist.length > 0) {
    for (const item of legacyChecklist) {
      await db.execute(
        "INSERT OR REPLACE INTO checklist (id, title, done, created_at) VALUES ($1,$2,$3,$4)",
        [
          item.id,
          item.title,
          item.done ? 1 : 0,
          item.createdAt ?? new Date().toISOString(),
        ],
      );
    }
    summary.imported.push(`checklist:${legacyChecklist.length}`);
  } else if (legacyChecklist.length > 0) {
    summary.skipped.push("checklist");
  }

  const settingsRows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM settings WHERE key IN ($1,$2,$3,$4,$5)",
    ["theme", "fontSize", "contextCategories", "syncUrl", "lastSyncAt"],
  );
  if ((settingsRows[0]?.count ?? 0) === 0) {
    await writeSettingsToDb(legacySettings);
    summary.imported.push("settings");
  } else {
    summary.skipped.push("settings");
  }

  return summary;
}

async function selectAll<T = any>(
  table: string,
  orderBy?: string,
): Promise<T[]> {
  if (!db) return [];
  const sql = orderBy
    ? `SELECT * FROM ${table} ORDER BY ${orderBy}`
    : `SELECT * FROM ${table}`;
  return db.select<T[]>(sql);
}

export async function exportAllData(): Promise<BackupData> {
  if (!getSyncFolder() || !db) {
    return {
      tasks: parseJson<any[]>(localStorage.getItem("uspevatel-tasks"), []),
      projects: parseJson<any[]>(
        localStorage.getItem("uspevatel-projects"),
        [],
      ),
      sport_entries: parseJson<any[]>(
        localStorage.getItem("sport_entries"),
        [],
      ),
      exercises: parseJson<any[]>(localStorage.getItem("exercises"), []),
      workout_logs: parseJson<any[]>(localStorage.getItem("workout_logs"), []),
      flights: parseJson<any[]>(localStorage.getItem("flights"), []),
      routine_items: parseJson<any[]>(
        localStorage.getItem("routine_items"),
        [],
      ),
      routine_completions: parseJson<any[]>(
        localStorage.getItem("routine_completions"),
        [],
      ),
      checklist: parseJson<any[]>(localStorage.getItem("checklist"), []),
      settings: loadLegacySettings(),
    };
  }

  return {
    tasks: await selectAll("tasks", "created_at DESC"),
    projects: await selectAll("projects", "name"),
    sport_entries: await selectAll("sport_entries", "date DESC, time DESC"),
    exercises: await selectAll("exercises", "tag, name"),
    workout_logs: await selectAll("workout_logs", "date DESC, created_at DESC"),
    flights: await selectAll("flights", "depart_date DESC"),
    routine_items: await selectAll("routines", "sort_order"),
    routine_completions: await selectAll("routine_completions", "date DESC"),
    checklist: await selectAll("checklist", "created_at DESC"),
    settings: await loadAppSettings(),
  };
}

function normalizeBackupData(raw: any): BackupData {
  return {
    tasks:
      raw.tasks ??
      parseJson<any[]>(
        raw["uspevatel-tasks"] ? JSON.stringify(raw["uspevatel-tasks"]) : null,
        [],
      ),
    projects:
      raw.projects ??
      parseJson<any[]>(
        raw["uspevatel-projects"]
          ? JSON.stringify(raw["uspevatel-projects"])
          : null,
        [],
      ),
    sport_entries: raw.sport_entries ?? [],
    exercises: raw.exercises ?? [],
    workout_logs: raw.workout_logs ?? [],
    flights: raw.flights ?? [],
    routine_items: raw.routine_items ?? [],
    routine_completions: raw.routine_completions ?? [],
    checklist: raw.checklist ?? [],
    settings: clampSettings(raw.settings ?? raw[SETTINGS_KEY] ?? {}),
  };
}

export async function importAllData(raw: any): Promise<void> {
  const data = normalizeBackupData(raw);
  if (!getSyncFolder() || !db) {
    localStorage.setItem("uspevatel-tasks", JSON.stringify(data.tasks));
    localStorage.setItem("uspevatel-projects", JSON.stringify(data.projects));
    localStorage.setItem("sport_entries", JSON.stringify(data.sport_entries));
    localStorage.setItem("exercises", JSON.stringify(data.exercises));
    localStorage.setItem("workout_logs", JSON.stringify(data.workout_logs));
    localStorage.setItem("flights", JSON.stringify(data.flights));
    localStorage.setItem("routine_items", JSON.stringify(data.routine_items));
    localStorage.setItem(
      "routine_completions",
      JSON.stringify(data.routine_completions),
    );
    localStorage.setItem("checklist", JSON.stringify(data.checklist));
    saveLegacySettings(data.settings);
    return;
  }

  await clearDatabaseTables();

  for (const task of data.tasks) {
    await db.execute(
      `INSERT OR REPLACE INTO tasks
        (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at, priority, is_recurring, recur_days, completed, completed_at, image_data, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        task.id,
        task.subject ?? "",
        task.action,
        task.category,
        task.context_category ?? task.contextCategory ?? null,
        task.project ?? null,
        task.notes ?? "",
        task.start_date ?? task.startDate ?? null,
        task.deadline ?? null,
        task.reminder_at ?? task.reminderAt ?? null,
        task.priority ?? "normal",
        task.is_recurring ?? (task.isRecurring ? 1 : 0),
        task.recur_days ??
          (task.recurDays ? JSON.stringify(task.recurDays) : null),
        task.completed ? 1 : 0,
        task.completed_at ?? task.completedAt ?? null,
        task.image_data ?? task.imageUri ?? null,
        task.created_at ?? task.createdAt ?? new Date().toISOString(),
        task.updated_at ?? task.updatedAt ?? new Date().toISOString(),
      ],
    );
  }

  for (const project of data.projects) {
    await db.execute(
      "INSERT OR REPLACE INTO projects (id, name, is_current, notes) VALUES ($1,$2,$3,$4)",
      [
        project.id,
        project.name,
        project.is_current ?? (project.isCurrent ? 1 : 0),
        project.notes ?? "",
      ],
    );
  }

  for (const entry of data.sport_entries) {
    await db.execute(
      "INSERT OR REPLACE INTO sport_entries (id, type, label, count, date, time) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        entry.id,
        entry.type,
        entry.label ?? null,
        entry.count,
        entry.date,
        entry.time,
      ],
    );
  }

  for (const exercise of data.exercises) {
    await db.execute(
      `INSERT OR REPLACE INTO exercises
        (id, name, description, image_uri, image_data, order_num, tag, weight_type, media_type, is_preset)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        exercise.id,
        exercise.name,
        exercise.description ?? null,
        exercise.image_uri ?? exercise.imageUri ?? null,
        exercise.image_data ?? exercise.imageUri ?? null,
        exercise.order_num ?? exercise.orderNum ?? 0,
        exercise.tag ?? null,
        exercise.weight_type ?? exercise.weightType ?? 10,
        exercise.media_type ?? exercise.mediaType ?? "photo",
        exercise.is_preset ?? (exercise.isPreset ? 1 : 0),
      ],
    );
  }

  for (const log of data.workout_logs) {
    await db.execute(
      "INSERT OR REPLACE INTO workout_logs (id, exercise_id, weight, reps, set_num, date, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        log.id,
        log.exercise_id ?? log.exerciseId,
        log.weight,
        log.reps,
        log.set_num ?? log.setNum ?? 1,
        log.date,
        log.created_at ?? log.createdAt ?? log.date,
      ],
    );
  }

  for (const flight of data.flights) {
    await db.execute(
      `INSERT OR REPLACE INTO flights
        (id, kind, title, status, depart_date, depart_time, arrive_date, arrive_time, notes, image_data, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        flight.id,
        flight.kind ?? "flight",
        flight.title,
        flight.status,
        flight.depart_date ?? flight.departDate,
        flight.depart_time ?? flight.departTime ?? null,
        flight.arrive_date ?? flight.arriveDate ?? null,
        flight.arrive_time ?? flight.arriveTime ?? null,
        flight.notes ?? "",
        flight.image_data ?? flight.imageUri ?? null,
        flight.created_at ?? flight.createdAt ?? new Date().toISOString(),
      ],
    );
  }

  for (const item of data.routine_items) {
    await db.execute(
      "INSERT OR REPLACE INTO routines (id, title, sort_order) VALUES ($1,$2,$3)",
      [item.id, item.title, item.sort_order ?? item.order ?? 0],
    );
  }

  const routineRows = Array.isArray(data.routine_completions)
    ? data.routine_completions
    : Object.entries(data.routine_completions).flatMap(([date, ids]) =>
        (ids as string[]).map((id) => ({ routine_id: id, date })),
      );
  for (const row of routineRows) {
    await db.execute(
      "INSERT OR IGNORE INTO routine_completions (routine_id, date) VALUES ($1,$2)",
      [row.routine_id ?? row.routineId, row.date],
    );
  }

  for (const item of data.checklist) {
    await db.execute(
      "INSERT OR REPLACE INTO checklist (id, title, done, created_at) VALUES ($1,$2,$3,$4)",
      [
        item.id,
        item.title,
        item.done ? 1 : 0,
        item.created_at ?? item.createdAt ?? new Date().toISOString(),
      ],
    );
  }

  await writeSettingsToDb(data.settings);
}

async function clearDatabaseTables(): Promise<void> {
  if (!db) return;
  for (const stmt of [
    "DELETE FROM tasks",
    "DELETE FROM projects",
    "DELETE FROM sport_entries",
    "DELETE FROM workout_logs",
    "DELETE FROM exercises",
    "DELETE FROM flights",
    "DELETE FROM routine_completions",
    "DELETE FROM routines",
    "DELETE FROM checklist",
    "DELETE FROM settings",
  ]) {
    await db.execute(stmt);
  }
}

export async function clearAllData(): Promise<void> {
  if (!getSyncFolder() || !db) {
    for (const key of [
      "uspevatel-tasks",
      "uspevatel-projects",
      "sport_entries",
      "exercises",
      "workout_logs",
      "flights",
      "routine_items",
      "routine_completions",
      "checklist",
      SETTINGS_KEY,
    ]) {
      localStorage.removeItem(key);
    }
    return;
  }
  await clearDatabaseTables();
}
