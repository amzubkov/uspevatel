import { create } from 'zustand';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';

export interface Document {
  id: string;
  name: string;
  notes: string;
  sortOrder: number;
  createdAt: string;
}

export interface DocumentImage {
  id: string;
  documentId: string;
  imagePath: string;
  sortOrder: number;
  createdAt: string;
}

interface DocumentState {
  documents: Document[];
  images: DocumentImage[];
  loaded: boolean;
  load: () => Promise<void>;
  addDocument: (name: string) => Promise<string>;
  updateDocument: (id: string, updates: Partial<Pick<Document, 'name' | 'notes'>>) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  addImage: (docId: string, uri: string) => Promise<void>;
  removeImage: (imageId: string) => Promise<void>;
}

function resolveImageUri(val: string): string {
  if (val.startsWith('file://') || val.startsWith('content://') || val.startsWith('data:')) return val;
  return getImageBaseDir() + '/' + val;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  documents: [],
  images: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const dRows = await db.getAllAsync('SELECT * FROM documents ORDER BY sort_order');
    const iRows = await db.getAllAsync('SELECT * FROM document_images ORDER BY sort_order');
    set({
      documents: dRows.map((r: any) => ({ id: r.id, name: r.name, notes: r.notes || '', sortOrder: r.sort_order, createdAt: r.created_at })),
      images: iRows.map((r: any) => ({ id: r.id, documentId: r.document_id, imagePath: resolveImageUri(r.image_path), sortOrder: r.sort_order, createdAt: r.created_at })),
      loaded: true,
    });
  },

  addDocument: async (name) => {
    const maxOrder = Math.max(0, ...get().documents.map((d) => d.sortOrder));
    const doc: Document = { id: Crypto.randomUUID(), name, notes: '', sortOrder: maxOrder + 1, createdAt: new Date().toISOString() };
    set((s) => ({ documents: [...s.documents, doc] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO documents (id, name, notes, sort_order, created_at) VALUES (?,?,?,?,?)', [doc.id, doc.name, '', doc.sortOrder, doc.createdAt]);
    return doc.id;
  },

  updateDocument: async (id, updates: Partial<Pick<Document, 'name' | 'notes'>>) => {
    set((s) => ({ documents: s.documents.map((d) => d.id === id ? { ...d, ...updates } : d) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
    if (updates.notes !== undefined) { sets.push('notes = ?'); vals.push(updates.notes); }
    if (sets.length) { vals.push(id); await db.runAsync(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, vals); }
  },

  removeDocument: async (id) => {
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      images: s.images.filter((i) => i.documentId !== id),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  },

  addImage: async (docId, imageUri) => {
    try {
      const dir = new Directory(getImageBaseDir(), 'document_images');
      if (!dir.exists) dir.create();
      const imgId = Crypto.randomUUID();
      const ext = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      const relPath = `document_images/${imgId}.${ext}`;
      const dest = new File(dir, `${imgId}.${ext}`);
      const src = new File(imageUri);
      if (src.exists) src.move(dest);
      const now = new Date().toISOString();
      const maxOrder = Math.max(0, ...get().images.filter((i) => i.documentId === docId).map((i) => i.sortOrder));
      const img: DocumentImage = { id: imgId, documentId: docId, imagePath: dest.uri, sortOrder: maxOrder + 1, createdAt: now };
      set((s) => ({ images: [...s.images, img] }));
      const db = await getDb();
      await db.runAsync('INSERT INTO document_images (id, document_id, image_path, sort_order, created_at) VALUES (?,?,?,?,?)', [img.id, docId, relPath, img.sortOrder, now]);
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    }
  },

  removeImage: async (imageId) => {
    set((s) => ({ images: s.images.filter((i) => i.id !== imageId) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM document_images WHERE id = ?', [imageId]);
  },
}));
