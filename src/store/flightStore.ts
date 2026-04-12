import { create } from 'zustand';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';

export type FlightStatus = 'not_planned' | 'planned' | 'reserved' | 'booked' | 'completed' | 'cancelled';
export type FlightKind = 'flight' | 'hotel' | 'event';

export interface Flight {
  id: string;
  kind: FlightKind;
  title: string;
  city?: string;
  status: FlightStatus;
  departDate: string;
  departTime?: string;
  arriveDate?: string;
  arriveTime?: string;
  notes: string;
  price?: number;
  currency: string; // EUR, RUB
  imageData?: string;
  travelerIds: string[]; // empty = "Я"
  createdAt: string;
}

interface FlightState {
  flights: Flight[];
  loaded: boolean;
  load: () => Promise<void>;
  addFlight: (f: Omit<Flight, 'id' | 'createdAt'>) => Promise<void>;
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

export const useFlightStore = create<FlightState>()((set, get) => ({
  flights: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM flights ORDER BY depart_date DESC') as any[];
    const ftRows = await db.getAllAsync('SELECT * FROM flight_travelers') as any[];
    const ftMap = new Map<string, string[]>();
    for (const r of ftRows) {
      const arr = ftMap.get(r.flight_id) || [];
      arr.push(r.traveler_id);
      ftMap.set(r.flight_id, arr);
    }
    const flights: Flight[] = rows.map((r: any) => ({
      id: r.id,
      kind: r.kind || 'flight',
      title: r.title,
      city: r.city || undefined,
      status: r.status,
      departDate: r.depart_date,
      departTime: r.depart_time || undefined,
      arriveDate: r.arrive_date || undefined,
      arriveTime: r.arrive_time || undefined,
      notes: r.notes,
      price: r.price || undefined,
      currency: r.currency || 'EUR',
      imageData: resolveImageUri(r.image_data),
      travelerIds: ftMap.get(r.id) || [],
      createdAt: r.created_at,
    }));
    set({ flights, loaded: true });
  },

  addFlight: async (f) => {
    const flight: Flight = { ...f, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
    set((s) => ({ flights: [flight, ...s.flights] }));
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO flights (id, kind, title, city, status, depart_date, depart_time, arrive_date, arrive_time, notes, price, currency, image_data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [flight.id, flight.kind, flight.title, flight.city || null, flight.status, flight.departDate, flight.departTime || null,
       flight.arriveDate || null, flight.arriveTime || null, flight.notes, flight.price || null, flight.currency, flight.imageData || null, flight.createdAt]
    );
    for (const tid of flight.travelerIds) {
      await db.runAsync('INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id) VALUES (?,?)', [flight.id, tid]);
    }
  },

  updateFlight: async (id, fields) => {
    set((s) => ({ flights: s.flights.map((f) => f.id === id ? { ...f, ...fields } : f) }));
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = {
      kind: 'kind', title: 'title', city: 'city', status: 'status', departDate: 'depart_date', departTime: 'depart_time',
      arriveDate: 'arrive_date', arriveTime: 'arrive_time', notes: 'notes', price: 'price', currency: 'currency',
    };
    for (const [k, col] of Object.entries(map)) {
      if (k in fields) { sets.push(`${col} = ?`); vals.push((fields as any)[k] ?? null); }
    }
    if (sets.length > 0) {
      vals.push(id);
      await db.runAsync(`UPDATE flights SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    if ('travelerIds' in fields && fields.travelerIds) {
      await db.runAsync('DELETE FROM flight_travelers WHERE flight_id = ?', [id]);
      for (const tid of fields.travelerIds) {
        await db.runAsync('INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id) VALUES (?,?)', [id, tid]);
      }
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
