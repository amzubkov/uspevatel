import { create } from 'zustand';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';
import { deleteStoredFile, safeFileExtension } from './attachmentStore';

export type VisitStatus = 'planned' | 'done';

export interface DoctorVisit {
  id: string;
  personId: string;
  name: string;
  date: string; // YYYY-MM-DD
  notes: string;
  status: VisitStatus;
  createdAt: string;
}

export interface DoctorVisitImage {
  id: string;
  visitId: string;
  imagePath: string; // resolved absolute URI
  sortOrder: number;
  createdAt: string;
}

interface DoctorState {
  visits: DoctorVisit[];
  images: DoctorVisitImage[];
  loaded: boolean;
  load: () => Promise<void>;
  addVisit: (v: Omit<DoctorVisit, 'id' | 'createdAt'>) => Promise<string>;
  updateVisit: (id: string, fields: Partial<Omit<DoctorVisit, 'id' | 'createdAt'>>) => Promise<void>;
  removeVisit: (id: string) => Promise<void>;
  addImage: (visitId: string, uri: string) => Promise<void>;
  removeImage: (imageId: string) => Promise<void>;
}

function resolveImageUri(val: string): string {
  if (val.startsWith('file://') || val.startsWith('content://') || val.startsWith('data:')) return val;
  return getImageBaseDir() + '/' + val;
}

function rowToVisit(r: any): DoctorVisit {
  return {
    id: r.id, personId: r.person_id || 'me',
    name: r.name, date: r.date, notes: r.notes || '',
    status: (r.status === 'planned' ? 'planned' : 'done') as VisitStatus,
    createdAt: r.created_at,
  };
}

function rowToImage(r: any): DoctorVisitImage {
  return {
    id: r.id, visitId: r.visit_id, imagePath: resolveImageUri(r.image_path),
    sortOrder: r.sort_order, createdAt: r.created_at,
  };
}

export const useDoctorStore = create<DoctorState>()((set, get) => ({
  visits: [],
  images: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const vRows = await db.getAllAsync('SELECT * FROM doctor_visits ORDER BY date DESC');
    const iRows = await db.getAllAsync('SELECT * FROM doctor_visit_images ORDER BY sort_order');
    set({ visits: vRows.map(rowToVisit), images: iRows.map(rowToImage), loaded: true });
  },

  addVisit: async (v) => {
    const visit: DoctorVisit = { ...v, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
    set((s) => ({ visits: [visit, ...s.visits] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO doctor_visits (id, person_id, name, date, notes, status, created_at) VALUES (?,?,?,?,?,?,?)',
      [visit.id, visit.personId, visit.name, visit.date, visit.notes, visit.status, visit.createdAt],
    );
    return visit.id;
  },

  updateVisit: async (id, fields) => {
    set((s) => ({ visits: s.visits.map((v) => v.id === id ? { ...v, ...fields } : v) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = { personId: 'person_id', name: 'name', date: 'date', notes: 'notes', status: 'status' };
    for (const [k, col] of Object.entries(map)) {
      if ((fields as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE doctor_visits SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removeVisit: async (id) => {
    const db = await getDb();
    let imagePaths: string[] = [];
    await db.withExclusiveTransactionAsync(async (tx) => {
      const rows = await tx.getAllAsync<{ image_path: string }>('SELECT image_path FROM doctor_visit_images WHERE visit_id = ?', [id]);
      imagePaths = rows.map((row) => row.image_path).filter(Boolean);
      await tx.runAsync('DELETE FROM doctor_visit_images WHERE visit_id = ?', [id]);
      await tx.runAsync('DELETE FROM doctor_visits WHERE id = ?', [id]);
    });
    set((s) => ({
      visits: s.visits.filter((v) => v.id !== id),
      images: s.images.filter((i) => i.visitId !== id),
    }));
    imagePaths.forEach(deleteStoredFile);
  },

  addImage: async (visitId, imageUri) => {
    try {
      const dir = new Directory(getImageBaseDir(), 'doctor_images');
      if (!dir.exists) dir.create();
      const imgId = Crypto.randomUUID();
      const ext = safeFileExtension(imageUri, 'jpg');
      const relPath = `doctor_images/${imgId}.${ext}`;
      const dest = new File(dir, `${imgId}.${ext}`);
      const src = new File(imageUri);
      if (src.exists) src.move(dest);
      const now = new Date().toISOString();
      const maxOrder = Math.max(0, ...get().images.filter((i) => i.visitId === visitId).map((i) => i.sortOrder));
      const img: DoctorVisitImage = {
        id: imgId, visitId, imagePath: dest.uri, sortOrder: maxOrder + 1, createdAt: now,
      };
      set((s) => ({ images: [...s.images, img] }));
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO doctor_visit_images (id, visit_id, image_path, sort_order, created_at) VALUES (?,?,?,?,?)',
        [img.id, visitId, relPath, img.sortOrder, now],
      );
    } catch (e: any) {
      Alert.alert('Ошибка картинки', String(e?.message || e));
    }
  },

  removeImage: async (imageId) => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ image_path: string | null }>('SELECT image_path FROM doctor_visit_images WHERE id = ?', [imageId]);
    await db.runAsync('DELETE FROM doctor_visit_images WHERE id = ?', [imageId]);
    set((s) => ({ images: s.images.filter((i) => i.id !== imageId) }));
    deleteStoredFile(row?.image_path);
  },
}));
