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
export type MacroKey = 'protein' | 'fat' | 'carbs';

export interface SuggestibleFood extends Omit<NutritionValues, 'amountGrams'> {
  name: string;
}

export interface FoodSuggestion<T extends SuggestibleFood = SuggestibleFood> {
  food: T;
  amountGrams: number;
  nutrition: NutritionTotals;
}

const MACROS: readonly MacroKey[] = ['protein', 'fat', 'carbs'];
const MACRO_EPSILON: Record<MacroKey, number> = { protein: 2, fat: 1, carbs: 3 };
const BEAM_WIDTH = 18;
const MAX_SEARCH_FOODS = 36;
const MAX_TOTAL_GRAMS = 500;

const INGREDIENT_NAME = /(масло|майонез|сахар|м[её]д|\boil\b|\bmayonnaise\b|\bsugar\b|\bhoney\b)/i;
const GARNISH_NAME = /(лимон|кетчуп|\blemon\b|\bketchup\b)/i;
const RICH_DAIRY_NAME = /((^|[\s,(])сыр($|[\s,)%])|сырник|моцарелл|сметан|\bcheese\b|\bmozzarella\b|\bsour cream\b)/i;

interface PortionRules {
  step: number;
  min: number;
  max: number;
  preferencePenalty: number;
}

interface SuggestionCandidate<T extends SuggestibleFood> {
  food: T;
  amountGrams: number;
  nutrition: NutritionTotals;
  preferencePenalty: number;
}

interface SuggestionState<T extends SuggestibleFood> {
  items: SuggestionCandidate<T>[];
  nutrition: NutritionTotals;
  score: number;
  signature: string;
}

// Locale-aware string ops (toLocaleLowerCase('ru'), localeCompare) go through
// ICU and cost ~1ms each on Hermes. The beam search below touches every
// (state × food) pair thousands of times, so all per-food derived data is
// computed exactly once here.
interface FoodMeta {
  key: string;
  rules: PortionRules;
}

function buildFoodMeta<T extends SuggestibleFood>(foods: readonly T[]): Map<T, FoodMeta> {
  const meta = new Map<T, FoodMeta>();
  for (const food of foods) {
    meta.set(food, { key: food.name.trim().toLocaleLowerCase('ru'), rules: portionRules(food) });
  }
  return meta;
}

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

function addNutrition(left: NutritionTotals, right: NutritionTotals): NutritionTotals {
  return {
    kcal: left.kcal + right.kcal,
    protein: left.protein + right.protein,
    fat: left.fat + right.fat,
    carbs: left.carbs + right.carbs,
  };
}

function portionRules(food: SuggestibleFood): PortionRules {
  const name = food.name.toLocaleLowerCase('ru');
  const ingredient = INGREDIENT_NAME.test(name);
  const supplement = /(протеин|гейнер|protein|whey|gainer)/i.test(name);
  const processed = /(шоколад|бекон|сосиск|колбас|фри|жарен|chocolate|bacon|sausage|fried)/i.test(name);
  const garnish = GARNISH_NAME.test(name);
  const bread = /(хлеб|батон|лаваш|bread|loaf|lavash)/i.test(name);
  const richDairy = RICH_DAIRY_NAME.test(name);
  const dryGrain = /(сух|dry|овсяные хлопья|rolled oats)/i.test(name);

  if (ingredient) return { step: 5, min: 5, max: 50, preferencePenalty: 0.3 };
  if (garnish) return { step: 5, min: 5, max: 50, preferencePenalty: 0.14 };
  if (supplement) return { step: 5, min: 10, max: 60, preferencePenalty: 0.09 };
  if (dryGrain) return { step: 10, min: 10, max: 120, preferencePenalty: 0 };
  if (richDairy) return { step: 10, min: 10, max: 180, preferencePenalty: 0 };
  if (bread) return { step: 10, min: 10, max: 250, preferencePenalty: 0 };
  if (food.kcalPer100 >= 550) {
    return { step: 5, min: 10, max: 80, preferencePenalty: processed ? 0.1 : 0.015 };
  }
  if (food.kcalPer100 >= 400) {
    return { step: 10, min: 10, max: 120, preferencePenalty: processed ? 0.1 : 0.01 };
  }
  if (food.kcalPer100 >= 300) {
    return { step: 10, min: 10, max: 200, preferencePenalty: processed ? 0.1 : 0 };
  }
  return { step: 10, min: 10, max: 300, preferencePenalty: processed ? 0.1 : 0 };
}

function roundPortion(value: number, rules: PortionRules): number {
  const clamped = Math.min(rules.max, Math.max(rules.min, value));
  return Math.min(rules.max, Math.max(rules.min, Math.round(clamped / rules.step) * rules.step));
}

