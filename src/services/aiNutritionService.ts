// AI food recognition via Ollama Cloud vision model: photo of a dish -> name,
// estimated portion and per-100g KБЖУ, ready to prefill the nutrition form.

import { ollamaChatJson, VISION_MODEL } from './ollamaClient';

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
