import { create } from 'zustand';
import { getDb } from '../db/database';
import { DEFAULT_DIET } from '../utils/diets';

export interface NutritionGoals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const DEFAULT_GOALS: NutritionGoals = { kcal: 2000, protein: 110, fat: 70, carbs: 250 };

interface NutritionGoalState extends NutritionGoals {
  diet: string;
  loaded: boolean;
  load: () => Promise<void>;
  setGoals: (goals: NutritionGoals, diet?: string) => Promise<void>;
}

async function getSetting(key: string, fallback: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? fallback;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

export const useNutritionGoalStore = create<NutritionGoalState>()((set, get) => ({
  ...DEFAULT_GOALS,
  diet: DEFAULT_DIET,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    set({
      kcal: parseFloat(await getSetting('nutritionGoalKcal', String(DEFAULT_GOALS.kcal))) || DEFAULT_GOALS.kcal,
      protein: parseFloat(await getSetting('nutritionGoalProtein', String(DEFAULT_GOALS.protein))) || DEFAULT_GOALS.protein,
      fat: parseFloat(await getSetting('nutritionGoalFat', String(DEFAULT_GOALS.fat))) || DEFAULT_GOALS.fat,
      carbs: parseFloat(await getSetting('nutritionGoalCarbs', String(DEFAULT_GOALS.carbs))) || DEFAULT_GOALS.carbs,
      diet: await getSetting('nutritionDiet', DEFAULT_DIET),
      loaded: true,
    });
  },

  setGoals: async (goals, diet) => {
    set({ ...goals, ...(diet ? { diet } : {}) });
    await Promise.all([
      setSetting('nutritionGoalKcal', String(goals.kcal)),
      setSetting('nutritionGoalProtein', String(goals.protein)),
      setSetting('nutritionGoalFat', String(goals.fat)),
      setSetting('nutritionGoalCarbs', String(goals.carbs)),
      ...(diet ? [setSetting('nutritionDiet', diet)] : []),
    ]);
  },
}));
