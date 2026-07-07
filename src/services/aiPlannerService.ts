// AI workout planner via Ollama Cloud (https://ollama.com/api/chat).
// Collects training history + catalog, asks the model for a day plan with rationale.

import { getDb } from '../db/database';
import { useExerciseStore } from '../store/exerciseStore';
import { useSportStore } from '../store/sportStore';
import { useDailyLogStore } from '../store/dailyLogStore';
import { ollamaChatJson, getSetting, setSetting } from './ollamaClient';

export { getOllamaKey, setOllamaKey, getOllamaModel, setOllamaModel, SUGGESTED_MODELS } from './ollamaClient';

export interface AiPlanItem {
  exerciseId: number;
  sets: number;
  reps: number;
  weight: number; // kg, 0 for bodyweight
  reason: string;
}

export interface AiPlan {
  summary: string;
  items: AiPlanItem[];
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          exerciseId: { type: 'integer' },
          sets: { type: 'integer' },
          reps: { type: 'integer' },
          weight: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['exerciseId', 'sets', 'reps', 'weight', 'reason'],
      },
    },
  },
  required: ['summary', 'items'],
};

async function buildContext(targetDate: string, minutes: number): Promise<string> {
  const { exercises, logs, plan } = useExerciseStore.getState();
  const { entries } = useSportStore.getState();
  const dailyState = useDailyLogStore.getState();
  if (!dailyState.loaded) await dailyState.load();
  const dailyLogs = useDailyLogStore.getState().logs;

  // Body weight: latest 'weight' entry
  const weights = entries.filter((e) => e.type === 'weight').sort((a, b) => b.date.localeCompare(a.date));
  const bodyWeight = weights[0]?.count ?? 92;

  // Last 12 workout days with full detail
  const dates = Array.from(new Set(logs.map((l) => l.date))).sort().reverse().slice(0, 12);
  const history = dates.map((d) => {
    const byEx = new Map<number, string[]>();
    for (const l of logs.filter((x) => x.date === d)) {
      const arr = byEx.get(l.exerciseId) || [];
      arr.push(`${l.weight}кг x${l.reps}${l.setNum > 1 ? ` (${l.setNum} подх.)` : ''}`);
      byEx.set(l.exerciseId, arr);
    }
    const lines = Array.from(byEx.entries()).map(([id, sets]) => {
      const ex = exercises.find((e) => e.id === id);
      return `  - ${ex?.name || id} [${ex?.tag || '?'}]: ${sets.join(', ')}`;
    });
    return `${d}:\n${lines.join('\n')}`;
  }).join('\n');

  // Recent cardio (14 days)
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const cardio = entries
    .filter((e) => e.type !== 'weight' && e.date >= cutoff)
    .map((e) => `${e.date}: ${e.type} ${e.count}`)
    .join('; ') || 'нет';

  // Catalog: id, name, tag, priority, last done
  const lastDone = new Map<number, string>();
  for (const l of logs) if (!lastDone.has(l.exerciseId)) lastDone.set(l.exerciseId, l.date);
  const catalog = exercises
    .map((e) => `${e.id}|${e.name}|${e.tag || '-'}|★${e.priority}|посл:${lastDone.get(e.id) || 'никогда'}`)
    .join('\n');

  // Sleep & wellbeing, last 3 daily logs
  const recentDaily = dailyLogs
    .filter((d) => d.date <= targetDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((d) => `${d.date}: сон ${d.sleepHours ?? '?'}ч${d.sleepQuality != null ? ` (кач-во ${d.sleepQuality}/5)` : ''}${d.motivation != null ? `, мотивация ${d.motivation}/5` : ''}${d.dayRating != null ? `, день ${d.dayRating}/5` : ''}`)
    .join('\n') || 'нет данных';

  // Already-planned upcoming days (don't duplicate their muscle groups)
  const upcoming = plan
    .filter((p) => p.date > targetDate)
    .slice(0, 20)
    .map((p) => {
      const ex = exercises.find((e) => e.id === p.exerciseId);
      return `${p.date}: ${ex?.name || p.exerciseId} [${ex?.tag || '?'}]`;
    })
    .join('\n') || 'нет';

  const goal = (await getSetting('aiGoal')) || 'ОФП';
  const sex = (await getSetting('aiSex')) || 'Мужской';
  const restrictions = await getSetting('aiRestrictions');

  // User's saved programs with day composition — the model should lean on these
  const db = await getDb();
  const progRows = await db.getAllAsync<{ pname: string; dname: string; exnames: string }>(
    `SELECT p.name pname, COALESCE(d.name, 'День ' || d.day_number) dname,
            GROUP_CONCAT(e.name, '; ') exnames
     FROM programs p JOIN days d ON d.program_id = p.id
     JOIN day_exercises de ON de.day_id = d.id JOIN exercises e ON e.id = de.exercise_id
     GROUP BY d.id ORDER BY p.id, d.day_number`
  );
  const programsText = progRows.map((r) => `[${r.pname}] ${r.dname}: ${r.exnames}`).join('\n') || 'нет';

  return `Пол: ${sex}. Вес тела: ${bodyWeight} кг. Дата планируемой тренировки: ${targetDate}.
ЦЕЛЬ ТРЕНИРОВОК: ${goal}. ДОСТУПНОЕ ВРЕМЯ: ${minutes} минут.
${restrictions ? `ОГРАНИЧЕНИЯ (соблюдать строго!): ${restrictions}\n` : ''}
СОН И САМОЧУВСТВИЕ (последние дни):
${recentDaily}

ИСТОРИЯ ТРЕНИРОВОК (последние ${dates.length} дней с записями):
${history || 'пусто'}

КАРДИО (14 дней): ${cardio}

УЖЕ ЗАПЛАНИРОВАНО НА БЛИЖАЙШИЕ ДНИ (не дублируй эти группы):
${upcoming}

ПРОГРАММЫ ПОЛЬЗОВАТЕЛЯ (дни и состав):
${programsText}

КАТАЛОГ УПРАЖНЕНИЙ (id|название|группа|приоритет 1-10|последний раз):
${catalog}`;
}

const SYSTEM_PROMPT = `Ты тренер по силовой подготовке. Составь план тренировки на указанную дату.

Правила:
1. ВОССТАНОВЛЕНИЕ: группа мышц после тяжёлой работы отдыхает 48-72 ч. Смотри историю и не назначай недовосстановленные группы.
2. ПРИОРИТЕТЫ: при прочих равных выбирай упражнения с высоким ★. Упражнение ★8-10 назначай чаще, ★1-3 — редко.
3. ОБЪЁМ: подбирай число упражнений под доступное время (~8-10 мин на упражнение с разминочными). 45 мин ≈ 5, 60 мин ≈ 6-7, 90 мин ≈ 8-9. Начинай с тяжёлых базовых.
4. ВЕСА И ПРОГРЕССИЯ: рабочие веса из истории. Если в прошлый раз все подходы упражнения выполнены (повторы не падали) — прибавь 2.5 кг. Новое упражнение — консервативный вес. Без веса — weight=0.
5. БАЛАНС: жимы/тяги, отстающие группы (давно не работались).
6. СОН И САМОЧУВСТВИЕ: сон < 6.5 ч или мотивация ≤ 2 — снизь объём на треть и не прибавляй веса.
7. ЦЕЛЬ: масса — 6-10 повторов, отдых 2-3 мин; сила — 3-6 повторов, тяжело; похудение — 12-15 повторов, суперсеты, короткий отдых 45-60 сек + в конце 15-20 мин кардио (упомяни в summary); ОФП — 8-12, разнообразие.
7а. ПОЛ: женский + похудение/ОФП — акцент на низ тела и ягодицы (hip thrust, присед, выпады, отведения) ~60% объёма, верх лёгкими весами на 12-15 повторов; мужской + похудение — сохранять тяжёлую базу (присед/тяги/жимы), урезать изоляцию, а не компаунды.
7б. ПРОГРАММЫ: если у пользователя есть программа, подходящая полу и цели (например "Girl: 3 дня" для женский+похудение, "PHUL" для массы), бери её очередной день как ОСНОВУ плана: смотри историю, какой день программы выполнялся последним, и назначай следующий по циклу (A→B→C→A). Адаптируй по восстановлению и времени, но не ломай структуру дня.
8. ПЛАН БУДУЩИХ ДНЕЙ: не дублируй группы, уже запланированные на ближайшие дни.
9. ОГРАНИЧЕНИЯ пользователя — абсолютный запрет, важнее всех правил.
10. exerciseId бери СТРОГО из каталога.
11. reason — коротко, одна фраза на русском. summary — 1-2 предложения.

ФОРМАТ ОТВЕТА: только валидный JSON вида
{"summary": "...", "items": [{"exerciseId": 1, "sets": 3, "reps": 8, "weight": 70, "reason": "..."}]}
Без маркдауна, без пояснений вне JSON.`;

export async function requestAiPlan(targetDate: string, minutes = 60): Promise<AiPlan> {
  const plan: AiPlan = await ollamaChatJson({
    system: SYSTEM_PROMPT,
    user: await buildContext(targetDate, minutes),
    format: PLAN_SCHEMA,
  });

  // Drop hallucinated exercise ids
  const validIds = new Set(useExerciseStore.getState().exercises.map((e) => e.id));
  plan.items = (plan.items || []).filter((i) => validIds.has(i.exerciseId));
  if (plan.items.length === 0) throw new Error('Модель не подобрала упражнения');
  return plan;
}