function remainingMacros(goals: NutritionTotals, consumed: NutritionTotals): Record<MacroKey, number> {
  return {
    protein: Math.max(0, goals.protein - consumed.protein),
    fat: Math.max(0, goals.fat - consumed.fat),
    carbs: Math.max(0, goals.carbs - consumed.carbs),
  };
}

function macroTolerance(goals: NutritionTotals, macro: MacroKey): number {
  return Math.max(MACRO_EPSILON[macro], Math.max(0, goals[macro]) * 0.03);
}

function macroPer100(food: SuggestibleFood, macro: MacroKey): number {
  if (macro === 'protein') return food.proteinPer100;
  if (macro === 'fat') return food.fatPer100;
  return food.carbsPer100;
}

function candidatePortions(
  food: SuggestibleFood,
  goals: NutritionTotals,
  remaining: Record<MacroKey, number>,
  rules: PortionRules = portionRules(food),
): { amounts: number[]; rules: PortionRules } {
  const raw: number[] = [];

  // Exact amounts for each still-missing macro are useful endpoints for the
  // search. The least-squares amount handles foods that contribute to several
  // macros at once (for example cottage cheese or legumes).
  for (const macro of MACROS) {
    const per100 = macroPer100(food, macro);
    if (remaining[macro] > macroTolerance(goals, macro) && per100 > 0) {
      raw.push((remaining[macro] * 100) / per100);
    }
  }

  let numerator = 0;
  let denominator = 0;
  for (const macro of MACROS) {
    const goal = Math.max(1, goals[macro]);
    const target = remaining[macro] / goal;
    const perGram = (macroPer100(food, macro) / 100) / goal;
    numerator += perGram * target;
    denominator += perGram * perGram;
  }
  if (denominator > 0) raw.push(numerator / denominator);

  raw.push(Math.min(100, rules.max));
  const amounts = [...new Set(raw.filter(Number.isFinite).map((amount) => roundPortion(amount, rules)))];
  return { amounts, rules };
}

function suggestionScore<T extends SuggestibleFood>(
  items: readonly SuggestionCandidate<T>[],
  added: NutritionTotals,
  goals: NutritionTotals,
  consumed: NutritionTotals,
): number {
  let score = 0;
  for (const macro of MACROS) {
    const goal = Math.max(1, goals[macro]);
    const remaining = Math.max(0, goals[macro] - consumed[macro]);
    const shortfall = Math.max(0, remaining - added[macro]) / goal;
    const overshoot = Math.max(0, added[macro] - remaining) / goal;
    score += shortfall * shortfall * 4 + overshoot * overshoot * 12;
  }

  // Calories are a guard rail rather than a target here: suggestions should
  // close macros, but not do so by greatly exceeding the daily kcal goal.
  const kcalGoal = Math.max(1, goals.kcal);
  const kcalRemaining = Math.max(0, goals.kcal - consumed.kcal);
  const kcalOvershoot = Math.max(0, added.kcal - kcalRemaining) / kcalGoal;
  score += kcalOvershoot * kcalOvershoot * 8;
  const totalGrams = items.reduce((sum, item) => sum + item.amountGrams, 0);
  score += items.length * 0.008;
  score += Math.pow(totalGrams / 300, 2) * 0.025;
  score += items.reduce((sum, item) => sum + item.preferencePenalty, 0);
  return score;
}

function validFood<T extends SuggestibleFood>(food: T): boolean {
  if (!food.name.trim()) return false;
  const name = food.name.toLocaleLowerCase('ru');
  // These are useful ingredients, but not sensible standalone answers to
  // “what should I eat?”. Keep them searchable in the catalog, not in tips.
  if (INGREDIENT_NAME.test(name) || GARNISH_NAME.test(name)) {
    return false;
  }
  const values = [food.kcalPer100, food.proteinPer100, food.fatPer100, food.carbsPer100];
  return values.every((value) => Number.isFinite(value) && value >= 0)
    && [food.proteinPer100, food.fatPer100, food.carbsPer100].some((value) => value > 0);
}

