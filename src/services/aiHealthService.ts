// AI lab-test advisor via Ollama Cloud: looks at existing results, age, sex
// and suggests what to (re)test. Not a medical diagnosis.

import { useHealthStore } from '../store/healthStore';
import { ollamaChatJson, getSetting, VISION_MODEL } from './ollamaClient';
import { isValidDateStr, todayStr } from '../utils/date';

export interface HealthAdviceItem {
  tests: string;   // what to take, e.g. "Липидограмма (ЛПНП, ЛПВП, ТГ)"
  why: string;
  urgency: string; // 'срочно' | 'скоро' | 'планово'
}

export interface HealthAdvice {
  summary: string;
  items: HealthAdviceItem[];
}

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tests: { type: 'string' },
          why: { type: 'string' },
          urgency: { type: 'string', enum: ['срочно', 'скоро', 'планово'] },
        },
        required: ['tests', 'why', 'urgency'],
      },
    },
  },
  required: ['summary', 'items'],
};

const SYSTEM_PROMPT = `Ты врач превентивной медицины. По результатам анализов, возрасту и полу составь список: что сдать или пересдать.

Правила:
1. ОТКЛОНЕНИЯ: значение вне референса — пересдать в динамике + смежные маркеры для уточнения причины.
2. ДАВНОСТЬ: базовые панели (ОАК, липидограмма, глюкоза/HbA1c, креатинин, АЛТ/АСТ, ТТГ) актуальны ~12 мес, при отклонениях — чаще. Смотри даты.
3. ВОЗРАСТ/ПОЛ: добавь скрининги по возрасту (USPSTF): 40+ — липиды, глюкоза, давление; 45+ — колоноскопия/кальпротектин; мужчинам 50+ — ПСА (обсудить с врачом); и т.п.
4. ЧЕГО НЕ ХВАТАЕТ: если важного маркера вообще нет в истории — предложи.
5. urgency: 'срочно' — только при явно тревожных отклонениях; 'скоро' — 1-2 мес; 'планово' — ежегодный чек.
6. Группируй в панели (одна строка = один поход в лабораторию), 4-8 пунктов максимум.
7. По-русски, кратко. summary — общая картина здоровья по данным в 2-3 предложениях.
8. Ты НЕ ставишь диагнозы — только рекомендации по обследованию с формулировкой "обсудить с врачом" где уместно.

ФОРМАТ ОТВЕТА — только валидный JSON СТРОГО с такими ключами (на английском!):
{"summary":"...","items":[{"tests":"Липидограмма (ЛПНП, ЛПВП, ТГ)","why":"...","urgency":"скоро"}]}
urgency только из: "срочно", "скоро", "планово". Без маркдауна и текста вне JSON.`;

export interface ParsedLabResult {
  name: string;
  value: number;
  unit?: string;
  refMin?: number;
  refMax?: number;
}

export interface ParsedLab {
  date: string; // YYYY-MM-DD from the report, or today
  results: ParsedLabResult[];
}

const LAB_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string' },
          refMin: { type: 'number' },
          refMax: { type: 'number' },
        },
        required: ['name', 'value'],
      },
    },
  },
  required: ['date', 'results'],
};

const LAB_PROMPT = `Ты распознаёшь бланк лабораторных анализов с фото.
Извлеки ВСЕ показатели: name (название по-русски, как в бланке, без лишних скобок), value (число; запятую считай десятичной точкой), unit (единицы), refMin/refMax (референсный интервал, если указан; "< 5" => refMax=5; "> 3" => refMin=3).
date — дата взятия/выдачи анализа с бланка в формате YYYY-MM-DD; если даты нет, верни пустую строку.
Качественные результаты ("отрицательно", "не обнаружено") пропускай.
Ответ — только JSON: {"date":"YYYY-MM-DD","results":[{"name":"...","value":1.2,"unit":"...","refMin":0,"refMax":5}]}`;

