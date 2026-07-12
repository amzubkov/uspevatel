// Diet presets: each defines a macro split (% of daily kcal from protein/fat/carbs).
// Applying a diet to a kcal target yields concrete gram goals for the rings.

export interface Diet {
  id: string;
  name: string;
  desc: string;
  protein: number; // percent of kcal
  fat: number;
  carbs: number;
}

export const DIETS: Diet[] = [
  { id: 'balanced', name: 'Сбалансированная', desc: 'Классика 30/30/40', protein: 30, fat: 30, carbs: 40 },
  { id: 'high_protein', name: 'Высокобелковая', desc: 'Для набора/сушки', protein: 40, fat: 25, carbs: 35 },
  { id: 'low_carb', name: 'Низкоуглеводная', desc: 'Меньше углеводов', protein: 35, fat: 40, carbs: 25 },
  { id: 'keto', name: 'Кето', desc: 'Много жиров, мало углеводов', protein: 25, fat: 70, carbs: 5 },
  { id: 'mediterranean', name: 'Средиземноморская', desc: 'Овощи, рыба, оливк. масло', protein: 20, fat: 35, carbs: 45 },
];

export const DEFAULT_DIET = 'balanced';

export function getDiet(id: string): Diet {
  return DIETS.find((d) => d.id === id) || DIETS[0];
}

/** Compute protein/fat/carbs gram goals for a kcal target and diet split (4/9/4). */
export function macrosForKcal(kcal: number, diet: Diet): { protein: number; fat: number; carbs: number } {
  return {
    protein: Math.round((kcal * diet.protein) / 100 / 4),
    fat: Math.round((kcal * diet.fat) / 100 / 9),
    carbs: Math.round((kcal * diet.carbs) / 100 / 4),
  };
}
