import * as SQLite from "expo-sqlite";
import { seedExercises } from "./seed";
import { FOOD_CATALOG } from "./foodCatalog";
import {
  clearLegacyStorage,
  migrateFromAsyncStorage,
  readLegacyStorage,
} from "./migrate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths } from "expo-file-system";
import { canonicalWeekStart } from "../utils/date";

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let _syncFolder: string | null = null;

export const DATABASE_NAME = "uspevatel.db";

const SYNC_FOLDER_KEY = "uspevatel_sync_folder";

/** Get the current sync folder (null = use default app sandbox) */
export function getSyncFolder(): string | null {
  return _syncFolder;
}

/** Get the base directory for images — always app sandbox on Android */
export function getImageBaseDir(): string {
  return Paths.document.uri;
}

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
  const pending = _dbPromise;
  _dbPromise = null;
  if (!_db && pending) {
    try { _db = await pending; } catch {}
  }
  if (_db) {
    try {
      await _db.closeAsync();
    } catch {}
    _db = null;
  }
}

export const SCHEMA_VERSION = 49;

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
  priority TEXT NOT NULL DEFAULT 'normal',
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

CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL DEFAULT 'default' REFERENCES checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'flight' CHECK(kind IN ('flight','hotel','event')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  city TEXT,
  depart_date TEXT NOT NULL,
  depart_time TEXT,
  arrive_date TEXT,
  arrive_time TEXT,
  notes TEXT NOT NULL DEFAULT '',
  image_data TEXT,
  traveler_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);

