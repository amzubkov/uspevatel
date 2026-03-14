import * as SQLite from "expo-sqlite";
import { seedExercises } from "./seed";
import { migrateFromAsyncStorage } from "./migrate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import { Platform } from "react-native";

let _db: SQLite.SQLiteDatabase | null = null;
let _syncFolder: string | null = null;

const SYNC_FOLDER_KEY = "uspevatel_sync_folder";
const FOLDER_SYNC_STATE_KEY = "uspevatel_folder_sync_state";
const SYNC_MANIFEST_NAME = "uspevatel-sync.json";
const SYNC_DB_NAME = "uspevatel.db";
const LOCAL_DB_DIR = joinUri(Paths.document.uri, "SQLite");
const LOCAL_DB_URI = joinUri(LOCAL_DB_DIR, SYNC_DB_NAME);
const IMAGE_DIRS = ["task_images", "flight_images", "exercise_images"] as const;

type ImageDirName = (typeof IMAGE_DIRS)[number];

interface FolderSyncState {
  deviceId: string;
  lastSyncedRevision: number | null;
  lastSyncedAt: string | null;
  lastLocalChangeAt: string | null;
}

interface SyncManifest {
  version: 1;
  revision: number;
  updatedAt: string;
  deviceId: string;
}

export interface FolderSyncPlan {
  action: "export" | "import" | "noop" | "conflict" | "missing-folder";
  message: string;
}

export interface FolderSyncResult {
  action: "export" | "import" | "noop" | "conflict" | "error";
  message: string;
}

const DEFAULT_FOLDER_SYNC_STATE: FolderSyncState = {
  deviceId: "",
  lastSyncedRevision: null,
  lastSyncedAt: null,
  lastLocalChangeAt: null,
};

function joinUri(base: string, child: string): string {
  return `${base.replace(/\/+$/, "")}/${child.replace(/^\/+/, "")}`;
}

function isSafUri(value: string | null | undefined): value is string {
  return !!value && value.startsWith("content://");
}

function usesFolderAsLiveStorage(): boolean {
  return !!_syncFolder && Platform.OS !== "android" && !isSafUri(_syncFolder);
}

function toFileUri(pathOrUri: string): string {
  if (pathOrUri.startsWith("file://")) return pathOrUri;
  return `file://${pathOrUri.replace(/^\/+/, "/")}`;
}

