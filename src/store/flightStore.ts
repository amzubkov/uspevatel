import { create } from 'zustand';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';

export type FlightStatus = 'planned' | 'booked' | 'completed' | 'cancelled';
export type FlightKind = 'flight' | 'hotel';

export interface Flight {
  id: string;
  kind: FlightKind;
  title: string;
  status: FlightStatus;
  departDate: string;   // YYYY-MM-DD (check-in for hotel)
  departTime?: string;  // HH:MM
  arriveDate?: string;  // (check-out for hotel)
  arriveTime?: string;
  notes: string;
  imageData?: string;   // data URI
  createdAt: string;
}

interface FlightState {
  flights: Flight[];
  loaded: boolean;
  load: () => Promise<void>;
  addFlight: (f: Omit<Flight, 'id' | 'createdAt'>) => Promise<void>;
  // kind column added in v4 migration
  updateFlight: (id: string, fields: Partial<Omit<Flight, 'id' | 'createdAt'>>) => Promise<void>;
  removeFlight: (id: string) => Promise<void>;
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

function rowToFlight(r: any): Flight {
  return {
    id: r.id,
    kind: r.kind || 'flight',
    title: r.title,
    status: r.status,
    departDate: r.depart_date,
    departTime: r.depart_time || undefined,
    arriveDate: r.arrive_date || undefined,
    arriveTime: r.arrive_time || undefined,
    notes: r.notes,
    imageData: resolveImageUri(r.image_data),
    createdAt: r.created_at,
  };
}

export const useFlightStore = create<FlightState>()((set, get) => ({
  flights: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM flights ORDER BY depart_date DESC');
    set({ flights: rows.map(rowToFlight), loaded: true });
  },

  addFlight: async (f) => {
    const flight: Flight = { ...f, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
    set((s) => ({ flights: [flight, ...s.flights] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO flights (id, kind, title, status, depart_date, depart_time, arrive_date, arrive_time, notes, image_data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [flight.id, flight.kind, flight.title, flight.status, flight.departDate, flight.departTime || null,
       flight.arriveDate || null, flight.arriveTime || null, flight.notes, flight.imageData || null, flight.createdAt]
    );
  },

  updateFlight: async (id, fields) => {
    set((s) => ({ flights: s.flights.map((f) => f.id === id ? { ...f, ...fields } : f) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = {
      kind: 'kind', title: 'title', status: 'status', departDate: 'depart_date', departTime: 'depart_time',
      arriveDate: 'arrive_date', arriveTime: 'arrive_time', notes: 'notes',
    };
    for (const [k, col] of Object.entries(map)) {
      if ((fields as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((fields as any)[k]); }
    }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE flights SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
  },

  removeFlight: async (id) => {
    set((s) => ({ flights: s.flights.filter((f) => f.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM flights WHERE id = ?', [id]);
  },

  addImage: async (id, imageUri) => {
    try {
      const dir = new Directory(getImageBaseDir(), 'flight_images');
      if (!dir.exists) dir.create();
      const ext = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      const relPath = `flight_images/${id}.${ext}`;
      const dest = new File(dir, `${id}.${ext}`);
      const src = new File(imageUri);
      if (src.exists) src.move(dest);
      const absUri = dest.uri;
      set((s) => ({ flights: s.flights.map((f) => f.id === id ? { ...f, imageData: absUri } : f) }));
      const db = await getDb();
      await db.runAsync('UPDATE flights SET image_data = ? WHERE id = ?', [relPath, id]);
    } catch (e: any) {
      Alert.alert('Ошибка картинки', String(e?.message || e));
    }
  },

  removeImage: async (id) => {
    set((s) => ({ flights: s.flights.map((f) => f.id === id ? { ...f, imageData: undefined } : f) }));
    const db = await getDb();
    await db.runAsync('UPDATE flights SET image_data = NULL WHERE id = ?', [id]);
  },
}));
