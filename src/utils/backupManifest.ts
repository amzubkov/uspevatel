export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_MANIFEST_FILENAME = 'uspevatel-backup.json';
export const BACKUP_DATABASE_FILENAME = 'uspevatel.db';
const MAX_DATABASE_BYTES = 1024 * 1024 * 1024;
const MAX_ASSET_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_ASSET_COUNT = 50_000;

/** Every directory where the app currently stores user-owned files. */
export const BACKUP_ASSET_DIRECTORIES = [
  'task_images',
  'flight_images',
  'document_images',
  'note_images',
  'exercise_images',
  'attachments',
  'doctor_images',
  'car_doc_images',
] as const;

export interface BackupAssetEntry {
  backupName: string;
  relativePath: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  format: 'uspevatel-backup';
  formatVersion: number;
  createdAt: string;
  schemaVersion: number;
  database: {
    fileName: typeof BACKUP_DATABASE_FILENAME;
    size: number;
    sha256: string;
  };
  assets: BackupAssetEntry[];
}

export function createBackupManifest(
  schemaVersion: number,
  databaseSize: number,
  databaseSha256: string,
  assets: BackupAssetEntry[],
  createdAt = new Date().toISOString(),
): BackupManifest {
  return {
    format: 'uspevatel-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    schemaVersion,
    database: { fileName: BACKUP_DATABASE_FILENAME, size: databaseSize, sha256: databaseSha256 },
    assets,
  };
}

export function safDisplayName(uri: string): string {
  let decoded = uri;
  try { decoded = decodeURIComponent(uri); } catch {}
  return decoded.slice(decoded.lastIndexOf('/') + 1);
}

export function isSafeAssetRelativePath(path: string): boolean {
  if (!path || path.length > 1024 || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  const parts = path.split('/');
  if (parts.length > 32 || parts.some((part) => !part || part === '.' || part === '..' || part.length > 255)) return false;
  return (BACKUP_ASSET_DIRECTORIES as readonly string[]).includes(parts[0]);
}

export function parseBackupManifest(raw: string, maxSchemaVersion: number): BackupManifest {
  let value: any;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Manifest бэкапа содержит некорректный JSON');
  }
  if (value?.format !== 'uspevatel-backup' || value?.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error('Неподдерживаемый формат бэкапа');
  }
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1 || value.schemaVersion > maxSchemaVersion) {
    throw new Error(`Некорректная версия схемы в manifest: ${String(value.schemaVersion)}`);
  }
  if (
    value.database?.fileName !== BACKUP_DATABASE_FILENAME ||
    !Number.isSafeInteger(value.database?.size) ||
    value.database.size <= 0 || value.database.size > MAX_DATABASE_BYTES ||
    typeof value.database?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.database.sha256)
  ) {
    throw new Error('Manifest не содержит корректный файл БД');
  }
  if (!Array.isArray(value.assets)) throw new Error('Manifest не содержит список файлов');
  if (value.assets.length > MAX_ASSET_COUNT) throw new Error('Manifest содержит слишком много файлов');
  const backupNames = new Set<string>();
  const relativePaths = new Set<string>();
  let totalAssetBytes = 0;
  for (const asset of value.assets) {
    if (
      !asset || typeof asset.backupName !== 'string' || !/^asset-\d{6}\.bin$/.test(asset.backupName) ||
      typeof asset.relativePath !== 'string' || !isSafeAssetRelativePath(asset.relativePath) ||
      !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > MAX_ASSET_BYTES ||
      typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)
    ) {
      throw new Error('Manifest содержит некорректную запись файла');
    }
    if (backupNames.has(asset.backupName) || relativePaths.has(asset.relativePath)) {
      throw new Error('Manifest содержит повторяющиеся файлы');
    }
    backupNames.add(asset.backupName);
    relativePaths.add(asset.relativePath);
    totalAssetBytes += asset.size;
    if (!Number.isSafeInteger(totalAssetBytes) || totalAssetBytes > MAX_TOTAL_ASSET_BYTES) {
      throw new Error('Manifest содержит слишком большой объём файлов');
    }
  }
  return value as BackupManifest;
}
