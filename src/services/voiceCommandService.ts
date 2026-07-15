// Voice command router: dictated phrase -> LLM intent JSON -> store action.
// Parsing runs on the fast model; food macros come from the offline catalog
// first, then an AI estimate as fallback.

import { ollamaChatJson, VISION_MODEL } from './ollamaClient';
import { searchLocalFood } from './foodDatabase';
import { lookupFoodByName } from './aiNutritionService';
import { useNutritionStore } from '../store/nutritionStore';
import { useTaskStore } from '../store/taskStore';
import { useSportStore } from '../store/sportStore';
import { useDailyLogStore } from '../store/dailyLogStore';
import { todayStr } from '../utils/date';

const PROMPT = `Ты роутер голосовых команд личного приложения (задачи, питание, спорт).
Разбери команду пользователя и верни ТОЛЬКО JSON одного из видов:
- Еда ("съел гречку 200 грамм", "добавь творог 150"):
  {"intent":"add_food","name":"гречка","grams":200}
  grams — число; если не сказано, поставь типичную порцию.
- Задача ("добавь задачу погулять с собакой", "задача: позвонить маме"):
  {"intent":"add_task","text":"погулять с собакой"}
- Вода ("выпил 500 мл воды"): {"intent":"add_water","ml":500}
- Спорт: {"intent":"add_sport","type":"run","count":5}
  type: run (км), walk (шаги), bike (км), swim (мин), pullups, abs, squats, triceps (повторы)
  "пробежал 5 км" -> run 5; "прошёл 6000 шагов" -> walk 6000; "подтянулся 10 раз" -> pullups 10
- Вес ("вес 97.5"): {"intent":"add_weight","kg":97.5}
- Заметка ко дню ("заметка ...", "запиши ..."): {"intent":"add_note","text":"..."}
- Не понял: {"intent":"unknown"}

Команда: `;

const SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    name: { type: 'string' },
    grams: { type: 'number' },
    text: { type: 'string' },
    ml: { type: 'number' },
    type: { type: 'string' },
    count: { type: 'number' },
    kg: { type: 'number' },
  },
  required: ['intent'],
};

const SPORT_TYPES = new Set(['run', 'walk', 'bike', 'swim', 'pullups', 'abs', 'squats', 'triceps']);

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function inferMeal(time: string): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

async function addFood(name: string, grams: number): Promise<string> {
  const amount = grams > 0 && grams <= 5000 ? grams : 100;
  const hits = await searchLocalFood(name, 1);
  let macro = hits[0];
  if (!macro) {
    const ai = await lookupFoodByName(name);
    macro = {
      name: ai.name,
      kcalPer100: ai.kcalPer100,
      proteinPer100: ai.proteinPer100,
      fatPer100: ai.fatPer100,
      carbsPer100: ai.carbsPer100,
      source: 'RU',
    };
  }
  const time = currentTime();
  await useNutritionStore.getState().addEntry({
    name: macro.name,
    date: todayStr(),
    time,
    mealType: inferMeal(time),
    amountGrams: amount,
    kcalPer100: macro.kcalPer100,
    proteinPer100: macro.proteinPer100,
    fatPer100: macro.fatPer100,
    carbsPer100: macro.carbsPer100,
    kcalAuto: true,
    notes: '',
  });
  const kcal = Math.round((macro.kcalPer100 * amount) / 100);
  return `🍽 ${macro.name}, ${amount} г (~${kcal} ккал) — в дневник`;
}

async function addTask(text: string): Promise<string> {
  await useTaskStore.getState().addTask({
    subject: '',
    action: text,
    category: 'IN',
    priority: 'normal',
    isRecurring: false,
    completed: false,
    notes: '',
  } as any);
  return `✅ Задача: «${text}»`;
}

/** Parse a dictated command and execute it. Returns a human-readable summary. */
export async function runVoiceCommand(phrase: string): Promise<string> {
  const command = phrase.trim();
  if (!command) return '';
  const parsed = await ollamaChatJson({
    model: VISION_MODEL,
    user: PROMPT + command,
    format: SCHEMA,
    timeoutMs: 30_000,
  });

  switch (parsed?.intent) {
    case 'add_food': {
      const name = String(parsed.name || '').trim();
      if (!name) break;
      return addFood(name, Number(parsed.grams) || 0);
    }
    case 'add_task': {
      const text = String(parsed.text || '').trim();
      if (!text) break;
      return addTask(text);
    }
    case 'add_water': {
      const ml = Math.round(Number(parsed.ml) || 0);
      if (ml <= 0 || ml > 5000) break;
      useSportStore.getState().addEntry('water', ml);
      return `💧 Вода +${ml} мл`;
    }
    case 'add_sport': {
      const type = String(parsed.type || '');
      const count = Number(parsed.count) || 0;
      if (!SPORT_TYPES.has(type) || count <= 0) break;
      useSportStore.getState().addEntry(type as any, count);
      const units: Record<string, string> = { run: 'км', walk: 'шагов', bike: 'км', swim: 'мин' };
      return `💪 ${type}: +${count} ${units[type] || 'повт.'}`;
    }
    case 'add_weight': {
      const kg = Number(parsed.kg) || 0;
      if (kg < 20 || kg > 300) break;
      useSportStore.getState().addEntry('weight', kg);
      return `⚖️ Вес: ${kg} кг`;
    }
    case 'add_note': {
      const text = String(parsed.text || '').trim();
      if (!text) break;
      const date = todayStr();
      const existing = useDailyLogStore.getState().logs.find((l) => l.date === date);
      const notes = existing?.notes?.trim() ? `${existing.notes.trim()}\n${text}` : text;
      await useDailyLogStore.getState().saveLog(date, { notes });
      return `📝 Заметка ко дню: «${text}»`;
    }
  }
  // Unknown intent — fall back to creating an inbox task from the raw phrase.
  return addTask(command);
}
