import { create } from 'zustand';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';
import { scheduleFlightReminder, cancelFlightReminder } from '../utils/notifications';
import { isValidDateStr, isValidTimeStr } from '../utils/date';
import {
  deleteEntityAttachmentsInTransaction,
  deleteStoredFile,
  evictEntityAttachments,
  safeFileExtension,
} from './attachmentStore';

export type FlightStatus = 'not_planned' | 'planned' | 'reserved' | 'booked' | 'completed' | 'cancelled';
export type FlightKind = 'flight' | 'hotel' | 'event';

export function shouldScheduleFlight(flight: Pick<Flight, 'kind' | 'status'>): boolean {
  return flight.kind === 'flight' && ['planned', 'reserved', 'booked'].includes(flight.status);
}

export async function reconcileFlightReminder(
  flight: Pick<Flight, 'id' | 'kind' | 'status' | 'title' | 'flightNumber' | 'departDate' | 'departTime'>,
): Promise<void> {
  await cancelFlightReminder(flight.id);
  if (!shouldScheduleFlight(flight)) return;
  const label = flight.flightNumber ? `${flight.title} (${flight.flightNumber})` : flight.title;
  await scheduleFlightReminder(flight.id, label, flight.departDate, flight.departTime);
}

function validateFlightDates(flight: Pick<Flight, 'departDate' | 'departTime' | 'arriveDate' | 'arriveTime'>): void {
  if (!isValidDateStr(flight.departDate)) throw new Error('Некорректная дата начала');
  if (flight.departTime && !isValidTimeStr(flight.departTime)) throw new Error('Некорректное время начала');
  if (flight.arriveDate && !isValidDateStr(flight.arriveDate)) throw new Error('Некорректная дата окончания');
  if (flight.arriveTime && !isValidTimeStr(flight.arriveTime)) throw new Error('Некорректное время окончания');
  if (flight.arriveTime && !flight.arriveDate) throw new Error('Для времени окончания нужна дата');
}

export interface Flight {
  id: string;
  kind: FlightKind;
  title: string;
  city?: string;
  address?: string; // hotel address / geo point for maps
  flightNumber?: string;
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
      address: r.address || undefined,
      flightNumber: r.flight_number || undefined,
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
    validateFlightDates(flight);
    const db = await getDb();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO flights (id, kind, title, city, address, flight_number, status, depart_date, depart_time, arrive_date, arrive_time, notes, price, currency, image_data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [flight.id, flight.kind, flight.title, flight.city || null, flight.address || null, flight.flightNumber || null, flight.status, flight.departDate, flight.departTime || null,
         flight.arriveDate || null, flight.arriveTime || null, flight.notes, flight.price || null, flight.currency, flight.imageData || null, flight.createdAt],
      );
      for (const tid of flight.travelerIds) {
        await tx.runAsync('INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id) VALUES (?,?)', [flight.id, tid]);
      }
    });
    set((s) => ({ flights: [flight, ...s.flights] }));
    await reconcileFlightReminder(flight).catch(() => {});
  },

  updateFlight: async (id, fields) => {
    const previous = get().flights.find((flight) => flight.id === id);
    if (!previous) return;
    const updated = { ...previous, ...fields };
    validateFlightDates(updated);
    const db = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = {
      kind: 'kind', title: 'title', city: 'city', address: 'address', flightNumber: 'flight_number', status: 'status', departDate: 'depart_date', departTime: 'depart_time',
      arriveDate: 'arrive_date', arriveTime: 'arrive_time', notes: 'notes', price: 'price', currency: 'currency',
    };
    for (const [k, col] of Object.entries(map)) {
      if (k in fields) { sets.push(`${col} = ?`); vals.push((fields as any)[k] ?? null); }
    }
    await db.withExclusiveTransactionAsync(async (tx) => {
      if (sets.length > 0) {
        await tx.runAsync(`UPDATE flights SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
      }
      if ('travelerIds' in fields && fields.travelerIds) {
        await tx.runAsync('DELETE FROM flight_travelers WHERE flight_id = ?', [id]);
        for (const tid of fields.travelerIds) {
          await tx.runAsync('INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id) VALUES (?,?)', [id, tid]);
        }
      }
    });
    set((s) => ({ flights: s.flights.map((flight) => flight.id === id ? updated : flight) }));
    if ('departDate' in fields || 'departTime' in fields || 'title' in fields || 'flightNumber' in fields || 'kind' in fields || 'status' in fields) {
      await reconcileFlightReminder(updated).catch(() => {});
    }
  },

  removeFlight: async (id) => {
    const db = await getDb();
    let imagePath: string | null = null;
    let attachmentPaths: string[] = [];
    await db.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<{ image_data: string | null }>('SELECT image_data FROM flights WHERE id = ?', [id]);
      imagePath = row?.image_data || null;
      attachmentPaths = await deleteEntityAttachmentsInTransaction(tx, 'flight', id);
      await tx.runAsync('DELETE FROM flight_travelers WHERE flight_id = ?', [id]);
      await tx.runAsync('DELETE FROM flights WHERE id = ?', [id]);
    });
    set((s) => ({ flights: s.flights.filter((f) => f.id !== id) }));
    await cancelFlightReminder(id);
    evictEntityAttachments('flight', id);
    deleteStoredFile(imagePath);
    attachmentPaths.forEach(deleteStoredFile);
  },

  addImage: async (id, imageUri) => {
    try {
      const dir = new Directory(getImageBaseDir(), 'flight_images');
      if (!dir.exists) dir.create();
      const ext = safeFileExtension(imageUri, 'jpg');
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
    const db = await getDb();
    const row = await db.getFirstAsync<{ image_data: string | null }>('SELECT image_data FROM flights WHERE id = ?', [id]);
    await db.runAsync('UPDATE flights SET image_data = NULL WHERE id = ?', [id]);
    set((s) => ({ flights: s.flights.map((f) => f.id === id ? { ...f, imageData: undefined } : f) }));
    deleteStoredFile(row?.image_data);
  },
}));
