import { create } from 'zustand';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';

export interface Note {
  id: string;
  text: string;
  imagePath?: string; // resolved absolute URI
  tags: string[];
  createdAt: string;
}

interface NoteState {
  notes: Note[];
  allTags: string[];
  loaded: boolean;
  load: () => Promise<void>;
  addNote: (text: string, tags: string[], imageUri?: string) => Promise<void>;
  updateNote: (id: string, text: string, tags: string[]) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  addImage: (id: string, uri: string) => Promise<void>;
  removeImage: (id: string) => Promise<void>;
}

function resolveImageUri(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') {
    if (val.startsWith('file://') || val.startsWith('content://') || val.startsWith('data:')) return val;
    return getImageBaseDir() + '/' + val;
  }
  return undefined;
}

function collectTags(notes: Note[]): string[] {
  const set = new Set<string>();
  for (const n of notes) for (const t of n.tags) set.add(t);
  return Array.from(set).sort();
}

export const useNoteStore = create<NoteState>()((set, get) => ({
  notes: [],
  allTags: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM notes ORDER BY created_at DESC') as any[];
    const tagRows = await db.getAllAsync('SELECT * FROM note_tags') as any[];
    const tagMap = new Map<string, string[]>();
    for (const r of tagRows) {
      const arr = tagMap.get(r.note_id) || [];
      arr.push(r.tag);
      tagMap.set(r.note_id, arr);
    }
    const notes: Note[] = rows.map((r) => ({
      id: r.id,
      text: r.text,
      imagePath: resolveImageUri(r.image_path),
      tags: tagMap.get(r.id) || [],
      createdAt: r.created_at,
    }));
    set({ notes, allTags: collectTags(notes), loaded: true });
  },

  addNote: async (text, tags, imageUri) => {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    let relPath: string | null = null;
    let absUri: string | undefined;

    if (imageUri) {
      try {
        const dir = new Directory(getImageBaseDir(), 'note_images');
        if (!dir.exists) dir.create();
        const ext = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
        relPath = `note_images/${id}.${ext}`;
        const dest = new File(dir, `${id}.${ext}`);
        const src = new File(imageUri);
        if (src.exists) src.move(dest);
        absUri = dest.uri;
      } catch (e: any) {
        Alert.alert('Ошибка картинки', String(e?.message || e));
      }
    }

    const note: Note = { id, text, imagePath: absUri, tags, createdAt: now };
    set((s) => {
      const notes = [note, ...s.notes];
      return { notes, allTags: collectTags(notes) };
    });

    const db = await getDb();
    await db.runAsync('INSERT INTO notes (id, text, image_path, created_at) VALUES (?,?,?,?)', [id, text, relPath, now]);
    for (const tag of tags) {
      await db.runAsync('INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?,?)', [id, tag]);
    }
  },

  updateNote: async (id, text, tags) => {
    set((s) => {
      const notes = s.notes.map((n) => n.id === id ? { ...n, text, tags } : n);
      return { notes, allTags: collectTags(notes) };
    });
    const db = await getDb();
    await db.runAsync('UPDATE notes SET text = ? WHERE id = ?', [text, id]);
    await db.runAsync('DELETE FROM note_tags WHERE note_id = ?', [id]);
    for (const tag of tags) {
      await db.runAsync('INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?,?)', [id, tag]);
    }
  },

  removeNote: async (id) => {
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      return { notes, allTags: collectTags(notes) };
    });
    const db = await getDb();
    await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
  },

  addImage: async (id, imageUri) => {
    try {
      const dir = new Directory(getImageBaseDir(), 'note_images');
      if (!dir.exists) dir.create();
      const ext = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      const relPath = `note_images/${id}.${ext}`;
      const dest = new File(dir, `${id}.${ext}`);
      const src = new File(imageUri);
      if (src.exists) src.move(dest);
      const absUri = dest.uri;
      set((s) => ({ notes: s.notes.map((n) => n.id === id ? { ...n, imagePath: absUri } : n) }));
      const db = await getDb();
      await db.runAsync('UPDATE notes SET image_path = ? WHERE id = ?', [relPath, id]);
    } catch (e: any) {
      Alert.alert('Ошибка картинки', String(e?.message || e));
    }
  },

  removeImage: async (id) => {
    set((s) => ({ notes: s.notes.map((n) => n.id === id ? { ...n, imagePath: undefined } : n) }));
    const db = await getDb();
    await db.runAsync('UPDATE notes SET image_path = NULL WHERE id = ?', [id]);
  },
}));
