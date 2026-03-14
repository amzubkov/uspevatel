import * as SQLite from 'expo-sqlite';
import { seedExercises } from './seed';
import { migrateFromAsyncStorage } from './migrate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

let _db: SQLite.SQLiteDatabase | null = null;
let _syncFolder: string | null = null;

const SYNC_FOLDER_KEY = 'uspevatel_sync_folder';

/** Get the current sync folder (null = use default app sandbox) */
export function getSyncFolder(): string | null { return _syncFolder; }

/** Get the base directory for images — syncFolder or Paths.document */
export function getImageBaseDir(): string { return _syncFolder || Paths.document.uri; }

/** Read sync folder from AsyncStorage (call once on startup) */
export async function loadSyncFolder(): Promise<string | null> {
  _syncFolder = await AsyncStorage.getItem(SYNC_FOLDER_KEY);
  return _syncFolder;
}

/** Save sync folder to AsyncStorage */
export async function setSyncFolder(folder: string | null): Promise<void> {
  _syncFolder = folder;
  if (folder) await AsyncStorage.setItem(SYNC_FOLDER_KEY, folder);
  else await AsyncStorage.removeItem(SYNC_FOLDER_KEY);
}

/** Close current DB connection (call before switching sync folder) */
export async function closeDb(): Promise<void> {
  if (_db) {
    try { await _db.closeAsync(); } catch {}
    _db = null;
  }
}

/** Copy DB + image folders from current location to target sync folder */
export async function copyDataToSyncFolder(targetFolder: string): Promise<{ copied: string[] }> {
  const copied: string[] = [];
  const srcBase = Paths.document.uri;
  const target = targetFolder.startsWith('file://') ? targetFolder : 'file://' + targetFolder;

  // Ensure target folder exists
  const targetInfo = await LegacyFS.getInfoAsync(target);
  if (!targetInfo.exists) {
    await LegacyFS.makeDirectoryAsync(target, { intermediates: true });
  }

  // Copy DB file (expo-sqlite stores it in SQLite/ subdirectory)
  const srcDbUri = srcBase + '/SQLite/uspevatel.db';
  const srcDbInfo = await LegacyFS.getInfoAsync(srcDbUri);
  if (srcDbInfo.exists) {
    const destSqliteDir = target + '/SQLite';
    const destDirInfo = await LegacyFS.getInfoAsync(destSqliteDir);
    if (!destDirInfo.exists) {
      await LegacyFS.makeDirectoryAsync(destSqliteDir, { intermediates: true });
    }
    const destDbUri = destSqliteDir + '/uspevatel.db';
    const destDbInfo = await LegacyFS.getInfoAsync(destDbUri);
    if (!destDbInfo.exists) {
      await LegacyFS.copyAsync({ from: srcDbUri, to: destDbUri });
      copied.push('uspevatel.db');
    }
  }

  // Copy image folders
  const imageDirs = ['task_images', 'flight_images', 'exercise_images'];
  for (const dir of imageDirs) {
    const srcDir = srcBase + '/' + dir;
    const srcInfo = await LegacyFS.getInfoAsync(srcDir);
    if (srcInfo.exists) {
      const destDir = target + '/' + dir;
      const destInfo = await LegacyFS.getInfoAsync(destDir);
      if (!destInfo.exists) {
        await LegacyFS.copyAsync({ from: srcDir, to: destDir });
        copied.push(dir);
      }
    }
  }

  return { copied };
}

const SCHEMA_VERSION = 3;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('IN','DAY','LATER','CONTROL','MAYBE')),
  context_category TEXT,
  project TEXT,
  notes TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  deadline TEXT,
  reminder_at TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('high','normal','low')),
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recur_days TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  image_data BLOB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS week_stats (
  week_start TEXT PRIMARY KEY,
  total_completed INTEGER NOT NULL DEFAULT 0,
  project_completed INTEGER NOT NULL DEFAULT 0,
  ratio REAL NOT NULL DEFAULT 0,
  diary_entry TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS routine_completions (
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (routine_id, date)
);

CREATE TABLE IF NOT EXISTS checklist (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'flight' CHECK(kind IN ('flight','hotel')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','booked','completed','cancelled')),
  depart_date TEXT NOT NULL,
  depart_time TEXT,
  arrive_date TEXT,
  arrive_time TEXT,
  notes TEXT NOT NULL DEFAULT '',
  image_data TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);

CREATE TABLE IF NOT EXISTS sport_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('pullups','abs','triceps','run','weight')),
  label TEXT,
  count REAL NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  name TEXT,
  description TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  UNIQUE(program_id, day_number)
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  image_uri TEXT,
  image_data BLOB,
  order_num INTEGER DEFAULT 0,
  tag TEXT,
  weight_type INTEGER DEFAULT 10,
  media_type TEXT DEFAULT 'photo',
  is_preset INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS day_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  order_num INTEGER DEFAULT 0,
  FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  UNIQUE(day_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS exercise_tags (
  exercise_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (exercise_id, tag_id),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL,
  weight REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL,
  set_num INTEGER DEFAULT 1,
  date TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_sport_entries_type_date ON sport_entries(type, date);
CREATE INDEX IF NOT EXISTS idx_days_program ON days(program_id);
CREATE INDEX IF NOT EXISTS idx_exercises_tag ON exercises(tag);
CREATE INDEX IF NOT EXISTS idx_day_exercises_day ON day_exercises(day_id);
CREATE INDEX IF NOT EXISTS idx_day_exercises_exercise ON day_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise ON workout_logs(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(date);
`;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  const db = await SQLite.openDatabaseAsync('uspevatel.db', {}, _syncFolder || undefined);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(SCHEMA);

  // Check if we need to seed and migrate
  const ver = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['schema_version']);
  const currentVer = ver ? parseInt(ver.value) : 0;

  if (currentVer === 0) {
    // First run: migrate existing AsyncStorage data, then seed exercises
    await migrateFromAsyncStorage(db);
    await seedExercises(db);
  }

  if (currentVer < 2) {
    // v2: add image_data BLOB columns + backfill preset exercise images
    try { await db.execAsync('ALTER TABLE exercises ADD COLUMN image_data BLOB;'); } catch {}
    try { await db.execAsync('ALTER TABLE tasks ADD COLUMN image_data BLOB;'); } catch {}
    // Backfill preset exercise images from bundled assets
    const { backfillExerciseImages } = require('./seed');
    await backfillExerciseImages(db);
  }

  if (currentVer < 3) {
    // v3: flights table
    try {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS flights (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'flight' CHECK(kind IN ('flight','hotel')),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','booked','completed','cancelled')),
        depart_date TEXT NOT NULL,
        depart_time TEXT,
        arrive_date TEXT,
        arrive_time TEXT,
        notes TEXT NOT NULL DEFAULT '',
        image_data TEXT,
        created_at TEXT NOT NULL
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);');
    } catch {}
  }

  if (currentVer < SCHEMA_VERSION) {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
  }

  _db = db;
  return db;
}