function splitRelativePath(relativePath: string): string[] {
  return relativePath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function basenameFromUri(uri: string): string {
  const lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
  const decoded = decodeURIComponent(lastSegment);
  const slashIndex = decoded.lastIndexOf("/");
  return slashIndex >= 0 ? decoded.slice(slashIndex + 1) : decoded;
}

function androidUriToDisplayPath(value: string): string | null {
  try {
    const match =
      value.match(/\/tree\/([^/]+)/) || value.match(/\/document\/([^/]+)/);
    if (!match?.[1]) return null;
    const decoded = decodeURIComponent(match[1]);
    const colonIndex = decoded.indexOf(":");
    if (colonIndex < 0) return null;
    const volume = decoded.slice(0, colonIndex);
    const relative = decoded.slice(colonIndex + 1).replace(/^\/+/, "");
    const prefix =
      volume === "primary" ? "/storage/emulated/0" : `/storage/${volume}`;
    return relative ? `${prefix}/${relative}` : prefix;
  } catch {
    return null;
  }
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "json":
      return "application/json";
    case "db":
      return "application/octet-stream";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function getCreateFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

/** Get the configured sync folder target (path or SAF URI). */
export function getSyncFolder(): string | null {
  return _syncFolder;
}

/** Human-friendly label for the configured sync folder. */
export function describeSyncFolder(
  folder: string | null = _syncFolder,
): string | null {
  if (!folder) return null;
  if (isSafUri(folder)) return androidUriToDisplayPath(folder) || folder;
  return String(folder).replace(/^file:\/\//, "");
}

/** Get the base directory for images used by the live app DB. */
export function getImageBaseDir(): string {
  return usesFolderAsLiveStorage()
    ? (_syncFolder as string)
    : Paths.document.uri;
}

/** Read sync folder from AsyncStorage (call once on startup). */
export async function loadSyncFolder(): Promise<string | null> {
  _syncFolder = await AsyncStorage.getItem(SYNC_FOLDER_KEY);
  return _syncFolder;
}

/** Save sync folder target. */
export async function setSyncFolder(folder: string | null): Promise<void> {
  _syncFolder = folder;
  if (folder) await AsyncStorage.setItem(SYNC_FOLDER_KEY, folder);
  else await AsyncStorage.removeItem(SYNC_FOLDER_KEY);
}

/** Close current DB connection. */
export async function closeDb(): Promise<void> {
  if (_db) {
    try {
      await _db.closeAsync();
    } catch {}
    _db = null;
  }
}

async function loadFolderSyncState(): Promise<FolderSyncState> {
  const raw = await AsyncStorage.getItem(FOLDER_SYNC_STATE_KEY);
  let state: FolderSyncState = DEFAULT_FOLDER_SYNC_STATE;
  if (raw) {
    try {
      state = { ...DEFAULT_FOLDER_SYNC_STATE, ...JSON.parse(raw) };
    } catch {}
  }
  if (!state.deviceId) {
    state.deviceId = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await saveFolderSyncState(state);
  }
  return state;
}

async function saveFolderSyncState(state: FolderSyncState): Promise<void> {
  await AsyncStorage.setItem(FOLDER_SYNC_STATE_KEY, JSON.stringify(state));
}

function hasUnsyncedLocalChanges(state: FolderSyncState): boolean {
  if (!state.lastLocalChangeAt) return false;
  if (!state.lastSyncedAt) return true;
  return state.lastLocalChangeAt > state.lastSyncedAt;
}

async function noteLocalChange(): Promise<void> {
  if (Platform.OS !== "android") return;
  const state = await loadFolderSyncState();
  state.lastLocalChangeAt = new Date().toISOString();
  await saveFolderSyncState(state);
}

function shouldTrackSqlChange(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  return (
    normalized.startsWith("INSERT") ||
    normalized.startsWith("UPDATE") ||
    normalized.startsWith("DELETE") ||
    normalized.startsWith("REPLACE")
  );
}

function patchDbForSyncTracking(
  db: SQLite.SQLiteDatabase,
): SQLite.SQLiteDatabase {
  if ((db as any).__uspevatelSyncPatched) return db;

  const originalRunAsync = db.runAsync.bind(db);
  (db as any).runAsync = async (...args: any[]) => {
    const result = await (originalRunAsync as any)(...args);
    const sql = typeof args[0] === "string" ? args[0] : "";
    if (shouldTrackSqlChange(sql)) {
      await noteLocalChange();
    }
    return result;
  };

  (db as any).__uspevatelSyncPatched = true;
  return db;
}

async function ensureLocalDir(dirUri: string): Promise<void> {
  await LegacyFS.makeDirectoryAsync(dirUri, { intermediates: true });
}

async function deleteLocalDir(dirUri: string): Promise<void> {
  await LegacyFS.deleteAsync(dirUri, { idempotent: true });
}

async function readLocalFileAsBase64(fileUri: string): Promise<string | null> {
  const info = await LegacyFS.getInfoAsync(fileUri);
  if (!info.exists) return null;
  return LegacyFS.readAsStringAsync(fileUri, {
    encoding: LegacyFS.EncodingType.Base64,
  });
}

async function writeLocalBase64File(
  fileUri: string,
  contents: string,
): Promise<void> {
  const lastSlash = fileUri.lastIndexOf("/");
  if (lastSlash > "file://".length) {
    await ensureLocalDir(fileUri.slice(0, lastSlash));
  }
  await LegacyFS.writeAsStringAsync(fileUri, contents, {
    encoding: LegacyFS.EncodingType.Base64,
  });
}

async function writeLocalTextFile(
  fileUri: string,
  contents: string,
): Promise<void> {
  const lastSlash = fileUri.lastIndexOf("/");
  if (lastSlash > "file://".length) {
    await ensureLocalDir(fileUri.slice(0, lastSlash));
  }
  await LegacyFS.writeAsStringAsync(fileUri, contents);
}

async function findSafChildUri(
  parentUri: string,
  name: string,
): Promise<string | null> {
  const children =
    await LegacyFS.StorageAccessFramework.readDirectoryAsync(parentUri);
  return (
    children.find((childUri) => basenameFromUri(childUri) === name) || null
  );
}

async function getSafDirectoryUri(
  rootUri: string,
  relativeDir: string,
  createIfMissing: boolean,
): Promise<string | null> {
  const parts = splitRelativePath(relativeDir);
  let current = rootUri;
  for (const part of parts) {
    const existing = await findSafChildUri(current, part);
    if (existing) {
      current = existing;
      continue;
    }
    if (!createIfMissing) return null;
    current = await LegacyFS.StorageAccessFramework.makeDirectoryAsync(
      current,
      part,
    );
  }
  return current;
}

async function getSafFileUri(
  rootUri: string,
  relativePath: string,
): Promise<string | null> {
  const parts = splitRelativePath(relativePath);
  const fileName = parts.pop();
  if (!fileName) return null;
  const parentUri =
    parts.length > 0
      ? await getSafDirectoryUri(rootUri, parts.join("/"), false)
      : rootUri;
  if (!parentUri) return null;
  return findSafChildUri(parentUri, fileName);
}

async function createOrReplaceSafFile(
  rootUri: string,
  relativePath: string,
): Promise<string> {
  const parts = splitRelativePath(relativePath);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error(`Неверный путь файла: ${relativePath}`);
  }
  const parentUri =
    parts.length > 0
      ? await getSafDirectoryUri(rootUri, parts.join("/"), true)
      : rootUri;
  if (!parentUri) {
    throw new Error(`Не удалось создать каталог для ${relativePath}`);
  }
  const existingFile = await findSafChildUri(parentUri, fileName);
  if (existingFile) {
    await LegacyFS.deleteAsync(existingFile, { idempotent: true });
  }
  return LegacyFS.StorageAccessFramework.createFileAsync(
    parentUri,
    getCreateFileName(fileName),
    getMimeType(fileName),
  );
}

async function deleteExternalPath(
  rootFolder: string,
  relativePath: string,
): Promise<void> {
  if (isSafUri(rootFolder)) {
    const safFile = await getSafFileUri(rootFolder, relativePath);
    if (safFile) {
      await LegacyFS.deleteAsync(safFile, { idempotent: true });
      return;
    }
    const safDir = await getSafDirectoryUri(rootFolder, relativePath, false);
    if (safDir) {
      await LegacyFS.deleteAsync(safDir, { idempotent: true });
    }
    return;
  }
  const fileUri = joinUri(toFileUri(rootFolder), relativePath);
  await LegacyFS.deleteAsync(fileUri, { idempotent: true });
}

async function readExternalText(
  rootFolder: string,
  relativePath: string,
): Promise<string | null> {
  if (isSafUri(rootFolder)) {
    const fileUri = await getSafFileUri(rootFolder, relativePath);
    if (!fileUri) return null;
    return LegacyFS.readAsStringAsync(fileUri);
  }
  const fileUri = joinUri(toFileUri(rootFolder), relativePath);
  const info = await LegacyFS.getInfoAsync(fileUri);
  if (!info.exists) return null;
  return LegacyFS.readAsStringAsync(fileUri);
}

async function writeExternalText(
  rootFolder: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  if (isSafUri(rootFolder)) {
    const fileUri = await createOrReplaceSafFile(rootFolder, relativePath);
    await LegacyFS.writeAsStringAsync(fileUri, contents);
    return;
  }
  const fileUri = joinUri(toFileUri(rootFolder), relativePath);
  const parentPath = fileUri.slice(0, fileUri.lastIndexOf("/"));
  await ensureLocalDir(parentPath);
  await writeLocalTextFile(fileUri, contents);
}

async function readExternalBase64(
  rootFolder: string,
  relativePath: string,
): Promise<string | null> {
  if (isSafUri(rootFolder)) {
    const fileUri = await getSafFileUri(rootFolder, relativePath);
    if (!fileUri) return null;
    return LegacyFS.readAsStringAsync(fileUri, {
      encoding: LegacyFS.EncodingType.Base64,
    });
  }
  const fileUri = joinUri(toFileUri(rootFolder), relativePath);
  const info = await LegacyFS.getInfoAsync(fileUri);
  if (!info.exists) return null;
  return LegacyFS.readAsStringAsync(fileUri, {
    encoding: LegacyFS.EncodingType.Base64,
  });
}

async function writeExternalBase64(
  rootFolder: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  if (isSafUri(rootFolder)) {
    const fileUri = await createOrReplaceSafFile(rootFolder, relativePath);
    await LegacyFS.writeAsStringAsync(fileUri, contents, {
      encoding: LegacyFS.EncodingType.Base64,
    });
    return;
  }
  const fileUri = joinUri(toFileUri(rootFolder), relativePath);
  const parentPath = fileUri.slice(0, fileUri.lastIndexOf("/"));
  await ensureLocalDir(parentPath);
  await LegacyFS.writeAsStringAsync(fileUri, contents, {
    encoding: LegacyFS.EncodingType.Base64,
  });
}

async function listExternalFiles(
  rootFolder: string,
  relativeDir: string,
): Promise<string[]> {
  if (isSafUri(rootFolder)) {
    const dirUri = await getSafDirectoryUri(rootFolder, relativeDir, false);
    if (!dirUri) return [];
    const children =
      await LegacyFS.StorageAccessFramework.readDirectoryAsync(dirUri);
    return children.map((childUri) => basenameFromUri(childUri));
  }
  const dirUri = joinUri(toFileUri(rootFolder), relativeDir);
  const info = await LegacyFS.getInfoAsync(dirUri);
  if (!info.exists) return [];
  return LegacyFS.readDirectoryAsync(dirUri);
}

async function exportLocalDir(
  rootFolder: string,
  dirName: ImageDirName,
): Promise<void> {
  const localDirUri = joinUri(Paths.document.uri, dirName);
  const info = await LegacyFS.getInfoAsync(localDirUri);
  await deleteExternalPath(rootFolder, dirName);
  if (!info.exists) return;
  const files = await LegacyFS.readDirectoryAsync(localDirUri);
  for (const fileName of files) {
    const localFileUri = joinUri(localDirUri, fileName);
    const base64 = await readLocalFileAsBase64(localFileUri);
    if (base64) {
      await writeExternalBase64(rootFolder, `${dirName}/${fileName}`, base64);
    }
  }
}

async function importExternalDir(
  rootFolder: string,
  dirName: ImageDirName,
): Promise<void> {
  const localDirUri = joinUri(Paths.document.uri, dirName);
  await deleteLocalDir(localDirUri);
  const files = await listExternalFiles(rootFolder, dirName);
  if (files.length === 0) return;
  await ensureLocalDir(localDirUri);
  for (const fileName of files) {
    const base64 = await readExternalBase64(
      rootFolder,
      `${dirName}/${fileName}`,
    );
    if (base64) {
      await writeLocalBase64File(joinUri(localDirUri, fileName), base64);
    }
  }
}

async function readSyncManifest(
  rootFolder: string,
): Promise<SyncManifest | null> {
  const raw = await readExternalText(rootFolder, SYNC_MANIFEST_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SyncManifest;
    if (
      parsed &&
      typeof parsed.revision === "number" &&
      typeof parsed.updatedAt === "string"
    ) {
      return parsed;
    }
  } catch {}
  return null;
}

async function writeSyncManifest(
  rootFolder: string,
  manifest: SyncManifest,
): Promise<void> {
  await writeExternalText(
    rootFolder,
    SYNC_MANIFEST_NAME,
    JSON.stringify(manifest, null, 2),
  );
}

async function checkpointLocalDb(): Promise<void> {
  const db = _db || (await getDb());
  try {
    await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {}
}

async function exportSnapshotToFolder(
  rootFolder: string,
): Promise<FolderSyncResult> {
  const state = await loadFolderSyncState();
  const remoteManifest = await readSyncManifest(rootFolder);
  const revision =
    Math.max(remoteManifest?.revision ?? 0, state.lastSyncedRevision ?? 0) + 1;
  const now = new Date().toISOString();

  await checkpointLocalDb();
  await closeDb();

  const dbBase64 = await readLocalFileAsBase64(LOCAL_DB_URI);
  if (!dbBase64) {
    await getDb();
    return {
      action: "error",
      message: "Локальная база не найдена для выгрузки",
    };
  }

  await writeExternalBase64(rootFolder, SYNC_DB_NAME, dbBase64);
  for (const dirName of IMAGE_DIRS) {
    await exportLocalDir(rootFolder, dirName);
  }
  await writeSyncManifest(rootFolder, {
    version: 1,
    revision,
    updatedAt: now,
    deviceId: state.deviceId,
  });

  state.lastSyncedRevision = revision;
  state.lastSyncedAt = now;
  state.lastLocalChangeAt = now;
  await saveFolderSyncState(state);
  await getDb();

  return {
    action: "export",
    message: `Выгружено в папку: база и ${IMAGE_DIRS.length} каталога изображений`,
  };
}

async function importSnapshotFromFolder(
  rootFolder: string,
): Promise<FolderSyncResult> {
  const remoteManifest = await readSyncManifest(rootFolder);
  if (!remoteManifest) {
    return {
      action: "error",
      message: "В выбранной папке нет manifest-файла синхронизации",
    };
  }

  const dbBase64 =
    (await readExternalBase64(rootFolder, SYNC_DB_NAME)) ||
    (await readExternalBase64(rootFolder, `SQLite/${SYNC_DB_NAME}`));
  if (!dbBase64) {
    return {
      action: "error",
      message: "В выбранной папке не найден файл uspevatel.db",
    };
  }

  await closeDb();
  await writeLocalBase64File(LOCAL_DB_URI, dbBase64);
  for (const dirName of IMAGE_DIRS) {
    await importExternalDir(rootFolder, dirName);
  }

  const state = await loadFolderSyncState();
  state.lastSyncedRevision = remoteManifest.revision;
  state.lastSyncedAt = remoteManifest.updatedAt;
  state.lastLocalChangeAt = remoteManifest.updatedAt;
  await saveFolderSyncState(state);
  await getDb();

  return {
    action: "import",
    message: `Загружено из папки: база и ${IMAGE_DIRS.length} каталога изображений`,
  };
}

export async function analyzeFolderSync(
  folder?: string | null,
): Promise<FolderSyncPlan> {
  const targetFolder = folder ?? _syncFolder;
  if (!targetFolder) {
    return {
      action: "missing-folder",
      message: "Сначала выберите папку синхронизации",
    };
  }

  const state = await loadFolderSyncState();
  const remoteManifest = await readSyncManifest(targetFolder);

  if (!remoteManifest) {
    return {
      action: "export",
      message:
        "Во внешней папке пока нет данных. Будет выполнена первая выгрузка.",
    };
  }

  const localDirty = hasUnsyncedLocalChanges(state);
  const lastSyncedRevision = state.lastSyncedRevision ?? 0;

  if (remoteManifest.revision > lastSyncedRevision) {
    if (localDirty) {
      return {
        action: "conflict",
        message:
          "Изменились и локальные данные, и данные в папке. Нужно выбрать направление вручную.",
      };
    }
    return {
      action: "import",
      message: "В папке есть более новая версия. Будет выполнена загрузка.",
    };
  }

  if (localDirty || remoteManifest.revision < lastSyncedRevision) {
    return {
      action: "export",
      message: "Локальные данные новее. Будет выполнена выгрузка.",
    };
  }

  return { action: "noop", message: "Изменений для синхронизации нет" };
}

export async function syncWithFolder(
  folder?: string | null,
  forcedAction?: "import" | "export",
): Promise<FolderSyncResult> {
  const targetFolder = folder ?? _syncFolder;
  if (!targetFolder) {
    return { action: "error", message: "Сначала выберите папку синхронизации" };
  }

  const plan = forcedAction
    ? { action: forcedAction, message: "" as string }
    : await analyzeFolderSync(targetFolder);
  if (plan.action === "noop") {
    return { action: "noop", message: plan.message };
  }
  if (plan.action === "conflict") {
    return { action: "conflict", message: plan.message };
  }
  if (plan.action === "missing-folder") {
    return { action: "error", message: plan.message };
  }

  if (plan.action === "import") {
    return importSnapshotFromFolder(targetFolder);
  }
  return exportSnapshotToFolder(targetFolder);
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

  const db = await SQLite.openDatabaseAsync(
    SYNC_DB_NAME,
    {},
    usesFolderAsLiveStorage() ? (_syncFolder as string) : undefined,
  );

  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync(SCHEMA);

  const ver = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    ["schema_version"],
  );
  const currentVer = ver ? parseInt(ver.value, 10) : 0;

  if (currentVer === 0) {
    await migrateFromAsyncStorage(db);
    await seedExercises(db);
  }

  if (currentVer < 2) {
    try {
      await db.execAsync("ALTER TABLE exercises ADD COLUMN image_data BLOB;");
    } catch {}
    try {
      await db.execAsync("ALTER TABLE tasks ADD COLUMN image_data BLOB;");
    } catch {}
    const { backfillExerciseImages } = require("./seed");
    await backfillExerciseImages(db);
  }

  if (currentVer < 3) {
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
      await db.execAsync(
        "CREATE INDEX IF NOT EXISTS idx_flights_depart ON flights(depart_date);",
      );
    } catch {}
  }

  if (currentVer < SCHEMA_VERSION) {
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ["schema_version", String(SCHEMA_VERSION)],
    );
  }

  _db = patchDbForSyncTracking(db);
  return _db;
}
