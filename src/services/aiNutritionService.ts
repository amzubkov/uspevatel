// AI food recognition via Ollama Cloud vision model: photo of a dish -> name,
// estimated portion and per-100g KБЖУ, ready to prefill the nutrition form.

import { ollamaChatJson, VISION_MODEL, getSetting } from './ollamaClient';

export interface ParsedFood {
  name: string;          // dish/product name in Russian
  amountGrams: number;   // estimated portion weight
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
}

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    amountGrams: { type: 'number' },
    kcalPer100: { type: 'number' },
    proteinPer100: { type: 'number' },
    fatPer100: { type: 'number' },
    carbsPer100: { type: 'number' },
  },
  required: ['name', 'amountGrams', 'kcalPer100', 'proteinPer100', 'fatPer100', 'carbsPer100'],
};

const FOOD_PROMPT = `Ты нутрициолог, распознаёшь еду по фото.
Определи блюдо/продукт и оцени:
- name: название по-русски, кратко (например "Гречка с курицей", "Творог 5%").
- amountGrams: примерный вес порции на фото в граммах (оцени по тарелке/упаковке).
- kcalPer100, proteinPer100, fatPer100, carbsPer100: пищевая ценность на 100 г (ккал и граммы БЖУ).
Если на фото несколько блюд — оцени всё вместе как одну порцию, name перечисли через запятую, а КБЖУ усредни на 100 г общего веса.
Числа реалистичные, запятую считай десятичной точкой.
Ответ — только JSON: {"name":"...","amountGrams":250,"kcalPer100":130,"proteinPer100":8,"fatPer100":4,"carbsPer100":15}`;

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function normalizeFood(parsed: ParsedFood, fallbackName = ''): ParsedFood {
  const food: ParsedFood = {
    name: String(parsed.name || fallbackName || '').trim(),
    amountGrams: num(parsed.amountGrams),
    kcalPer100: num(parsed.kcalPer100),
    proteinPer100: num(parsed.proteinPer100),
    fatPer100: num(parsed.fatPer100),
    carbsPer100: num(parsed.carbsPer100),
  };
  if (food.amountGrams <= 0) food.amountGrams = 100;
  return food;
}

export async function parseFoodPhoto(base64Image: string): Promise<ParsedFood> {
  const parsed: ParsedFood = await ollamaChatJson({
    model: VISION_MODEL,
    user: FOOD_PROMPT,
    images: [base64Image],
    format: FOOD_SCHEMA,
  });
  const food = normalizeFood(parsed);
  if (!food.name) throw new Error('На фото не удалось распознать еду');
  return food;
}

const LOOKUP_PROMPT = `Ты нутрициолог. По названию блюда/продукта дай его пищевую ценность.
- name: приведи название к аккуратному виду по-русски (можно уточнить, например "Окрошка на квасе").
- amountGrams: типичный размер порции в граммах (тарелка супа ~350, гарнир ~200, напиток ~250 и т.п.).
- kcalPer100, proteinPer100, fatPer100, carbsPer100: пищевая ценность на 100 г (ккал и граммы БЖУ), реалистичные средние значения.
Запятую считай десятичной точкой.
Ответ — только JSON: {"name":"...","amountGrams":350,"kcalPer100":60,"proteinPer100":2,"fatPer100":2.5,"carbsPer100":6}`;

export async function lookupFoodByName(name: string): Promise<ParsedFood> {
  const query = name.trim();
  if (!query) throw new Error('Введите название блюда');
  const parsed: ParsedFood = await ollamaChatJson({
    user: `${LOOKUP_PROMPT}\n\nБлюдо: ${query}`,
    format: FOOD_SCHEMA,
  });
  const food = normalizeFood(parsed, query);
  if (food.kcalPer100 === 0 && food.proteinPer100 === 0 && food.fatPer100 === 0 && food.carbsPer100 === 0) {
    throw new Error('Не удалось найти данные по этому названию');
  }
  return food;
}

export type MenuMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MenuItem {
  mealType: MenuMealType;
  name: string;
  amountGrams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
}

const MENU_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mealType: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          name: { type: 'string' },
          amountGrams: { type: 'number' },
          kcalPer100: { type: 'number' },
          proteinPer100: { type: 'number' },
          fatPer100: { type: 'number' },
          carbsPer100: { type: 'number' },
        },
        required: ['mealType', 'name', 'amountGrams', 'kcalPer100', 'proteinPer100', 'fatPer100', 'carbsPer100'],
      },
    },
  },
  required: ['meals'],
};

export async function generateDietMenu(params: {
  dietName: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}): Promise<MenuItem[]> {
  const restrictions = (await getSetting('aiRestrictions')).trim();
  const prompt = `Ты нутрициолог. Составь примерное меню на один день по диете «${params.dietName}».
Цели на день: ${Math.round(params.kcal)} ккал, белки ${Math.round(params.protein)} г, жиры ${Math.round(params.fat)} г, углеводы ${Math.round(params.carbs)} г.
${restrictions ? `Ограничения/предпочтения: ${restrictions}.` : ''}
Правила:
- 4–6 блюд, распределены по приёмам: breakfast, lunch, dinner, snack.
- Для каждого: mealType, name (по-русски), amountGrams (вес порции), и пищевая ценность на 100 г: kcalPer100, proteinPer100, fatPer100, carbsPer100.
- Суммарно по дню приблизься к целям КБЖУ. Реалистичные продукты и числа, запятую считай точкой.
Ответ — только JSON: {"meals":[{"mealType":"breakfast","name":"Овсянка на молоке","amountGrams":250,"kcalPer100":90,"proteinPer100":3.5,"fatPer100":2,"carbsPer100":15}]}`;

  const raw = await ollamaChatJson({ user: prompt, format: MENU_SCHEMA });
  const meals: any[] = Array.isArray(raw?.meals) ? raw.meals : [];
  const validMeal = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
  const items: MenuItem[] = meals.map((m) => ({
    mealType: (validMeal.has(m?.mealType) ? m.mealType : 'snack') as MenuMealType,
    name: String(m?.name || '').trim(),
    amountGrams: num(m?.amountGrams) || 100,
    kcalPer100: num(m?.kcalPer100),
    proteinPer100: num(m?.proteinPer100),
    fatPer100: num(m?.fatPer100),
    carbsPer100: num(m?.carbsPer100),
  })).filter((m) => m.name);

  if (items.length === 0) throw new Error('Модель не вернула меню');
  return items;
}
