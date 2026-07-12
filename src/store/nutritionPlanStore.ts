import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { getDb } from '../db/database';
import { MealType } from './nutritionStore';

export interface Ingredient {
  name: string;
  grams: number;
}

export interface PlanItem {
  id: string;
  date: string;
  mealType: MealType;
  name: string;
  amountGrams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  ingredients: Ingredient[];
  done: boolean;
  createdAt: string;
}

export type PlanItemInput = Omit<PlanItem, 'id' | 'createdAt' | 'done'>;

interface PlanItemRow {
  id: string;
  date: string;
  meal_type: MealType;
  name: string;
  amount_grams: number;
  kcal_per_100: number;
  protein_per_100: number;
  fat_per_100: number;
  carbs_per_100: number;
  done: number;
  ingredients: string;
  created_at: string;
}

function parseIngredients(raw: string): Ingredient[] {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x: any) => ({ name: String(x?.name || '').trim(), grams: Number(x?.grams) || 0 }))
      .filter((x) => x.name && x.grams > 0);
  } catch { return []; }
}

function rowToItem(r: PlanItemRow): PlanItem {
  return {
    id: r.id,
    date: r.date,
    mealType: r.meal_type,
    name: r.name,
    amountGrams: r.amount_grams,
    kcalPer100: r.kcal_per_100,
    proteinPer100: r.protein_per_100,
    fatPer100: r.fat_per_100,
    carbsPer100: r.carbs_per_100,
    ingredients: parseIngredients(r.ingredients),
    done: !!r.done,
    createdAt: r.created_at,
  };
}

interface PlanState {
  items: PlanItem[];
  loaded: boolean;
  load: () => Promise<void>;
  addItem: (input: PlanItemInput) => Promise<void>;
  updateItem: (id: string, fields: Partial<PlanItemInput>) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearDate: (date: string) => Promise<void>;
}

const COLS: Record<keyof PlanItemInput, string> = {
  date: 'date',
  mealType: 'meal_type',
  name: 'name',
  amountGrams: 'amount_grams',
  kcalPer100: 'kcal_per_100',
  proteinPer100: 'protein_per_100',
  fatPer100: 'fat_per_100',
  carbsPer100: 'carbs_per_100',
  ingredients: 'ingredients',
};

export const useNutritionPlanStore = create<PlanState>()((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.getAllAsync<PlanItemRow>('SELECT * FROM nutrition_plan ORDER BY date DESC, created_at ASC');
    set({ items: rows.map(rowToItem), loaded: true });
  },

  addItem: async (input) => {
    const item: PlanItem = { ...input, ingredients: input.ingredients || [], id: Crypto.randomUUID(), done: false, createdAt: new Date().toISOString() };
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO nutrition_plan
        (id, date, meal_type, name, amount_grams, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, done, ingredients, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [item.id, item.date, item.mealType, item.name, item.amountGrams, item.kcalPer100,
       item.proteinPer100, item.fatPer100, item.carbsPer100, JSON.stringify(item.ingredients), item.createdAt],
    );
    set((state) => ({ items: [...state.items, item] }));
  },

  updateItem: async (id, fields) => {
    const keys = Object.keys(fields) as (keyof PlanItemInput)[];
    const assignments: string[] = [];
    const values: (string | number)[] = [];
    for (const key of keys) {
      const value = fields[key];
      if (value !== undefined) {
        assignments.push(`${COLS[key]} = ?`);
        values.push(key === 'ingredients' ? JSON.stringify(value) : (value as string | number));
      }
    }
    if (assignments.length === 0) return;
    const db = await getDb();
    await db.runAsync(`UPDATE nutrition_plan SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
    set((state) => ({ items: state.items.map((it) => (it.id === id ? { ...it, ...fields } : it)) }));
  },

  toggleDone: async (id) => {
    const item = get().items.find((it) => it.id === id);
    if (!item) return;
    const next = !item.done;
    const db = await getDb();
    await db.runAsync('UPDATE nutrition_plan SET done = ? WHERE id = ?', [next ? 1 : 0, id]);
    set((state) => ({ items: state.items.map((it) => (it.id === id ? { ...it, done: next } : it)) }));
  },

  removeItem: async (id) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM nutrition_plan WHERE id = ?', [id]);
    set((state) => ({ items: state.items.filter((it) => it.id !== id) }));
  },

  clearDate: async (date) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM nutrition_plan WHERE date = ?', [date]);
    set((state) => ({ items: state.items.filter((it) => it.date !== date) }));
  },
}));
