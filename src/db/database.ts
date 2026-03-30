import * as SQLite from "expo-sqlite";
import { seedExercises } from "./seed";
import { migrateFromAsyncStorage } from "./migrate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths } from "expo-file-system";

let _db: SQLite.SQLiteDatabase | null = null;
let _syncFolder: string | null = null;

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
  if (_db) {
    try {
      await _db.closeAsync();
    } catch {}
    _db = null;
  }
}

const SCHEMA_VERSION = 20;

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
`;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  // Always open DB from app sandbox (external paths don't work on Android)
  const db = await SQLite.openDatabaseAsync("uspevatel.db");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync(SCHEMA);

  // Check if we need to seed and migrate
  const ver = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    ["schema_version"],
  );
  const currentVer = ver ? parseInt(ver.value, 10) : 0;

  if (currentVer === 0) {
    // First run: migrate existing AsyncStorage data, then seed exercises
    await migrateFromAsyncStorage(db);
    await seedExercises(db);
  }

  if (currentVer < 2) {
    // v2: add image_data BLOB columns + backfill preset exercise images
    try {
      await db.execAsync("ALTER TABLE exercises ADD COLUMN image_data BLOB;");
    } catch {}
    try {
      await db.execAsync("ALTER TABLE tasks ADD COLUMN image_data BLOB;");
    } catch {}
    // Backfill preset exercise images from bundled assets
    const { backfillExerciseImages } = require("./seed");
    await backfillExerciseImages(db);
  }

  if (currentVer < 3) {
    // v3: flights table
    try {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS flights (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'flight' CHECK(kind IN ('flight','hotel')),
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
    } catch {}
  }

  if (currentVer < 4) {
    // v4: health tables
    try {
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
    } catch {}
  }

  if (currentVer < 5) {
    try {
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
    } catch {}
  }

  if (currentVer < 6) {
    try { await db.execAsync('ALTER TABLE health_metrics ADD COLUMN period_days INTEGER;'); } catch {}
  }

  if (currentVer < 7) {
    try {
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
    } catch {}
  }

  if (currentVer < 8) {
    try {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS travelers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '👤',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );`);
    } catch {}
    try { await db.execAsync('ALTER TABLE flights ADD COLUMN traveler_id TEXT;'); } catch {}
  }

  if (currentVer < 9) {
    try {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS document_images (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, image_path TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_document_images_doc ON document_images(document_id);');
    } catch {}
  }

  if (currentVer < 10) {
    try {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS cars (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS car_documents (id TEXT PRIMARY KEY, car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS car_document_images (id TEXT PRIMARY KEY, car_document_id TEXT NOT NULL REFERENCES car_documents(id) ON DELETE CASCADE, image_path TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS car_services (id TEXT PRIMARY KEY, car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE, date TEXT NOT NULL, mileage INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);`);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_car_documents_car ON car_documents(car_id);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_car_document_images_doc ON car_document_images(car_document_id);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_car_services_car ON car_services(car_id);');
    } catch {}
  }

  if (currentVer < 11) {
    try { await db.execAsync('ALTER TABLE flights ADD COLUMN city TEXT;'); } catch {}
  }

  if (currentVer < 12) {
    // Ensure kind column exists — was missing if flights table was created before v3 migration
    try { await db.execAsync("ALTER TABLE flights ADD COLUMN kind TEXT NOT NULL DEFAULT 'flight';"); } catch {}
  }

  if (currentVer < 13) {
    try {
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
    } catch {}
  }

  if (currentVer < 14) {
    // calories per rep for exercises
    try { await db.execAsync('ALTER TABLE exercises ADD COLUMN calories_per_rep REAL NOT NULL DEFAULT 0;'); } catch {}
  }

  if (currentVer < 15) {
    // many-to-many travelers for flights
    try {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS flight_travelers (
        flight_id TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
        traveler_id TEXT NOT NULL,
        PRIMARY KEY (flight_id, traveler_id)
      );`);
      // Migrate existing traveler_id data
      await db.execAsync(`INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id)
        SELECT id, traveler_id FROM flights WHERE traveler_id IS NOT NULL AND traveler_id != '';`);
    } catch {}
  }

  if (currentVer < 16) {
    // no-op (was destructive migration, removed)
  }

  if (currentVer < 17) {
    try { await db.execAsync('ALTER TABLE flights ADD COLUMN price REAL;'); } catch {}
    try { await db.execAsync("ALTER TABLE flights ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';"); } catch {}
  }

  if (currentVer < 18) {
    // Fix data corrupted by v16 migration (DROP+SELECT* with wrong column order)
    // Detect corruption: if title contains status values, data is shifted
    try {
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
        await db.execAsync(`CREATE TABLE IF NOT EXISTS flights_fix (
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
        await db.execAsync('DROP TABLE flights;');
        await db.execAsync('ALTER TABLE flights_fix RENAME TO flights;');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);');
      }
    } catch {}
  }

  if (currentVer < 19) {
    try {
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
    } catch {}
  }

  if (currentVer < 20) {
    try { await db.execAsync("ALTER TABLE documents ADD COLUMN notes TEXT NOT NULL DEFAULT '';"); } catch {}
  }

  if (currentVer < SCHEMA_VERSION) {
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ["schema_version", String(SCHEMA_VERSION)],
    );
  }

  _db = db;
  return db;
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
