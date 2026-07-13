import {
  calculateEntryNutrition,
  estimateKcalFromMacros,
  suggestFoodsForDay,
  sumNutrition,
} from '../nutrition';
import { FOOD_CATALOG } from '../../db/foodCatalog';

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

const suggestionFoods = [
  { name: 'Куриная грудка', kcalPer100: 165, proteinPer100: 31, fatPer100: 3.6, carbsPer100: 0 },
  { name: 'Авокадо', kcalPer100: 160, proteinPer100: 2, fatPer100: 15, carbsPer100: 9 },
  { name: 'Рис варёный', kcalPer100: 116, proteinPer100: 2.2, fatPer100: 0.5, carbsPer100: 25 },
  { name: 'Фасоль варёная', kcalPer100: 127, proteinPer100: 8.7, fatPer100: 0.5, carbsPer100: 23 },
  { name: 'Масло оливковое', kcalPer100: 884, proteinPer100: 0, fatPer100: 100, carbsPer100: 0 },
  { name: 'Сахар', kcalPer100: 387, proteinPer100: 0, fatPer100: 0, carbsPer100: 100 },
  { name: 'Протеин', kcalPer100: 375, proteinPer100: 75, fatPer100: 6, carbsPer100: 10 },
];

describe('food suggestions', () => {
  const goals = { kcal: 2000, protein: 110, fat: 70, carbs: 250 };

  it('returns no suggestions when macro goals are already closed', () => {
    expect(suggestFoodsForDay(suggestionFoods, goals, {
      kcal: 2100,
      protein: 111,
      fat: 72,
      carbs: 252,
    })).toEqual([]);
  });

  it('treats gaps within three percent as rounding noise', () => {
    expect(suggestFoodsForDay(suggestionFoods, goals, {
      kcal: 1980,
      protein: 107,
      fat: 68,
      carbs: 243,
    })).toEqual([]);
  });

  it('builds a realistic plan that reduces all large macro gaps', () => {
    const consumed = { kcal: 1400, protein: 75, fat: 50, carbs: 180 };
    const result = suggestFoodsForDay(suggestionFoods, goals, consumed);
    const added = result.reduce(
      (sum, item) => ({
        kcal: sum.kcal + item.nutrition.kcal,
        protein: sum.protein + item.nutrition.protein,
        fat: sum.fat + item.nutrition.fat,
        carbs: sum.carbs + item.nutrition.carbs,
      }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(new Set(result.map((item) => item.food.name)).size).toBe(result.length);
    expect(result.every((item) => item.amountGrams >= 5 && item.amountGrams <= 300)).toBe(true);
    expect(added.protein).toBeGreaterThan(20);
    expect(added.fat).toBeGreaterThan(10);
    expect(added.carbs).toBeGreaterThan(40);
    expect(result.map((item) => item.food.name)).not.toContain('Масло оливковое');
    expect(result.map((item) => item.food.name)).not.toContain('Сахар');
  });

  it('avoids adding more fat when only protein is missing', () => {
    const result = suggestFoodsForDay(suggestionFoods, goals, {
      kcal: 1850,
      protein: 80,
      fat: 80,
      carbs: 255,
    });
    const added = result.reduce((sum, item) => sum + item.nutrition.fat, 0);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((item) => item.food.name === 'Куриная грудка')).toBe(true);
    expect(added).toBeLessThan(8);
  });

  it('is deterministic and ignores invalid or duplicate catalog rows', () => {
    const input = [
      ...suggestionFoods,
      { ...suggestionFoods[0], name: 'куриная грудка' },
      { name: '', kcalPer100: 10, proteinPer100: 1, fatPer100: 0, carbsPer100: 1 },
      { name: 'Ошибка', kcalPer100: -1, proteinPer100: 1, fatPer100: 1, carbsPer100: 1 },
      { name: 'Без БЖУ', kcalPer100: 100, proteinPer100: 0, fatPer100: 0, carbsPer100: 0 },
    ];
    const consumed = { kcal: 1500, protein: 75, fat: 50, carbs: 180 };
    const baseline = suggestFoodsForDay(suggestionFoods, goals, consumed);
    const withBadRows = suggestFoodsForDay(input, goals, consumed);

    expect(withBadRows).toEqual(baseline);
    expect(suggestFoodsForDay(input, goals, consumed)).toEqual(withBadRows);
  });

  it('does not suggest oils or sugar as standalone food', () => {
    expect(suggestFoodsForDay(
      suggestionFoods.filter((food) => food.name === 'Масло оливковое' || food.name === 'Сахар'),
      goals,
      { kcal: 1000, protein: 110, fat: 20, carbs: 100 },
    )).toEqual([]);
  });

  it('does not fall back to pure ingredients for zero protein and carb goals', () => {
    expect(suggestFoodsForDay(suggestionFoods, {
      kcal: 2000,
      protein: 0,
      fat: 70,
      carbs: 0,
    }, {
      kcal: 1000,
      protein: 0,
      fat: 0,
      carbs: 0,
    })).toEqual([]);
  });

  it('does not mistake boiled foods or raw carrots for oil and cheese', () => {
    const chicken = suggestFoodsForDay([{
      name: 'Boiled chicken',
      kcalPer100: 165,
      proteinPer100: 31,
      fatPer100: 3.6,
      carbsPer100: 0,
    }], { kcal: 165, protein: 31, fat: 3.6, carbs: 0 }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });
    const carrot = suggestFoodsForDay([{
      name: 'Морковь сырая',
      kcalPer100: 41,
      proteinPer100: 0.9,
      fatPer100: 0.2,
      carbsPer100: 10,
    }], { kcal: 123, protein: 2.7, fat: 0.6, carbs: 30 }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });

    expect(chicken[0]?.food.name).toBe('Boiled chicken');
    expect(chicken[0]?.amountGrams).toBe(100);
    expect(carrot[0]?.amountGrams).toBe(300);
  });

  it('keeps suggestions from the real catalog compact', () => {
    const catalog = FOOD_CATALOG.map(([name, _nameEn, kcal, protein, fat, carbs]) => ({
      name,
      kcalPer100: kcal,
      proteinPer100: protein,
      fatPer100: fat,
      carbsPer100: carbs,
    }));
    const result = suggestFoodsForDay(catalog, goals, {
      kcal: 1400,
      protein: 75,
      fat: 50,
      carbs: 180,
    });
    const totalGrams = result.reduce((sum, item) => sum + item.amountGrams, 0);

    expect(result.length).toBeGreaterThan(0);
    expect(totalGrams).toBeLessThanOrEqual(500);
    expect(result.every((item) => item.amountGrams <= 300)).toBe(true);
    expect(result.map((item) => item.food.name).join(' ')).not.toMatch(/масло|майонез|сахар|мёд|лимон|кетчуп/i);
  });
});