CREATE TABLE IF NOT EXISTS flight_travelers (
  flight_id TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  traveler_id TEXT NOT NULL,
  PRIMARY KEY (flight_id, traveler_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);

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

CREATE TABLE IF NOT EXISTS health_metrics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  ref_min REAL,
  ref_max REAL,
  period_days INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS health_entries (
  id TEXT PRIMARY KEY,
  metric_id TEXT NOT NULL REFERENCES health_metrics(id) ON DELETE CASCADE,
  value REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_entries_metric ON health_entries(metric_id);
CREATE INDEX IF NOT EXISTS idx_health_entries_date ON health_entries(date);

CREATE TABLE IF NOT EXISTS health_metric_refs (
  id TEXT PRIMARY KEY,
  metric_id TEXT NOT NULL REFERENCES health_metrics(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  ref_min REAL,
  ref_max REAL,
  period_days INTEGER,
  UNIQUE(metric_id, source)
);

CREATE INDEX IF NOT EXISTS idx_health_refs_metric ON health_metric_refs(metric_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS doctor_visits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doctor_visit_images (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES doctor_visits(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doctor_visits_date ON doctor_visits(date);
CREATE INDEX IF NOT EXISTS idx_doctor_visit_images_visit ON doctor_visit_images(visit_id);

CREATE TABLE IF NOT EXISTS travelers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '👤',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_images (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_images_doc ON document_images(document_id);

CREATE TABLE IF NOT EXISTS cars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS car_documents (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS car_document_images (
  id TEXT PRIMARY KEY,
  car_document_id TEXT NOT NULL REFERENCES car_documents(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS car_services (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  mileage INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_car_documents_car ON car_documents(car_id);
CREATE INDEX IF NOT EXISTS idx_car_document_images_doc ON car_document_images(car_document_id);
CREATE INDEX IF NOT EXISTS idx_car_services_car ON car_services(car_id);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  timestamp TEXT,
  category TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  is_correction INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

CREATE TABLE IF NOT EXISTS nutrition_entries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
  amount_grams REAL NOT NULL CHECK(amount_grams > 0),
  kcal_per_100 REAL NOT NULL CHECK(kcal_per_100 >= 0),
  protein_per_100 REAL NOT NULL CHECK(protein_per_100 >= 0),
  fat_per_100 REAL NOT NULL CHECK(fat_per_100 >= 0),
  carbs_per_100 REAL NOT NULL CHECK(carbs_per_100 >= 0),
  kcal_auto INTEGER NOT NULL DEFAULT 0 CHECK(kcal_auto IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nutrition_entries_date ON nutrition_entries(date);

CREATE TABLE IF NOT EXISTS food_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  kcal_per_100 REAL NOT NULL,
  protein_per_100 REAL NOT NULL,
  fat_per_100 REAL NOT NULL,
  carbs_per_100 REAL NOT NULL,
  source TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_food_catalog_name ON food_catalog(name);

CREATE TABLE IF NOT EXISTS recurring_payments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  due_date TEXT NOT NULL,
  anchor_date TEXT NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'monthly' CHECK(recurrence IN ('once','weekly','monthly','quarterly','semiannual','yearly')),
  account_id TEXT,
  category TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_payments_due ON recurring_payments(due_date);

CREATE TABLE IF NOT EXISTS nutrition_plan (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
  name TEXT NOT NULL,
  amount_grams REAL NOT NULL CHECK(amount_grams > 0),
  kcal_per_100 REAL NOT NULL CHECK(kcal_per_100 >= 0),
  protein_per_100 REAL NOT NULL CHECK(protein_per_100 >= 0),
  fat_per_100 REAL NOT NULL CHECK(fat_per_100 >= 0),
  carbs_per_100 REAL NOT NULL CHECK(carbs_per_100 >= 0),
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  ingredients TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_date ON nutrition_plan(date);

CREATE TABLE IF NOT EXISTS telegram_inbox (
  update_id INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  PRIMARY KEY (update_id, item_index)
);

CREATE INDEX IF NOT EXISTS idx_telegram_inbox_status_update
  ON telegram_inbox(status, update_id);
`;

// Populate the offline food catalog from the bundled seed (only when empty).
async function seedFoodCatalog(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM food_catalog');
  if ((row?.cnt ?? 0) > 0) return;
  for (const [name, nameEn, kcal, protein, fat, carbs, source] of FOOD_CATALOG) {
    await db.runAsync(
      'INSERT INTO food_catalog (name, name_en, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, nameEn, kcal, protein, fat, carbs, source],
    );
  }
}

const REQUIRED_LATEST_COLUMNS: Record<string, readonly string[]> = {
  tasks: ['image_data', 'goal_type'],
  exercises: ['image_data', 'calories_per_rep', 'priority'],
  flights: ['kind', 'city', 'traveler_id', 'price', 'currency', 'flight_number', 'address'],
  checklist: ['list_id'],
  doctors: ['updated_at'],
  accounts: ['color', 'bank'],
  transactions: ['is_correction', 'timestamp'],
  contacts: ['tags'],
  workout_plan: ['sets', 'reps', 'weight'],
  nutrition_plan: ['ingredients'],
  recurring_payments: ['anchor_date'],
  telegram_inbox: ['update_id', 'item_index', 'status', 'last_error', 'processed_at'],
};

async function assertLatestSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const quickCheck = await db.getFirstAsync<Record<string, string>>('PRAGMA quick_check;');
  if (!quickCheck || Object.values(quickCheck)[0] !== 'ok') {
    throw new Error(`SQLite quick_check не пройден: ${JSON.stringify(quickCheck)}`);
  }
  for (const [table, required] of Object.entries(REQUIRED_LATEST_COLUMNS)) {
    const exists = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [table],
    );
    if (!exists) throw new Error(`Миграция не создала таблицу ${table}`);
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
    const actual = new Set(columns.map((column) => column.name));
    const missing = required.filter((column) => !actual.has(column));
    if (missing.length > 0) {
      throw new Error(`Миграция ${table} не создала колонки: ${missing.join(', ')}`);
    }
  }
  const inboxIndex = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_telegram_inbox_status_update'",
  );
  if (!inboxIndex) throw new Error('Миграция не создала индекс telegram_inbox');
}

async function tableExists(db: SQLite.SQLiteDatabase, table: string): Promise<boolean> {
  return !!(await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  ));
}

/**
 * Recover the `_new`/`_fix` stage left by a pre-transactional release. SCHEMA
 * recreates a missing source table before this runs, so an empty source plus a
 * populated replacement means the old process had already dropped the source.
 */
async function recoverInterruptedReplacement(
  db: SQLite.SQLiteDatabase,
  sourceTable: string,
  replacementTable: string,
): Promise<boolean> {
  if (!(await tableExists(db, replacementTable))) return false;
  const sourceCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${sourceTable}`,
  );
  const replacementCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${replacementTable}`,
  );
  if ((sourceCount?.count ?? 0) === 0 && (replacementCount?.count ?? 0) > 0) {
    await db.execAsync(`DROP TABLE ${sourceTable};`);
    await db.execAsync(`ALTER TABLE ${replacementTable} RENAME TO ${sourceTable};`);
    return true;
  }
  // The original source still exists and is authoritative; rebuild afresh.
  await db.execAsync(`DROP TABLE ${replacementTable};`);
  return false;
}

async function initializeDb(): Promise<SQLite.SQLiteDatabase> {
  // Always open DB from app sandbox (external paths don't work on Android)
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync(SCHEMA);

  // Check if we need to seed and migrate
  const ver = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    ["schema_version"],
  );
  const parsedVersion = ver ? parseInt(ver.value, 10) : 0;
  const currentVer = Number.isFinite(parsedVersion) ? parsedVersion : 0;
  if (currentVer > SCHEMA_VERSION) {
    await db.closeAsync();
    throw new Error(`База создана более новой версией приложения (${currentVer} > ${SCHEMA_VERSION})`);
  }
  if (currentVer === SCHEMA_VERSION) {
    await assertLatestSchema(db);
    return db;
  }

  // Read external storage before BEGIN, but clear it only after COMMIT.
  let legacySnapshot = {};
  try {
    legacySnapshot = currentVer === 0 ? await readLegacyStorage() : {};
  } catch (error) {
    try { await db.closeAsync(); } catch {}
    throw error;
  }
  let migratedLegacyKeys: string[] = [];

  try {
    await db.execAsync("BEGIN IMMEDIATE;");
  } catch (error) {
    try { await db.closeAsync(); } catch {}
    throw error;
  }
  try {
  // Re-running after an interrupted historical migration can legitimately
  // encounter a column that was already added. Only that exact case is safe
  // to ignore; every other error aborts the transaction and preserves version.
  const alterIgnoringDuplicate = async (sql: string) => {
    try {
      await db.execAsync(sql);
    } catch (error: any) {
      if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
    }
  };

  if (currentVer < 2) {
    // v2: add image_data BLOB columns + backfill preset exercise images
    await alterIgnoringDuplicate("ALTER TABLE exercises ADD COLUMN image_data BLOB;");
    await alterIgnoringDuplicate("ALTER TABLE tasks ADD COLUMN image_data BLOB;");
    // Backfill preset exercise images from bundled assets
    const { backfillExerciseImages } = require("./seed");
    await backfillExerciseImages(db);
  }

  if (currentVer < 3) {
    // v3: flights table
      await db.execAsync(`CREATE TABLE IF NOT EXISTS flights (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'flight' CHECK(kind IN ('flight','hotel','event')),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        depart_date TEXT NOT NULL,
        depart_time TEXT,
        arrive_date TEXT,
        arrive_time TEXT,
        notes TEXT NOT NULL DEFAULT '',
        image_data TEXT,
        created_at TEXT NOT NULL
      );`);
      await db.execAsync(
        "CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);",
      );
  }

  if (currentVer < 4) {
    // v4: health tables
      await db.execAsync(`CREATE TABLE IF NOT EXISTS health_metrics (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        ref_min REAL,
        ref_max REAL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS health_entries (
        id TEXT PRIMARY KEY,
        metric_id TEXT NOT NULL REFERENCES health_metrics(id) ON DELETE CASCADE,
        value REAL NOT NULL,
        date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );`);
      await db.execAsync(
        "CREATE INDEX IF NOT EXISTS idx_health_entries_metric ON health_entries(metric_id);",
      );
      await db.execAsync(
        "CREATE INDEX IF NOT EXISTS idx_health_entries_date ON health_entries(date);",
      );
  }

  if (currentVer < 5) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        created_at TEXT NOT NULL
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);');
  }

  if (currentVer < 6) {
    await alterIgnoringDuplicate('ALTER TABLE health_metrics ADD COLUMN period_days INTEGER;');
  }

  if (currentVer < 7) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS doctor_visits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS doctor_visit_images (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES doctor_visits(id) ON DELETE CASCADE,
        image_path TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_doctor_visits_date ON doctor_visits(date);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_doctor_visit_images_visit ON doctor_visit_images(visit_id);');
  }

  if (currentVer < 8) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS travelers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '👤',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );`);
    await alterIgnoringDuplicate('ALTER TABLE flights ADD COLUMN traveler_id TEXT;');
  }

  if (currentVer < 9) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS document_images (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, image_path TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_document_images_doc ON document_images(document_id);');
  }

  if (currentVer < 10) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS cars (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS car_documents (id TEXT PRIMARY KEY, car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS car_document_images (id TEXT PRIMARY KEY, car_document_id TEXT NOT NULL REFERENCES car_documents(id) ON DELETE CASCADE, image_path TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS car_services (id TEXT PRIMARY KEY, car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE, date TEXT NOT NULL, mileage INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_car_documents_car ON car_documents(car_id);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_car_document_images_doc ON car_document_images(car_document_id);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_car_services_car ON car_services(car_id);');
  }

  if (currentVer < 11) {
    await alterIgnoringDuplicate('ALTER TABLE flights ADD COLUMN city TEXT;');
  }

  if (currentVer < 12) {
    // Ensure kind column exists — was missing if flights table was created before v3 migration
    await alterIgnoringDuplicate("ALTER TABLE flights ADD COLUMN kind TEXT NOT NULL DEFAULT 'flight';");
  }

  if (currentVer < 13) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL DEFAULT '',
        image_path TEXT,
        created_at TEXT NOT NULL
      );`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS note_tags (
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (note_id, tag)
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);');
  }

  if (currentVer < 14) {
    // calories per rep for exercises
    await alterIgnoringDuplicate('ALTER TABLE exercises ADD COLUMN calories_per_rep REAL NOT NULL DEFAULT 0;');
  }

  if (currentVer < 15) {
    // many-to-many travelers for flights
      await db.execAsync(`CREATE TABLE IF NOT EXISTS flight_travelers (
        flight_id TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
        traveler_id TEXT NOT NULL,
        PRIMARY KEY (flight_id, traveler_id)
      );`);
      // Migrate existing traveler_id data
      await db.execAsync(`INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id)
        SELECT id, traveler_id FROM flights WHERE traveler_id IS NOT NULL AND traveler_id != '';`);
  }

  if (currentVer < 16) {
    // no-op (was destructive migration, removed)
  }

  if (currentVer < 17) {
    await alterIgnoringDuplicate('ALTER TABLE flights ADD COLUMN price REAL;');
    await alterIgnoringDuplicate("ALTER TABLE flights ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';");
  }

  if (currentVer < 18) {
    // Fix data corrupted by v16 migration (DROP+SELECT* with wrong column order)
    // Detect corruption: if title contains status values, data is shifted
    await recoverInterruptedReplacement(db, 'flights', 'flights_fix');
    const probe = await db.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM flights WHERE title IN ('planned','booked','completed','cancelled')"
    );
    if (probe && probe.cnt > 0) {
        // Data is corrupted. Current (wrong) layout after v16:
        //   id, kind=old.title, title=old.status, status=old.depart_date, city=old.depart_time,
        //   depart_date=old.arrive_date, depart_time=old.arrive_time, arrive_date=old.notes,
        //   arrive_time=old.image_data, notes=old.created_at, image_data=old.traveler_id(?),
        //   traveler_id=old.city, created_at=old.kind
        // Restore by creating correct table and mapping back
        await db.execAsync('DROP TABLE IF EXISTS flights_fix;');
        await db.execAsync(`CREATE TABLE flights_fix (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL DEFAULT 'flight',
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'planned',
          city TEXT,
          depart_date TEXT NOT NULL,
          depart_time TEXT,
          arrive_date TEXT,
          arrive_time TEXT,
          notes TEXT NOT NULL DEFAULT '',
          image_data TEXT,
          traveler_id TEXT,
          created_at TEXT NOT NULL,
          price REAL,
          currency TEXT NOT NULL DEFAULT 'EUR'
        );`);
        await db.execAsync(`INSERT OR IGNORE INTO flights_fix
          (id, kind, title, status, city, depart_date, depart_time, arrive_date, arrive_time, notes, image_data, traveler_id, created_at)
          SELECT id,
            COALESCE(created_at, 'flight'),
            kind,
            title,
            traveler_id,
            status,
            city,
            depart_date,
            depart_time,
            arrive_date,
            arrive_time,
            image_data,
            notes
          FROM flights;`);
        await db.execAsync('DROP TABLE IF EXISTS temp._flight_travelers_backup;');
        await db.execAsync(`CREATE TEMP TABLE _flight_travelers_backup AS
          SELECT flight_id, traveler_id FROM flight_travelers;`);
        await db.execAsync('DROP TABLE flights;');
        await db.execAsync('ALTER TABLE flights_fix RENAME TO flights;');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);');
        await db.execAsync(`INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id)
          SELECT flight_id, traveler_id FROM _flight_travelers_backup;`);
        await db.execAsync('DROP TABLE _flight_travelers_backup;');
    }
  }

  if (currentVer < 19) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS health_metric_refs (
        id TEXT PRIMARY KEY,
        metric_id TEXT NOT NULL REFERENCES health_metrics(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        ref_min REAL,
        ref_max REAL,
        period_days INTEGER,
        UNIQUE(metric_id, source)
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_health_refs_metric ON health_metric_refs(metric_id);');
  }

  if (currentVer < 20) {
    await alterIgnoringDuplicate("ALTER TABLE documents ADD COLUMN notes TEXT NOT NULL DEFAULT '';");
  }

  if (currentVer < 21) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS checklists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );`);
      await db.execAsync("INSERT OR IGNORE INTO checklists (id, name, sort_order) VALUES ('default', 'Чеклист', 0);");
      await alterIgnoringDuplicate("ALTER TABLE checklist ADD COLUMN list_id TEXT NOT NULL DEFAULT 'default' REFERENCES checklists(id) ON DELETE CASCADE;");
  }

  if (currentVer < 22) {
    // Recreate flights table to relax CHECK constraint on kind (add 'event')
    const recoveredFlights = await recoverInterruptedReplacement(db, 'flights', 'flights_new');
    if (!recoveredFlights) {
      await db.execAsync(`CREATE TABLE flights_new (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'flight' CHECK(kind IN ('flight','hotel','event')),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        city TEXT,
        depart_date TEXT NOT NULL,
        depart_time TEXT,
        arrive_date TEXT,
        arrive_time TEXT,
        notes TEXT NOT NULL DEFAULT '',
        image_data TEXT,
        traveler_id TEXT,
        price REAL,
        currency TEXT DEFAULT 'EUR',
        created_at TEXT NOT NULL
      );`);
      await db.execAsync(`INSERT INTO flights_new
        SELECT id, kind, title, status, city, depart_date, depart_time, arrive_date, arrive_time,
          notes, image_data, traveler_id, price, currency, created_at FROM flights;`);
      await db.execAsync('DROP TABLE IF EXISTS temp._flight_travelers_backup;');
      await db.execAsync(`CREATE TEMP TABLE _flight_travelers_backup AS
        SELECT flight_id, traveler_id FROM flight_travelers;`);
      await db.execAsync(`DROP TABLE flights;`);
      await db.execAsync(`ALTER TABLE flights_new RENAME TO flights;`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);`);
      await db.execAsync(`INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id)
        SELECT flight_id, traveler_id FROM _flight_travelers_backup;`);
      await db.execAsync('DROP TABLE _flight_travelers_backup;');
    } else {
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);');
    }
  }

  if (currentVer < 23) {
    // Recreate checklist table to ensure list_id column exists
      await db.execAsync(`CREATE TABLE IF NOT EXISTS checklists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );`);
      await db.execAsync("INSERT OR IGNORE INTO checklists (id, name, sort_order) VALUES ('default', 'Чеклист', 0);");
      const recoveredChecklist = await recoverInterruptedReplacement(db, 'checklist', 'checklist_new');
      // Check if list_id exists
      const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(checklist)");
      const hasListId = cols.some((c) => c.name === 'list_id');
      if (!recoveredChecklist && !hasListId) {
        await db.execAsync(`CREATE TABLE checklist_new (
          id TEXT PRIMARY KEY,
          list_id TEXT NOT NULL DEFAULT 'default',
          title TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );`);
        await db.execAsync(`INSERT INTO checklist_new (id, list_id, title, done, created_at) SELECT id, 'default', title, done, created_at FROM checklist;`);
        await db.execAsync(`DROP TABLE checklist;`);
        await db.execAsync(`ALTER TABLE checklist_new RENAME TO checklist;`);
      }
  }

  if (currentVer < 24) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'RUB',
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL DEFAULT '',
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);');
  }

  if (currentVer < 25) {
    // Ensure accounts.color column exists (was added to schema but not migrated)
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(accounts)");
    if (!cols.some((c) => c.name === 'color')) {
      await db.execAsync("ALTER TABLE accounts ADD COLUMN color TEXT;");
    }
  }

  if (currentVer < 26) {
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(transactions)");
    if (!cols.some((c) => c.name === 'is_correction')) {
      await db.execAsync("ALTER TABLE transactions ADD COLUMN is_correction INTEGER NOT NULL DEFAULT 0;");
    }
    if (!cols.some((c) => c.name === 'timestamp')) {
      await db.execAsync("ALTER TABLE transactions ADD COLUMN timestamp TEXT;");
      await db.execAsync("UPDATE transactions SET timestamp = date || 'T00:00:00' WHERE timestamp IS NULL;");
    }
  }

  if (currentVer < 27) {
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(tasks)");
    if (!cols.some((c) => c.name === 'goal_type')) {
      await db.execAsync("ALTER TABLE tasks ADD COLUMN goal_type TEXT;");
    }
  }

  if (currentVer < 28) {
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(flights)");
    if (!cols.some((c) => c.name === 'flight_number')) {
      await db.execAsync("ALTER TABLE flights ADD COLUMN flight_number TEXT;");
    }
  }

  if (currentVer < 29) {
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(accounts)");
    if (!cols.some((c) => c.name === 'bank')) {
      await db.execAsync("ALTER TABLE accounts ADD COLUMN bank TEXT;");
    }
  }

  if (currentVer < 30) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS daily_logs (
        id TEXT PRIMARY KEY,
        date TEXT UNIQUE NOT NULL,
        sleep_hours REAL,
        sleep_quality INTEGER,
        productivity INTEGER,
        motivation INTEGER,
        day_rating INTEGER,
        sport_football INTEGER NOT NULL DEFAULT 0,
        sport_run INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );`);
  }

  if (currentVer < 31) {
      // Recreate sport_entries without CHECK constraint to allow football/squats
      const recoveredSport = await recoverInterruptedReplacement(db, 'sport_entries', 'sport_entries_new');
      if (!recoveredSport) {
        await db.execAsync(`CREATE TABLE sport_entries_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT,
        count REAL NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL
      );`);
        await db.execAsync(`INSERT OR IGNORE INTO sport_entries_new SELECT * FROM sport_entries;`);
        await db.execAsync(`DROP TABLE sport_entries;`);
        await db.execAsync(`ALTER TABLE sport_entries_new RENAME TO sport_entries;`);
      }
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sport_entries_type_date ON sport_entries(type, date);`);
  }

  if (currentVer < 32) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialty TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        clinic TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT ''
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name);');
  }

  if (currentVer < 33) {
    await alterIgnoringDuplicate(`ALTER TABLE doctors ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';`);
    await db.execAsync(`UPDATE doctors SET updated_at = created_at WHERE updated_at = '';`);
  }

  if (currentVer < 34) {
    // v34: persons + lab_archive + person_id on entries/visits
      await db.execAsync(`CREATE TABLE IF NOT EXISTS persons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );`);
      // Seed defaults
      const seed: [string, string, number][] = [
        ['me', 'Я', 1],
        ['katya', 'Катя', 2],
        ['atyatya', 'Атятя', 3],
        ['mama', 'Мама', 4],
        ['papa', 'Папа', 5],
      ];
      for (const [id, name, ord] of seed) {
        await db.runAsync(
          'INSERT OR IGNORE INTO persons (id, name, sort_order) VALUES (?,?,?)',
          [id, name, ord],
        );
      }
    await alterIgnoringDuplicate(`ALTER TABLE health_entries ADD COLUMN person_id TEXT NOT NULL DEFAULT 'me';`);
    await alterIgnoringDuplicate(`ALTER TABLE doctor_visits ADD COLUMN person_id TEXT NOT NULL DEFAULT 'me';`);
    await alterIgnoringDuplicate(`ALTER TABLE doctor_visits ADD COLUMN status TEXT NOT NULL DEFAULT 'done';`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS lab_archive (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL DEFAULT 'me',
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'done',
        created_at TEXT NOT NULL
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_lab_archive_person ON lab_archive(person_id);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_lab_archive_date ON lab_archive(date);');
  }

  if (currentVer < 35) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT ''
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);');
  }

  if (currentVer < 36) {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS contact_messages (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL,
        text TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'out',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT ''
      );`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_contact_messages_contact ON contact_messages(contact_id, created_at);');
  }

  if (currentVer < 37) {
    await alterIgnoringDuplicate(`ALTER TABLE contacts ADD COLUMN tags TEXT NOT NULL DEFAULT '';`);
  }

  if (currentVer < 38) {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS workout_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      exercise_id INTEGER NOT NULL,
      order_num INTEGER DEFAULT 0,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
      UNIQUE(date, exercise_id)
    );`);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_workout_plan_date ON workout_plan(date);');
  }

  if (currentVer < 39) {
    await alterIgnoringDuplicate(`ALTER TABLE exercises ADD COLUMN priority INTEGER NOT NULL DEFAULT 5;`);
  }

  if (currentVer < 40) {
    await alterIgnoringDuplicate(`ALTER TABLE flights ADD COLUMN address TEXT;`);
  }

  if (currentVer < 41) {
    await alterIgnoringDuplicate(`ALTER TABLE workout_plan ADD COLUMN sets INTEGER;`);
    await alterIgnoringDuplicate(`ALTER TABLE workout_plan ADD COLUMN reps INTEGER;`);
    await alterIgnoringDuplicate(`ALTER TABLE workout_plan ADD COLUMN weight REAL;`);
  }

  if (currentVer < 42) {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS nutrition_entries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
      amount_grams REAL NOT NULL CHECK(amount_grams > 0),
      kcal_per_100 REAL NOT NULL CHECK(kcal_per_100 >= 0),
      protein_per_100 REAL NOT NULL CHECK(protein_per_100 >= 0),
      fat_per_100 REAL NOT NULL CHECK(fat_per_100 >= 0),
      carbs_per_100 REAL NOT NULL CHECK(carbs_per_100 >= 0),
      kcal_auto INTEGER NOT NULL DEFAULT 0 CHECK(kcal_auto IN (0, 1)),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );`);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_nutrition_entries_date ON nutrition_entries(date);');
  }

  if (currentVer < 43) {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS food_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_en TEXT NOT NULL DEFAULT '',
      kcal_per_100 REAL NOT NULL,
      protein_per_100 REAL NOT NULL,
      fat_per_100 REAL NOT NULL,
      carbs_per_100 REAL NOT NULL,
      source TEXT NOT NULL DEFAULT ''
    );`);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_food_catalog_name ON food_catalog(name);');
    await seedFoodCatalog(db);
  }

  if (currentVer < 44) {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS recurring_payments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      due_date TEXT NOT NULL,
      recurrence TEXT NOT NULL DEFAULT 'monthly' CHECK(recurrence IN ('once','weekly','monthly','yearly')),
      account_id TEXT,
      category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      created_at TEXT NOT NULL
    );`);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_recurring_payments_due ON recurring_payments(due_date);');
  }

  if (currentVer < 45) {
    // Widen recurrence CHECK to include quarterly/semiannual — rebuild the table.
    const oldTable = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recurring_payments_old'",
    );
    if (oldTable) {
      // Recover a rebuild interrupted by an older, non-transactional release.
      // The _old table is authoritative because schema_version was not committed.
      await db.execAsync('DROP TABLE recurring_payments;');
    } else {
      await db.execAsync('ALTER TABLE recurring_payments RENAME TO recurring_payments_old;');
    }
    await db.execAsync(`CREATE TABLE recurring_payments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      due_date TEXT NOT NULL,
      recurrence TEXT NOT NULL DEFAULT 'monthly' CHECK(recurrence IN ('once','weekly','monthly','quarterly','semiannual','yearly')),
      account_id TEXT,
      category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      created_at TEXT NOT NULL
    );`);
    await db.execAsync(`INSERT INTO recurring_payments
      (id, name, amount, currency, due_date, recurrence, account_id, category, notes, active, created_at)
      SELECT id, name, amount, currency, due_date, recurrence, account_id, category, notes, active, created_at
      FROM recurring_payments_old;`);
    await db.execAsync('DROP TABLE recurring_payments_old;');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_recurring_payments_due ON recurring_payments(due_date);');
  }

  if (currentVer < 46) {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS nutrition_plan (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
      name TEXT NOT NULL,
      amount_grams REAL NOT NULL CHECK(amount_grams > 0),
      kcal_per_100 REAL NOT NULL CHECK(kcal_per_100 >= 0),
      protein_per_100 REAL NOT NULL CHECK(protein_per_100 >= 0),
      fat_per_100 REAL NOT NULL CHECK(fat_per_100 >= 0),
      carbs_per_100 REAL NOT NULL CHECK(carbs_per_100 >= 0),
      done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
      created_at TEXT NOT NULL
    );`);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_nutrition_plan_date ON nutrition_plan(date);');
  }

  if (currentVer < 47) {
    await alterIgnoringDuplicate(`ALTER TABLE nutrition_plan ADD COLUMN ingredients TEXT NOT NULL DEFAULT '[]';`);
  }

  if (currentVer < 48) {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS telegram_inbox (
      update_id INTEGER NOT NULL,
      item_index INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT,
      PRIMARY KEY (update_id, item_index)
    );`);
    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_telegram_inbox_status_update ON telegram_inbox(status, update_id);',
    );
  }

  if (currentVer < 49) {
    // Persist the original calendar anchor so Jan 31 -> Feb 28 -> Mar 31.
    await alterIgnoringDuplicate(
      `ALTER TABLE recurring_payments ADD COLUMN anchor_date TEXT NOT NULL DEFAULT '';`,
    );
    await db.execAsync(
      `UPDATE recurring_payments
       SET anchor_date = due_date
       WHERE anchor_date IS NULL OR anchor_date = '';`,
    );
  }

  if (currentVer === 0) {
    await seedExercises(db);
    migratedLegacyKeys = await migrateFromAsyncStorage(db, legacySnapshot);
  }

  if (currentVer < 49) {
    // Run after the v0 AsyncStorage import: older releases saved local Monday
    // through toISOString(), shifting its textual date in positive timezones.
    type WeekStatsMigrationRow = {
      week_start: string;
      total_completed: number;
      project_completed: number;
      ratio: number;
      diary_entry: string;
    };
    const legacyWeekRows = await db.getAllAsync<WeekStatsMigrationRow>(
      `SELECT week_start, total_completed, project_completed, ratio, diary_entry
       FROM week_stats ORDER BY week_start ASC`,
    );
    const canonicalRows = new Map<string, {
      row: WeekStatsMigrationRow;
      sourceWasCanonical: boolean;
    }>();
    let weekStatsNeedRewrite = false;
    for (const row of legacyWeekRows) {
      let weekStart = row.week_start;
      try {
        weekStart = canonicalWeekStart(row.week_start);
      } catch {
        // Preserve an unexpected legacy value instead of blocking startup.
      }
      const sourceWasCanonical = weekStart === row.week_start;
      weekStatsNeedRewrite ||= !sourceWasCanonical;
      const existing = canonicalRows.get(weekStart);
      if (existing) weekStatsNeedRewrite = true;
      if (
        !existing
        || (sourceWasCanonical && !existing.sourceWasCanonical)
        || (sourceWasCanonical === existing.sourceWasCanonical
          && row.week_start.localeCompare(existing.row.week_start) > 0)
      ) {
        canonicalRows.set(weekStart, {
          row: { ...row, week_start: weekStart },
          sourceWasCanonical,
        });
      }
    }
    if (weekStatsNeedRewrite) {
      await db.execAsync('DELETE FROM week_stats;');
      for (const { row } of canonicalRows.values()) {
        await db.runAsync(
          `INSERT INTO week_stats
           (week_start, total_completed, project_completed, ratio, diary_entry)
           VALUES (?, ?, ?, ?, ?)`,
          [row.week_start, row.total_completed, row.project_completed, row.ratio, row.diary_entry],
        );
      }
    }
  }

  if (currentVer < SCHEMA_VERSION) {
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ["schema_version", String(SCHEMA_VERSION)],
    );
  }

    await assertLatestSchema(db);
    await db.execAsync("COMMIT;");
  } catch (error) {
    try { await db.execAsync("ROLLBACK;"); } catch {}
    try { await db.closeAsync(); } catch {}
    throw error;
  }

  if (migratedLegacyKeys.length > 0) {
    try {
      await clearLegacyStorage(migratedLegacyKeys);
    } catch (error) {
      // The committed schema_version prevents a duplicate import. Keeping the
      // old keys is harmless and safer than failing an otherwise valid DB.
      console.warn('Не удалось удалить старые AsyncStorage-ключи:', error);
    }
  }
  return db;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = initializeDb()
      .then((db) => {
        _db = db;
        return db;
      })
      .finally(() => {
        _dbPromise = null;
      });
  }
  return _dbPromise;
}

export interface DatabaseInspection {
  schemaVersion: number;
}

async function inspectDatabase(
  db: SQLite.SQLiteDatabase,
  expectedSchemaVersion?: number,
): Promise<DatabaseInspection> {
  const quickCheck = await db.getFirstAsync<Record<string, string>>('PRAGMA quick_check;');
  if (!quickCheck || Object.values(quickCheck)[0] !== 'ok') {
    throw new Error(`Бэкап повреждён (quick_check): ${JSON.stringify(quickCheck)}`);
  }
  const requiredTables = ['settings', 'tasks', 'exercises'];
  for (const table of requiredTables) {
    const row = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [table],
    );
    if (!row) throw new Error(`Бэкап не содержит обязательную таблицу ${table}`);
  }
  const versionRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'schema_version'",
  );
  const schemaVersion = Number(versionRow?.value);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error('В бэкапе отсутствует корректная schema_version');
  }
  if (schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Бэкап создан более новой версией приложения (${schemaVersion} > ${SCHEMA_VERSION})`);
  }
  if (expectedSchemaVersion != null && schemaVersion !== expectedSchemaVersion) {
    throw new Error(
      `Версия БД не совпадает с manifest (${schemaVersion} != ${expectedSchemaVersion})`,
    );
  }
  const foreignKeyErrors = await db.getAllAsync('PRAGMA foreign_key_check;');
  if (foreignKeyErrors.length > 0) {
    throw new Error(`Бэкап содержит нарушенные связи (${foreignKeyErrors.length})`);
  }
  return { schemaVersion };
}

