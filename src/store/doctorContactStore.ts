import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  address: string;
  clinic: string;
  url: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// Fields participating in sync merge (everything except id/createdAt/updatedAt).
export const DOCTOR_MERGE_FIELDS: (keyof Omit<Doctor, 'id' | 'createdAt' | 'updatedAt'>)[] = [
  'name', 'specialty', 'phone', 'address', 'clinic', 'url', 'notes',
];

interface DoctorContactState {
  doctors: Doctor[];
  loaded: boolean;
  load: () => Promise<void>;
  addDoctor: (d: Omit<Doctor, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateDoctor: (id: string, fields: Partial<Omit<Doctor, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  removeDoctor: (id: string) => Promise<void>;
  // Non-destructive merge from a remote source (sync).
  // Empty/missing remote fields never overwrite local. Local wins if local.updatedAt > remote.updatedAt.
  mergeRemoteDoctor: (remote: Doctor) => Promise<void>;
}

function rowToDoctor(r: any): Doctor {
  return {
    id: r.id,
    name: r.name,
    specialty: r.specialty || '',
    phone: r.phone || '',
    address: r.address || '',
    clinic: r.clinic || '',
    url: r.url || '',
    notes: r.notes || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
}

const DB_FIELDS: Record<keyof Omit<Doctor, 'id' | 'createdAt' | 'updatedAt'>, string> = {
  name: 'name', specialty: 'specialty', phone: 'phone', address: 'address',
  clinic: 'clinic', url: 'url', notes: 'notes',
};

function isMeaningful(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

// Field-wise non-destructive merge.
// - Always start from local.
// - Only consider remote fields that are non-empty.
// - If remote is newer (remote.updatedAt > local.updatedAt), remote wins on those fields.
// - If remote is older or equal: local wins, but remote may FILL fields that are empty locally.
// This guarantees: bad/empty remote payload never erases existing local data.
export function mergeDoctorFields(local: Doctor, remote: Doctor): Doctor {
  const merged: Doctor = { ...local };
  const remoteNewer = (remote.updatedAt || '') > (local.updatedAt || '');
  for (const f of DOCTOR_MERGE_FIELDS) {
    const lv = local[f];
    const rv = remote[f];
    if (!isMeaningful(rv)) continue; // empty remote -> never overwrite
    if (remoteNewer) {
      merged[f] = rv;
    } else if (!isMeaningful(lv)) {
      merged[f] = rv; // backfill local empties from older remote
    }
  }
  // updatedAt stays the latest of the two; createdAt = earliest.
  merged.updatedAt = (remote.updatedAt || '') > (local.updatedAt || '') ? remote.updatedAt : local.updatedAt;
  merged.createdAt = local.createdAt && (!remote.createdAt || local.createdAt < remote.createdAt)
    ? local.createdAt
    : (remote.createdAt || local.createdAt);
  return merged;
}

export const useDoctorContactStore = create<DoctorContactState>()((set, get) => ({
  doctors: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM doctors ORDER BY name');
    set({ doctors: rows.map(rowToDoctor), loaded: true });
  },

  addDoctor: async (d) => {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const doctor: Doctor = { ...d, id, createdAt: now, updatedAt: now };
    set((s) => ({ doctors: [...s.doctors, doctor].sort((a, b) => a.name.localeCompare(b.name)) }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO doctors (id, name, specialty, phone, address, clinic, url, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, d.name, d.specialty, d.phone, d.address, d.clinic, d.url, d.notes, now, now],
    );
    return id;
  },

  updateDoctor: async (id, fields) => {
    const now = new Date().toISOString();
    set((s) => ({
      doctors: s.doctors.map((d) => (d.id === id ? { ...d, ...fields, updatedAt: now } : d))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    for (const k of Object.keys(fields) as (keyof typeof DB_FIELDS)[]) {
      const col = DB_FIELDS[k];
      if (col) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    sets.push('updated_at = ?');
    vals.push(now);
    vals.push(id);
    await db.runAsync(`UPDATE doctors SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  removeDoctor: async (id) => {
    set((s) => ({ doctors: s.doctors.filter((d) => d.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM doctors WHERE id = ?', [id]);
  },

  mergeRemoteDoctor: async (remote) => {
    const db = await getDb();
    const local = get().doctors.find((d) => d.id === remote.id);
    if (!local) {
      // New from remote: insert as-is, but only if it carries something useful.
      if (!isMeaningful(remote.name)) return;
      const createdAt = remote.createdAt || new Date().toISOString();
      const updatedAt = remote.updatedAt || createdAt;
      const inserted: Doctor = {
        id: remote.id,
        name: remote.name,
        specialty: remote.specialty || '',
        phone: remote.phone || '',
        address: remote.address || '',
        clinic: remote.clinic || '',
        url: remote.url || '',
        notes: remote.notes || '',
        createdAt,
        updatedAt,
      };
      set((s) => ({ doctors: [...s.doctors, inserted].sort((a, b) => a.name.localeCompare(b.name)) }));
      await db.runAsync(
        'INSERT OR IGNORE INTO doctors (id, name, specialty, phone, address, clinic, url, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [inserted.id, inserted.name, inserted.specialty, inserted.phone, inserted.address, inserted.clinic, inserted.url, inserted.notes, inserted.createdAt, inserted.updatedAt],
      );
      return;
    }
    const merged = mergeDoctorFields(local, remote);
    // Skip DB write if nothing actually changed.
    const changed = DOCTOR_MERGE_FIELDS.some((f) => merged[f] !== local[f]) || merged.updatedAt !== local.updatedAt;
    if (!changed) return;
    set((s) => ({
      doctors: s.doctors.map((d) => (d.id === merged.id ? merged : d)).sort((a, b) => a.name.localeCompare(b.name)),
    }));
    await db.runAsync(
      'UPDATE doctors SET name=?, specialty=?, phone=?, address=?, clinic=?, url=?, notes=?, created_at=?, updated_at=? WHERE id=?',
      [merged.name, merged.specialty, merged.phone, merged.address, merged.clinic, merged.url, merged.notes, merged.createdAt, merged.updatedAt, merged.id],
    );
  },
}));
