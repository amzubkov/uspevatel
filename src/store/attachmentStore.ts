import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb, getImageBaseDir } from '../db/database';
import { safeFileExtension } from '../utils/files';

export { safeFileExtension } from '../utils/files';

export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  name: string;
  filePath: string;  // relative path in app sandbox
  mimeType?: string;
  size?: number;
  createdAt: string;
}

interface AttachmentState {
  attachments: Attachment[];
  loaded: boolean;
  load: () => Promise<void>;
  addAttachment: (entityType: string, entityId: string, sourceUri: string, name: string, mimeType?: string, size?: number) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
  removeForEntity: (entityType: string, entityId: string) => Promise<void>;
  getForEntity: (entityType: string, entityId: string) => Attachment[];
}

function rowToAttachment(r: any): Attachment {
  return {
    id: r.id, entityType: r.entity_type, entityId: r.entity_id,
    name: r.name, filePath: r.file_path, mimeType: r.mime_type || undefined,
    size: r.size || undefined, createdAt: r.created_at,
  };
}

export function resolveAttachmentUri(a: Attachment): string {
  if (a.filePath.startsWith('file://') || a.filePath.startsWith('content:') || a.filePath.startsWith('data:')) {
    return a.filePath;
  }
  return getImageBaseDir() + '/' + a.filePath;
}

export function deleteStoredFile(filePath?: string | null): void {
  if (!filePath || filePath.startsWith('data:') || filePath.startsWith('content:')) return;
  try {
    const baseUri = `${getImageBaseDir().replace(/\/+$/, '')}/`;
    const file = filePath.startsWith('file://')
      ? new File(filePath)
      : new File(getImageBaseDir(), filePath);
    // Paths are persisted in backups and must not be allowed to escape the
    // app-managed document directory when an entity is deleted.
    if (!file.uri.startsWith(baseUri)) return;
    if (file.exists) file.delete();
  } catch {}
}

/** Delete attachment relations inside an entity's surrounding transaction. */
export async function deleteEntityAttachmentsInTransaction(
  db: SQLiteDatabase,
  entityType: string,
  entityId: string,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ file_path: string }>(
    'SELECT file_path FROM attachments WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId],
  );
  await db.runAsync('DELETE FROM attachments WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
  return rows.map((row) => row.file_path).filter(Boolean);
}

export function evictEntityAttachments(entityType: string, entityId: string): void {
  useAttachmentStore.setState((state) => ({
    attachments: state.attachments.filter(
      (attachment) => attachment.entityType !== entityType || attachment.entityId !== entityId,
    ),
  }));
}

export const useAttachmentStore = create<AttachmentState>()((set, get) => ({
  attachments: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM attachments ORDER BY created_at DESC');
    set({ attachments: rows.map(rowToAttachment), loaded: true });
  },

  addAttachment: async (entityType, entityId, sourceUri, name, mimeType, size) => {
    const id = Crypto.randomUUID();
    const ext = safeFileExtension(name);
    const relPath = `attachments/${id}.${ext}`;
    const dir = new Directory(getImageBaseDir(), 'attachments');
    if (!dir.exists) dir.create();
    const dest = new File(dir, `${id}.${ext}`);
    const src = new File(sourceUri);
    if (!src.exists) throw new Error('Файл вложения не найден');
    src.move(dest);
    if (!dest.exists) throw new Error('Не удалось сохранить вложение');

    const attachment: Attachment = {
      id, entityType, entityId, name, filePath: relPath,
      mimeType, size, createdAt: new Date().toISOString(),
    };
    const db = await getDb();
    try {
      await db.runAsync(
        'INSERT INTO attachments (id, entity_type, entity_id, name, file_path, mime_type, size, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, entityType, entityId, name, relPath, mimeType || null, size || null, attachment.createdAt],
      );
      set((s) => ({ attachments: [attachment, ...s.attachments] }));
    } catch (error) {
      deleteStoredFile(relPath);
      throw error;
    }
  },

  removeAttachment: async (id) => {
    const db = await getDb();
    const cached = get().attachments.find((x) => x.id === id);
    const row = cached || await db.getFirstAsync<any>('SELECT * FROM attachments WHERE id = ?', [id]).then((value) => value ? rowToAttachment(value) : undefined);
    await db.runAsync('DELETE FROM attachments WHERE id = ?', [id]);
    set((s) => ({ attachments: s.attachments.filter((x) => x.id !== id) }));
    deleteStoredFile(row?.filePath);
  },

  removeForEntity: async (entityType, entityId) => {
    const db = await getDb();
    let filePaths: string[] = [];
    await db.withExclusiveTransactionAsync(async (tx) => {
      filePaths = await deleteEntityAttachmentsInTransaction(tx, entityType, entityId);
    });
    evictEntityAttachments(entityType, entityId);
    filePaths.forEach(deleteStoredFile);
  },

  getForEntity: (entityType, entityId) => {
    return get().attachments.filter((a) => a.entityType === entityType && a.entityId === entityId);
  },
}));
