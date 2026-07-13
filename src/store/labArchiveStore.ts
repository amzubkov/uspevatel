import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';
import {
  deleteEntityAttachmentsInTransaction,
  deleteStoredFile,
  evictEntityAttachments,
} from './attachmentStore';

export type LabStatus = 'planned' | 'done';

export interface LabRecord {
  id: string;
  personId: string;
  name: string;
  date: string; // YYYY-MM-DD
  notes: string;
  status: LabStatus;
  createdAt: string;
}

interface LabArchiveState {
  records: LabRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  addRecord: (r: Omit<LabRecord, 'id' | 'createdAt'>) => Promise<string>;
  updateRecord: (id: string, fields: Partial<Omit<LabRecord, 'id' | 'createdAt'>>) => Promise<void>;
  removeRecord: (id: string) => Promise<void>;
}

function rowToRecord(r: any): LabRecord {
  return {
    id: r.id, personId: r.person_id || 'me',
    name: r.name, date: r.date,
    notes: r.notes || '',
    status: (r.status === 'planned' ? 'planned' : 'done') as LabStatus,
    createdAt: r.created_at,
  };
}

export const useLabArchiveStore = create<LabArchiveState>()((set, get) => ({
  records: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM lab_archive ORDER BY date DESC');
    set({ records: rows.map(rowToRecord), loaded: true });
  },

  addRecord: async (r) => {
    const rec: LabRecord = { ...r, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
    set((s) => ({ records: [rec, ...s.records] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO lab_archive (id, person_id, name, date, notes, status, created_at) VALUES (?,?,?,?,?,?,?)',
      [rec.id, rec.personId, rec.name, rec.date, rec.notes, rec.status, rec.createdAt],
    );
    return rec.id;
  },

  updateRecord: async (id, fields) => {
    set((s) => ({ records: s.records.map((r) => (r.id === id ? { ...r, ...fields } : r)) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = { personId: 'person_id', name: 'name', date: 'date', notes: 'notes', status: 'status' };
    for (const [k, col] of Object.entries(map)) {
      if ((fields as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE lab_archive SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removeRecord: async (id) => {
    const db = await getDb();
    let attachmentPaths: string[] = [];
    await db.withExclusiveTransactionAsync(async (tx) => {
      attachmentPaths = await deleteEntityAttachmentsInTransaction(tx, 'lab_archive', id);
      await tx.runAsync('DELETE FROM lab_archive WHERE id = ?', [id]);
    });
    set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
    evictEntityAttachments('lab_archive', id);
    attachmentPaths.forEach(deleteStoredFile);
  },
}));
