import {
  BACKUP_ASSET_DIRECTORIES,
  BACKUP_DATABASE_FILENAME,
  createBackupManifest,
  isSafeAssetRelativePath,
  parseBackupManifest,
  safDisplayName,
} from '../backupManifest';

describe('backup manifest', () => {
  it('covers every user asset directory', () => {
    expect(BACKUP_ASSET_DIRECTORIES).toEqual(expect.arrayContaining([
      'task_images', 'flight_images', 'document_images', 'note_images', 'exercise_images',
      'attachments', 'doctor_images', 'car_doc_images',
    ]));
  });

  it('round-trips a valid manifest', () => {
    const hash = 'a'.repeat(64);
    const manifest = createBackupManifest(49, 123, hash, [
      { backupName: 'asset-000001.bin', relativePath: 'attachments/report.pdf', size: 42, sha256: hash },
    ], '2026-07-13T00:00:00.000Z');
    expect(parseBackupManifest(JSON.stringify(manifest), 49)).toEqual(manifest);
    expect(manifest.database.fileName).toBe(BACKUP_DATABASE_FILENAME);
  });

  it('rejects traversal and unknown roots', () => {
    expect(isSafeAssetRelativePath('attachments/report.pdf')).toBe(true);
    expect(isSafeAssetRelativePath('../uspevatel.db')).toBe(false);
    expect(isSafeAssetRelativePath('attachments/../uspevatel.db')).toBe(false);
    expect(isSafeAssetRelativePath('unknown/file')).toBe(false);
  });

  it('requires an exact supported schema and safe entries', () => {
    const hash = 'a'.repeat(64);
    const manifest = createBackupManifest(50, 123, hash, []);
    expect(() => parseBackupManifest(JSON.stringify(manifest), 49)).toThrow('версия схемы');

    const unsafe = createBackupManifest(49, 123, hash, [
      { backupName: 'asset-000001.bin', relativePath: 'attachments/../secret', size: 1, sha256: hash },
    ]);
    expect(() => parseBackupManifest(JSON.stringify(unsafe), 49)).toThrow('запись файла');

    const oversized = createBackupManifest(49, 2 * 1024 * 1024 * 1024, hash, []);
    expect(() => parseBackupManifest(JSON.stringify(oversized), 49)).toThrow('файл БД');
  });

  it('extracts an exact SAF display name', () => {
    expect(safDisplayName('content://tree/root/uspevatel.db')).toBe('uspevatel.db');
    expect(safDisplayName('content://tree/root/uspevatel.db-wal')).toBe('uspevatel.db-wal');
    expect(safDisplayName('content://tree/root/doctor%20photo.jpg')).toBe('doctor photo.jpg');
  });
});
