import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { File, Paths, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';

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
  return getImageBaseDir() + '/' + a.filePath;
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
    const ext = name.split('.').pop() || 'bin';
    const relPath = `attachments/${id}.${ext}`;
    const dir = new Directory(getImageBaseDir(), 'attachments');
    if (!dir.exists) dir.create();
    const dest = new File(dir, `${id}.${ext}`);
    const src = new File(sourceUri);
    if (src.exists) src.move(dest);

    const attachment: Attachment = {
      id, entityType, entityId, name, filePath: relPath,
      mimeType, size, createdAt: new Date().toISOString(),
    };
    set((s) => ({ attachments: [attachment, ...s.attachments] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO attachments (id, entity_type, entity_id, name, file_path, mime_type, size, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, entityType, entityId, name, relPath, mimeType || null, size || null, attachment.createdAt],
    );
  },

  removeAttachment: async (id) => {
    const a = get().attachments.find((x) => x.id === id);
    if (a) {
      try { const f = new File(getImageBaseDir(), a.filePath); if (f.exists) f.delete(); } catch {}
    }
    set((s) => ({ attachments: s.attachments.filter((x) => x.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM attachments WHERE id = ?', [id]);
  },

  getForEntity: (entityType, entityId) => {
    return get().attachments.filter((a) => a.entityType === entityType && a.entityId === entityId);
  },
}));
