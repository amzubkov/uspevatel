import { calculateEntryNutrition, estimateKcalFromMacros, sumNutrition } from '../nutrition';

const apple = {
  amountGrams: 150,
  kcalPer100: 52,
  proteinPer100: 0.3,
  fatPer100: 0.2,
  carbsPer100: 14,
};

describe('nutrition calculations', () => {
  it('estimates calories from protein, fat and carbs using 4/9/4', () => {
    expect(estimateKcalFromMacros({ proteinPer100: 20, fatPer100: 10, carbsPer100: 30 })).toBe(290);
  });

  it('calculates calories and macros for the actual serving', () => {
    const result = calculateEntryNutrition(apple);

    expect(result.kcal).toBe(78);
    expect(result.protein).toBeCloseTo(0.45);
    expect(result.fat).toBeCloseTo(0.3);
    expect(result.carbs).toBe(21);
  });

  it('sums nutrition across entries', () => {
    const result = sumNutrition([
      apple,
      {
        amountGrams: 50,
        kcalPer100: 200,
        proteinPer100: 10,
        fatPer100: 4,
        carbsPer100: 20,
      },
    ]);

    expect(result.kcal).toBe(178);
    expect(result.protein).toBeCloseTo(5.45);
    expect(result.fat).toBeCloseTo(2.3);
    expect(result.carbs).toBe(31);
  });

  it('returns zero totals for an empty list', () => {
    expect(sumNutrition([])).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });
});