/** Validate serialized SQLite bytes without touching the live database. */
export async function inspectSerializedDatabase(
  bytes: Uint8Array,
  expectedSchemaVersion?: number,
): Promise<DatabaseInspection> {
  let staged: SQLite.SQLiteDatabase | null = null;
  try {
    staged = await SQLite.deserializeDatabaseAsync(bytes);
    await staged.execAsync('PRAGMA foreign_keys = ON;');
    return await inspectDatabase(staged, expectedSchemaVersion);
  } finally {
    if (staged) {
      try { await staged.closeAsync(); } catch {}
    }
  }
}

async function overwriteLiveDatabase(bytes: Uint8Array): Promise<void> {
  const source = await SQLite.deserializeDatabaseAsync(bytes);
  let destination: SQLite.SQLiteDatabase | null = null;
  try {
    destination = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await SQLite.backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
  } finally {
    try { await source.closeAsync(); } catch {}
    if (destination) {
      try { await destination.closeAsync(); } catch {}
    }
  }
}

/**
 * Replace the live DB from a validated staged snapshot. If replacement or a
 * subsequent migration fails, the exact pre-restore snapshot is written back.
 */
export async function replaceDatabaseFromBytes(
  bytes: Uint8Array,
  expectedSchemaVersion?: number,
): Promise<SQLite.SQLiteDatabase> {
  await inspectSerializedDatabase(bytes, expectedSchemaVersion);
  const live = await getDb();
  const rollbackBytes = await live.serializeAsync();
  await closeDb();
  try {
    await overwriteLiveDatabase(bytes);
    return await getDb();
  } catch (restoreError) {
    try {
      await closeDb();
      await overwriteLiveDatabase(rollbackBytes);
      await getDb();
    } catch (rollbackError) {
      throw new Error(
        `Восстановление не удалось: ${String(restoreError)}. Откат также не удался: ${String(rollbackError)}`,
      );
    }
    throw restoreError;
  }
}

/** Delete all SQLite files and immediately create a clean, seeded database. */
export async function recreateEmptyDatabase(): Promise<SQLite.SQLiteDatabase> {
  await closeDb();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  return getDb();
}

const FOLDER_SYNC_DISABLED_MESSAGE =
  "Синхронизация через папку временно отключена в этой сборке.";

/** Export internal DB to sync folder (push) */
export async function exportDbToFolder(): Promise<string> {
  if (!_syncFolder) throw new Error("Папка синхронизации не выбрана");
  throw new Error(FOLDER_SYNC_DISABLED_MESSAGE);
}

/** Import DB from sync folder to internal (pull) */
export async function importDbFromFolder(): Promise<string> {
  if (!_syncFolder) throw new Error("Папка синхронизации не выбрана");
  throw new Error(FOLDER_SYNC_DISABLED_MESSAGE);
}