function preselectFoods<T extends SuggestibleFood>(
  foods: readonly T[],
  goals: NutritionTotals,
  consumed: NutritionTotals,
  remaining: Record<MacroKey, number>,
  meta: Map<T, FoodMeta>,
): T[] {
  if (foods.length <= MAX_SEARCH_FOODS) return [...foods];

  const ranked = foods.map((food) => {
    const { amounts, rules } = candidatePortions(food, goals, remaining, meta.get(food)!.rules);
    let bestScore = Number.POSITIVE_INFINITY;
    for (const amountGrams of amounts) {
      const nutrition = calculateEntryNutrition({ ...food, amountGrams });
      const item: SuggestionCandidate<T> = {
        food,
        amountGrams,
        nutrition,
        preferencePenalty: rules.preferencePenalty,
      };
      bestScore = Math.min(bestScore, suggestionScore([item], nutrition, goals, consumed));
    }
    return { food, bestScore };
  });

  const selected = new Map<string, T>();
  const add = (food: T) => selected.set(meta.get(food)!.key, food);
  ranked
    .sort((a, b) => a.bestScore - b.bestScore || a.food.name.localeCompare(b.food.name, 'ru'))
    .slice(0, 24)
    .forEach(({ food }) => add(food));

  for (const macro of MACROS) {
    if (remaining[macro] <= macroTolerance(goals, macro)) continue;
    [...foods]
      .sort((a, b) => {
        const aDensity = macroPer100(a, macro) / Math.max(1, a.kcalPer100);
        const bDensity = macroPer100(b, macro) / Math.max(1, b.kcalPer100);
        return bDensity - aDensity || a.name.localeCompare(b.name, 'ru');
      })
      .slice(0, 4)
      .forEach(add);
  }

  return [...selected.values()].slice(0, MAX_SEARCH_FOODS);
}

/**
 * Build a small, realistic set of foods that moves the current day toward its
 * macro goals. This is intentionally deterministic and offline-friendly: the
 * caller supplies foods from the bundled catalog, while a beam search balances
 * protein, fat, carbs and calorie overshoot across up to three products.
 */
export function suggestFoodsForDay<T extends SuggestibleFood>(
  foods: readonly T[],
  goals: NutritionTotals,
  consumed: NutritionTotals,
  maxItems = 3,
): FoodSuggestion<T>[] {
  if (maxItems <= 0) return [];
  const remaining = remainingMacros(goals, consumed);
  if (MACROS.every((macro) => remaining[macro] <= macroTolerance(goals, macro))) return [];

  const allMeta = buildFoodMeta(foods);
  const seen = new Set<string>();
  const validCandidates = foods.filter((food) => {
    const key = allMeta.get(food)!.key;
    if (!validFood(food) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (validCandidates.length === 0) return [];
  const candidates = preselectFoods(validCandidates, goals, consumed, remaining, allMeta);

  const zero: NutritionTotals = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const initial: SuggestionState<T> = {
    items: [],
    nutrition: zero,
    score: suggestionScore([], zero, goals, consumed),
    signature: '',
  };
  let frontier: SuggestionState<T>[] = [initial];
  let best = initial;

  for (let depth = 0; depth < Math.min(3, Math.floor(maxItems)); depth += 1) {
    const expanded = new Map<string, SuggestionState<T>>();
    for (const state of frontier) {
      const afterState: NutritionTotals = addNutrition(consumed, state.nutrition);
      const stateRemaining = remainingMacros(goals, afterState);
      const used = new Set(state.items.map((item) => allMeta.get(item.food)!.key));
      const stateGrams = state.items.reduce((sum, item) => sum + item.amountGrams, 0);

      for (const food of candidates) {
        const { key: foodKey, rules: foodRules } = allMeta.get(food)!;
        if (used.has(foodKey)) continue;
        const { amounts, rules } = candidatePortions(food, goals, stateRemaining, foodRules);
        for (const amountGrams of amounts) {
          if (stateGrams + amountGrams > MAX_TOTAL_GRAMS) continue;
          const nutrition = calculateEntryNutrition({ ...food, amountGrams });
          const items = [...state.items, {
            food,
            amountGrams,
            nutrition,
            preferencePenalty: rules.preferencePenalty,
          }];
          const added = addNutrition(state.nutrition, nutrition);
          const signature = items
            .map((item) => `${allMeta.get(item.food)!.key}:${item.amountGrams}`)
            .sort()
            .join('|');
          const next: SuggestionState<T> = {
            items,
            nutrition: added,
            score: suggestionScore(items, added, goals, consumed),
            signature,
          };
          const previous = expanded.get(signature);
          if (!previous || next.score < previous.score) expanded.set(signature, next);
        }
      }
    }

    // Plain string tie-break: localeCompare here is an ICU call inside an
    // O(n log n) comparator and used to dominate the whole search on Hermes.
    frontier = [...expanded.values()]
      .sort((a, b) => a.score - b.score || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0))
      .slice(0, BEAM_WIDTH);
    if (frontier.length === 0) break;
    if (frontier[0].score < best.score) best = frontier[0];
  }

  if (best.items.length === 0 || best.score >= initial.score) return [];
  return best.items
    .map<FoodSuggestion<T>>((item) => ({
      food: item.food,
      amountGrams: item.amountGrams,
      nutrition: item.nutrition,
    }))
    .sort((a, b) => {
      const contribution = (item: FoodSuggestion<T>) => MACROS.reduce(
        (sum, macro) => sum + Math.min(item.nutrition[macro], remaining[macro]) / Math.max(1, goals[macro]),
        0,
      );
      return contribution(b) - contribution(a) || a.food.name.localeCompare(b.food.name, 'ru');
    });
}
