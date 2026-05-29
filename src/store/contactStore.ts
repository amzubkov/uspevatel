import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';

export interface Contact {
  id: string;
  name: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

export function serializeTags(tags: string[]): string {
  return tags.map((t) => t.trim()).filter(Boolean).join(', ');
}

export type MessageDirection = 'in' | 'out';

export interface ContactMessage {
  id: string;
  contactId: string;
  text: string;
  direction: MessageDirection;
  createdAt: string;
  updatedAt: string;
}

interface ContactState {
  contacts: Contact[];
  messages: ContactMessage[];
  loaded: boolean;
  load: () => Promise<void>;
  addContact: (d: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateContact: (id: string, fields: Partial<Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  addMessage: (contactId: string, text: string, direction: MessageDirection) => Promise<string>;
  updateMessage: (id: string, text: string) => Promise<void>;
  updateMessageDate: (id: string, createdAt: string) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  messagesFor: (contactId: string) => ContactMessage[];
  lastMessageFor: (contactId: string) => ContactMessage | undefined;
}

function rowToContact(r: any): Contact {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes || '',
    tags: parseTags(r.tags),
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
}

function rowToMessage(r: any): ContactMessage {
  return {
    id: r.id,
    contactId: r.contact_id,
    text: r.text,
    direction: (r.direction === 'in' ? 'in' : 'out') as MessageDirection,
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
}

export const useContactStore = create<ContactState>()((set, get) => ({
  contacts: [],
  messages: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const cRows = await db.getAllAsync('SELECT * FROM contacts ORDER BY name');
    const mRows = await db.getAllAsync('SELECT * FROM contact_messages ORDER BY created_at');
    set({
      contacts: cRows.map(rowToContact),
      messages: mRows.map(rowToMessage),
      loaded: true,
    });
  },

  addContact: async (d) => {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const tags = d.tags || [];
    const contact: Contact = { id, name: d.name, notes: d.notes, tags, createdAt: now, updatedAt: now };
    set((s) => ({ contacts: [...s.contacts, contact].sort((a, b) => a.name.localeCompare(b.name)) }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO contacts (id, name, notes, tags, created_at, updated_at) VALUES (?,?,?,?,?,?)',
      [id, d.name, d.notes, serializeTags(tags), now, now],
    );
    return id;
  },

  updateContact: async (id, fields) => {
    const now = new Date().toISOString();
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...fields, updatedAt: now } : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if ((fields as any).name !== undefined) { sets.push('name = ?'); vals.push((fields as any).name); }
    if ((fields as any).notes !== undefined) { sets.push('notes = ?'); vals.push((fields as any).notes); }
    if ((fields as any).tags !== undefined) { sets.push('tags = ?'); vals.push(serializeTags((fields as any).tags)); }
    sets.push('updated_at = ?');
    vals.push(now);
    vals.push(id);
    await db.runAsync(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  removeContact: async (id) => {
    set((s) => ({
      contacts: s.contacts.filter((c) => c.id !== id),
      messages: s.messages.filter((m) => m.contactId !== id),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM contact_messages WHERE contact_id = ?', [id]);
    await db.runAsync('DELETE FROM contacts WHERE id = ?', [id]);
  },

  addMessage: async (contactId, text, direction) => {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const message: ContactMessage = { id, contactId, text, direction, createdAt: now, updatedAt: now };
    set((s) => ({ messages: [...s.messages, message] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO contact_messages (id, contact_id, text, direction, created_at, updated_at) VALUES (?,?,?,?,?,?)',
      [id, contactId, text, direction, now, now],
    );
    return id;
  },

  updateMessage: async (id, text) => {
    const now = new Date().toISOString();
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, text, updatedAt: now } : m)) }));
    const db = await getDb();
    await db.runAsync('UPDATE contact_messages SET text = ?, updated_at = ? WHERE id = ?', [text, now, id]);
  },

  updateMessageDate: async (id, createdAt) => {
    const now = new Date().toISOString();
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, createdAt, updatedAt: now } : m)) }));
    const db = await getDb();
    await db.runAsync('UPDATE contact_messages SET created_at = ?, updated_at = ? WHERE id = ?', [createdAt, now, id]);
  },

  removeMessage: async (id) => {
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM contact_messages WHERE id = ?', [id]);
  },

  messagesFor: (contactId) =>
    get().messages.filter((m) => m.contactId === contactId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

  lastMessageFor: (contactId) => {
    const ms = get().messages.filter((m) => m.contactId === contactId);
    if (ms.length === 0) return undefined;
    return ms.reduce((latest, m) => (m.createdAt > latest.createdAt ? m : latest), ms[0]);
  },
}));
