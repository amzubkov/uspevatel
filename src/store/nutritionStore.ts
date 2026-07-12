import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { getDb } from '../db/database';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface NutritionEntry {
  id: string;
  name: string;
  date: string;
  time: string;
  mealType: MealType;
  amountGrams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  kcalAuto: boolean;
  notes: string;
  createdAt: string;
}

export type NutritionEntryInput = Omit<NutritionEntry, 'id' | 'createdAt'>;
export type NutritionEntryUpdate = Partial<NutritionEntryInput>;

interface NutritionState {
  entries: NutritionEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  addEntry: (input: NutritionEntryInput) => Promise<void>;
  updateEntry: (id: string, fields: NutritionEntryUpdate) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
}

interface NutritionEntryRow {
  id: string;
  name: string;
  date: string;
  time: string;
  meal_type: MealType;
  amount_grams: number;
  kcal_per_100: number;
  protein_per_100: number;
  fat_per_100: number;
  carbs_per_100: number;
  kcal_auto: number;
  notes: string;
  created_at: string;
}

function rowToEntry(row: NutritionEntryRow): NutritionEntry {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    time: row.time,
    mealType: row.meal_type,
    amountGrams: row.amount_grams,
    kcalPer100: row.kcal_per_100,
    proteinPer100: row.protein_per_100,
    fatPer100: row.fat_per_100,
    carbsPer100: row.carbs_per_100,
    kcalAuto: !!row.kcal_auto,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

const UPDATE_COLUMNS: Record<keyof NutritionEntryInput, string> = {
  name: 'name',
  date: 'date',
  time: 'time',
  mealType: 'meal_type',
  amountGrams: 'amount_grams',
  kcalPer100: 'kcal_per_100',
  proteinPer100: 'protein_per_100',
  fatPer100: 'fat_per_100',
  carbsPer100: 'carbs_per_100',
  kcalAuto: 'kcal_auto',
  notes: 'notes',
};

export const useNutritionStore = create<NutritionState>()((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync<NutritionEntryRow>(
      'SELECT * FROM nutrition_entries ORDER BY date DESC, time DESC, created_at DESC',
    );
    set({ entries: rows.map(rowToEntry), loaded: true });
  },

  addEntry: async (input) => {
    const entry: NutritionEntry = {
      ...input,
      id: Crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO nutrition_entries
        (id, name, date, time, meal_type, amount_grams, kcal_per_100,
         protein_per_100, fat_per_100, carbs_per_100, kcal_auto, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.name,
        entry.date,
        entry.time,
        entry.mealType,
        entry.amountGrams,
        entry.kcalPer100,
        entry.proteinPer100,
        entry.fatPer100,
        entry.carbsPer100,
        entry.kcalAuto ? 1 : 0,
        entry.notes,
        entry.createdAt,
      ],
    );
    set((state) => ({ entries: [entry, ...state.entries] }));
  },

  updateEntry: async (id, fields) => {
    const keys = Object.keys(fields) as (keyof NutritionEntryInput)[];
    if (keys.length === 0) return;

    const assignments: string[] = [];
    const values: SQLiteBindValue[] = [];
    for (const key of keys) {
      const value = fields[key];
      if (value !== undefined) {
        assignments.push(`${UPDATE_COLUMNS[key]} = ?`);
        if (key === 'kcalAuto') values.push(value ? 1 : 0);
        else values.push(value as SQLiteBindValue);
      }
    }
    if (assignments.length === 0) return;

    const db = await getDb();
    await db.runAsync(
      `UPDATE nutrition_entries SET ${assignments.join(', ')} WHERE id = ?`,
      [...values, id],
    );
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, ...fields } : entry,
      ),
    }));
  },

  removeEntry: async (id) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM nutrition_entries WHERE id = ?', [id]);
    set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) }));
  },
}));

type SQLiteBindValue = string | number | null;
