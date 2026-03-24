import { create } from 'zustand';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';

export interface Car {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface CarDocument {
  id: string;
  carId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface CarDocImage {
  id: string;
  carDocumentId: string;
  imagePath: string;
  sortOrder: number;
  createdAt: string;
}

export interface CarService {
  id: string;
  carId: string;
  date: string;
  mileage: number;
  notes: string;
  createdAt: string;
}

interface CarState {
  cars: Car[];
  carDocuments: CarDocument[];
  carDocImages: CarDocImage[];
  services: CarService[];
  loaded: boolean;
  load: () => Promise<void>;
  addCar: (name: string) => Promise<string>;
  updateCar: (id: string, name: string) => Promise<void>;
  removeCar: (id: string) => Promise<void>;
  addCarDocument: (carId: string, name: string) => Promise<string>;
  removeCarDocument: (id: string) => Promise<void>;
  addCarDocImage: (carDocId: string, uri: string) => Promise<void>;
  removeCarDocImage: (id: string) => Promise<void>;
  addService: (s: Omit<CarService, 'id' | 'createdAt'>) => Promise<void>;
  removeService: (id: string) => Promise<void>;
}

function resolveUri(val: string): string {
  if (val.startsWith('file://') || val.startsWith('content://')) return val;
  return getImageBaseDir() + '/' + val;
}

export const useCarStore = create<CarState>()((set, get) => ({
  cars: [],
  carDocuments: [],
  carDocImages: [],
  services: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const cars = await db.getAllAsync('SELECT * FROM cars ORDER BY sort_order');
    const docs = await db.getAllAsync('SELECT * FROM car_documents ORDER BY sort_order');
    const imgs = await db.getAllAsync('SELECT * FROM car_document_images ORDER BY sort_order');
    const svcs = await db.getAllAsync('SELECT * FROM car_services ORDER BY date DESC');
    set({
      cars: cars.map((r: any) => ({ id: r.id, name: r.name, sortOrder: r.sort_order, createdAt: r.created_at })),
      carDocuments: docs.map((r: any) => ({ id: r.id, carId: r.car_id, name: r.name, sortOrder: r.sort_order, createdAt: r.created_at })),
      carDocImages: imgs.map((r: any) => ({ id: r.id, carDocumentId: r.car_document_id, imagePath: resolveUri(r.image_path), sortOrder: r.sort_order, createdAt: r.created_at })),
      services: svcs.map((r: any) => ({ id: r.id, carId: r.car_id, date: r.date, mileage: r.mileage, notes: r.notes || '', createdAt: r.created_at })),
      loaded: true,
    });
  },

  addCar: async (name) => {
    const max = Math.max(0, ...get().cars.map((c) => c.sortOrder));
    const car: Car = { id: Crypto.randomUUID(), name, sortOrder: max + 1, createdAt: new Date().toISOString() };
    set((s) => ({ cars: [...s.cars, car] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO cars (id, name, sort_order, created_at) VALUES (?,?,?,?)', [car.id, car.name, car.sortOrder, car.createdAt]);
    return car.id;
  },

  updateCar: async (id, name) => {
    set((s) => ({ cars: s.cars.map((c) => c.id === id ? { ...c, name } : c) }));
    const db = await getDb();
    await db.runAsync('UPDATE cars SET name = ? WHERE id = ?', [name, id]);
  },

  removeCar: async (id) => {
    set((s) => ({
      cars: s.cars.filter((c) => c.id !== id),
      carDocuments: s.carDocuments.filter((d) => d.carId !== id),
      carDocImages: s.carDocImages.filter((i) => {
        const docIds = s.carDocuments.filter((d) => d.carId === id).map((d) => d.id);
        return !docIds.includes(i.carDocumentId);
      }),
      services: s.services.filter((sv) => sv.carId !== id),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM cars WHERE id = ?', [id]);
  },

  addCarDocument: async (carId, name) => {
    const max = Math.max(0, ...get().carDocuments.filter((d) => d.carId === carId).map((d) => d.sortOrder));
    const doc: CarDocument = { id: Crypto.randomUUID(), carId, name, sortOrder: max + 1, createdAt: new Date().toISOString() };
    set((s) => ({ carDocuments: [...s.carDocuments, doc] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO car_documents (id, car_id, name, sort_order, created_at) VALUES (?,?,?,?,?)', [doc.id, carId, name, doc.sortOrder, doc.createdAt]);
    return doc.id;
  },

  removeCarDocument: async (id) => {
    set((s) => ({
      carDocuments: s.carDocuments.filter((d) => d.id !== id),
      carDocImages: s.carDocImages.filter((i) => i.carDocumentId !== id),
    }));
    const db = await getDb();
    await db.runAsync('DELETE FROM car_documents WHERE id = ?', [id]);
  },

  addCarDocImage: async (carDocId, imageUri) => {
    try {
      const dir = new Directory(getImageBaseDir(), 'car_doc_images');
      if (!dir.exists) dir.create();
      const imgId = Crypto.randomUUID();
      const ext = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      const relPath = `car_doc_images/${imgId}.${ext}`;
      const dest = new File(dir, `${imgId}.${ext}`);
      const src = new File(imageUri);
      if (src.exists) src.move(dest);
      const now = new Date().toISOString();
      const max = Math.max(0, ...get().carDocImages.filter((i) => i.carDocumentId === carDocId).map((i) => i.sortOrder));
      const img: CarDocImage = { id: imgId, carDocumentId: carDocId, imagePath: dest.uri, sortOrder: max + 1, createdAt: now };
      set((s) => ({ carDocImages: [...s.carDocImages, img] }));
      const db = await getDb();
      await db.runAsync('INSERT INTO car_document_images (id, car_document_id, image_path, sort_order, created_at) VALUES (?,?,?,?,?)', [img.id, carDocId, relPath, img.sortOrder, now]);
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    }
  },

  removeCarDocImage: async (id) => {
    set((s) => ({ carDocImages: s.carDocImages.filter((i) => i.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM car_document_images WHERE id = ?', [id]);
  },

  addService: async (sv) => {
    const svc: CarService = { ...sv, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
    set((s) => ({ services: [svc, ...s.services] }));
    const db = await getDb();
    await db.runAsync('INSERT INTO car_services (id, car_id, date, mileage, notes, created_at) VALUES (?,?,?,?,?,?)',
      [svc.id, svc.carId, svc.date, svc.mileage, svc.notes, svc.createdAt]);
  },

  removeService: async (id) => {
    set((s) => ({ services: s.services.filter((sv) => sv.id !== id) }));
    const db = await getDb();
    await db.runAsync('DELETE FROM car_services WHERE id = ?', [id]);
  },
}));
