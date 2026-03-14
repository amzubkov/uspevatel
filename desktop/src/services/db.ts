import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;
let currentFolder: string | null = null;

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
  if (db) { try { await db.close(); } catch {} }
  const path = syncFolder.startsWith('/') ? `sqlite:${syncFolder}/uspevatel.db` : `sqlite:${syncFolder}/uspevatel.db`;
  db = await Database.load(path);
  currentFolder = syncFolder;
  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('PRAGMA foreign_keys = ON');
  for (const stmt of SCHEMA_STMTS) {
    await db.execute(stmt);
  }
  return db;
}

export function getDb(): Database | null { return db; }
export function getSyncFolder(): string | null { return currentFolder; }

export function getSyncFolderSetting(): string | null {
  return localStorage.getItem('syncFolder');
}

export function setSyncFolderSetting(folder: string) {
  localStorage.setItem('syncFolder', folder);
}
