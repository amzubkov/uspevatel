import { suggestFoodsForDay } from '../nutrition';
import { FOOD_CATALOG } from '../../db/foodCatalog';

const foods = FOOD_CATALOG.map(([name, _nameEn, kcal, protein, fat, carbs]) => ({
  name: String(name),
  kcalPer100: Number(kcal),
  proteinPer100: Number(protein),
  fatPer100: Number(fat),
  carbsPer100: Number(carbs),
}));

const GOALS = { kcal: 2200, protein: 160, fat: 70, carbs: 220 };

const CONSUMED_STATES = [
  { kcal: 0, protein: 0, fat: 0, carbs: 0 },          // empty day
  { kcal: 800, protein: 45, fat: 30, carbs: 80 },     // mid-day
  { kcal: 1900, protein: 140, fat: 60, carbs: 200 },  // near goals
  { kcal: 2500, protein: 180, fat: 90, carbs: 260 },  // overshot
];

describe('suggestFoodsForDay on the full bundled catalog', () => {
  it('produces valid suggestions for typical day states', () => {
    for (const consumed of CONSUMED_STATES.slice(0, 3)) {
      const result = suggestFoodsForDay(foods, GOALS, consumed);
      for (const item of result) {
        expect(item.amountGrams).toBeGreaterThan(0);
        expect(item.food.name.length).toBeGreaterThan(0);
        expect(Number.isFinite(item.nutrition.kcal)).toBe(true);
      }
      expect(result.length).toBeLessThanOrEqual(3);
    }
  });

  it('returns nothing when goals are already met or exceeded', () => {
    expect(suggestFoodsForDay(foods, GOALS, CONSUMED_STATES[3])).toEqual([]);
  });

  // The diary screen runs this on the JS thread; a regression here turns into
  // dead taps on the 📷/+ buttons (phone is ~10x slower than CI).
  it('stays within the interaction time budget', () => {
    // warm-up (JIT)
    suggestFoodsForDay(foods, GOALS, CONSUMED_STATES[1]);
    const started = Date.now();
    for (const consumed of CONSUMED_STATES) {
      suggestFoodsForDay(foods, GOALS, consumed);
    }
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(400); // 4 runs; ~100ms each max on CI
  });
});
