export interface NutritionValues {
  amountGrams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
}

export interface NutritionTotals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export type MacroPer100 = Pick<NutritionValues, 'proteinPer100' | 'fatPer100' | 'carbsPer100'>;

/** Estimate energy using the standard 4/9/4 kcal factors for protein, fat and carbs. */
export function estimateKcalFromMacros(values: MacroPer100): number {
  return values.proteinPer100 * 4 + values.fatPer100 * 9 + values.carbsPer100 * 4;
}

/** Calculate calories and macros for the entry's actual serving size. */
export function calculateEntryNutrition(entry: NutritionValues): NutritionTotals {
  const servingFactor = entry.amountGrams / 100;
  return {
    kcal: entry.kcalPer100 * servingFactor,
    protein: entry.proteinPer100 * servingFactor,
    fat: entry.fatPer100 * servingFactor,
    carbs: entry.carbsPer100 * servingFactor,
  };
}

/** Sum calories and macros for a group of nutrition entries. */
export function sumNutrition(entries: readonly NutritionValues[]): NutritionTotals {
  return entries.reduce<NutritionTotals>((totals, entry) => {
    const value = calculateEntryNutrition(entry);
    return {
      kcal: totals.kcal + value.kcal,
      protein: totals.protein + value.protein,
      fat: totals.fat + value.fat,
      carbs: totals.carbs + value.carbs,
    };
  }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });
}