export async function parseLabPhoto(base64Image: string): Promise<ParsedLab> {
  const raw: any = await ollamaChatJson({ model: VISION_MODEL, user: LAB_PROMPT, images: [base64Image], format: LAB_SCHEMA });
  const results: ParsedLabResult[] = (Array.isArray(raw?.results) ? raw.results : []).flatMap((item: any) => {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 300) : '';
    const value = item?.value == null ? NaN : Number(String(item.value).replace(',', '.'));
    if (!name || !Number.isFinite(value) || Math.abs(value) > 1e15) return [];
    const refMin = item?.refMin == null ? NaN : Number(String(item.refMin).replace(',', '.'));
    const refMax = item?.refMax == null ? NaN : Number(String(item.refMax).replace(',', '.'));
    return [{
      name,
      value,
      unit: typeof item.unit === 'string' ? item.unit.trim().slice(0, 100) || undefined : undefined,
      refMin: Number.isFinite(refMin) ? refMin : undefined,
      refMax: Number.isFinite(refMax) ? refMax : undefined,
    }];
  });
  if (results.length === 0) throw new Error('На фото не распознано ни одного показателя');
  return { date: isValidDateStr(raw?.date) ? raw.date : todayStr(), results };
}

export async function requestHealthAdvice(personId: string | null): Promise<HealthAdvice> {
  const sex = (await getSetting('aiSex')) || 'Мужской';
  const birthYear = await getSetting('aiBirthYear');
  const currentYear = new Date().getFullYear();
  const parsedBirthYear = Number(birthYear);
  const age = Number.isInteger(parsedBirthYear) && parsedBirthYear >= 1900 && parsedBirthYear <= currentYear
    ? currentYear - parsedBirthYear
    : null;

  const st = useHealthStore.getState();
  if (!st.loaded) await st.load();
  const { metrics, entries, metricRefs } = useHealthStore.getState();

  const pid = personId || 'me';
  const lines: string[] = [];
  for (const m of metrics) {
    const es = entries
      .filter((e) => e.metricId === m.id && e.personId === pid)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (es.length === 0) continue;
    const last = es[0];
    const flag = (m.refMin != null && last.value < m.refMin) || (m.refMax != null && last.value > m.refMax) ? ' !ВНЕ РЕФЕРЕНСА' : '';
    const hist = es.slice(1, 3).map((e) => `${e.value} (${e.date})`).join(', ');
    const refs = metricRefs
      .filter((r) => r.metricId === m.id)
      .map((r) => `${r.source}:${r.refMin ?? ''}-${r.refMax ?? ''}`)
      .join(' ');
    lines.push(`${m.name} [${m.unit}] реф:${m.refMin ?? '?'}-${m.refMax ?? '?'} ${refs}: ${last.value} (${last.date})${flag}${hist ? `; ранее: ${hist}` : ''}`);
  }

  const context = `Пол: ${sex}. Возраст: ${age ?? 'не указан (уточни диапазон скринингов сам)'}.
Сегодня: ${todayStr()}.

РЕЗУЛЬТАТЫ АНАЛИЗОВ (метрика [ед] референс: последнее значение (дата); история):
${lines.join('\n') || 'анализов в базе нет — предложи базовый чек-ап по возрасту и полу'}`;

  const raw = await ollamaChatJson({ system: SYSTEM_PROMPT, user: context, format: SCHEMA });
  const advice = normalizeAdvice(raw);
  if (!advice.items?.length) throw new Error('Модель не дала рекомендаций');
  return advice;
}

// Models sometimes ignore the schema and answer with Russian keys — map them back.
function normalizeAdvice(raw: any): HealthAdvice {
  const source = raw && typeof raw === 'object' ? raw : {};
  const items = source.items || source['рекомендации'] || source['recommendations'] || source['список'] || [];
  const summary = source.summary || source['итог'] || source['резюме'] || source['общая_картина'] || '';
  const normUrgency = (u: any): string => {
    const v = String(u || '').toLowerCase();
    if (v.includes('сроч') || v.includes('urgent')) return 'срочно';
    if (v.includes('скор') || v.includes('soon') || v.includes('1-2')) return 'скоро';
    return 'планово';
  };
  return {
    summary: String(summary).trim().slice(0, 4000),
    items: (Array.isArray(items) ? items : []).map((it: any) => ({
      tests: String(it?.tests || it?.['анализ'] || it?.['анализы'] || it?.['название'] || it?.name || '').trim().slice(0, 1000),
      why: String(it?.why || it?.['обоснование'] || it?.['почему'] || it?.reason || '').trim().slice(0, 2000),
      urgency: normUrgency(it?.urgency || it?.['срочность']),
    })).filter((it: HealthAdviceItem) => it.tests).slice(0, 20),
  };
}
