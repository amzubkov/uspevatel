import type { SportEntry } from '../store/sportStore';
import type { Exercise, WorkoutLog } from '../store/exerciseStore';

// ─── Workout quick-entry parser ───
const NUM_PAT = '\\d+(?:[.,]\\d+)?';
export const LINE_RE = new RegExp(`^(.+?)\\s+(${NUM_PAT}(?:-${NUM_PAT})*)(?:\\s*\\((${NUM_PAT}(?:-${NUM_PAT})*)\\))?\\s*$`);
export const LIST_PREFIX_RE = /^\d+[.)]\s*/;

export function matchExerciseExact(name: string, exercises: Exercise[]): Exercise | null {
  const q = name.toLowerCase().trim();
  if (!q) return null;
  let m = exercises.find((e) => e.name.toLowerCase() === q);
  if (m) return m;
  m = exercises.find((e) => e.name.toLowerCase().startsWith(q));
  if (m) return m;
  m = exercises.find((e) => e.name.toLowerCase().includes(q));
  return m || null;
}

export function rankExerciseCandidates(name: string, exercises: Exercise[], limit = 3): Exercise[] {
  const q = name.toLowerCase().trim();
  if (!q) return [];
  const scored = exercises.map((e) => {
    const en = e.name.toLowerCase();
    let score = 0;
    if (en === q) score = 100;
    else if (en.startsWith(q)) score = 80;
    else if (q.length >= 3 && q.startsWith(en) && en.length >= 3) score = 70;
    else if (en.includes(q)) score = 50;
    else if (q.length >= 3 && q.includes(en) && en.length >= 3) score = 40;
    else {
      const qWords = q.split(/\s+/).filter(Boolean);
      const eWords = en.split(/\s+/).filter(Boolean);
      let matches = 0;
      for (const qw of qWords) {
        if (qw.length < 2) continue;
        if (eWords.some((ew) => ew.startsWith(qw) || qw.startsWith(ew))) matches++;
      }
      if (matches > 0) score = 20 + matches * 5;
    }
    return { ex: e, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.ex);
}

export type DailyType = SportEntry['type'];

export const DAILY_ALIASES: { type: DailyType; patterns: string[]; label: string; unit: string; isBodyweight: boolean }[] = [
  { type: 'pullups', patterns: ['подтягивания', 'подтяг', 'подтяг.'], label: 'Подтягивания', unit: 'повт.', isBodyweight: true },
  { type: 'abs', patterns: ['пресс'], label: 'Пресс', unit: 'повт.', isBodyweight: true },
  { type: 'triceps', patterns: ['трицепс'], label: 'Трицепс', unit: 'повт.', isBodyweight: true },
  { type: 'squats', patterns: ['присед', 'приседания'], label: 'Приседания', unit: 'повт.', isBodyweight: true },
  { type: 'football', patterns: ['футбол'], label: 'Футбол', unit: 'мин', isBodyweight: false },
  { type: 'run', patterns: ['бег'], label: 'Бег', unit: 'км', isBodyweight: false },
  { type: 'bike', patterns: ['вело', 'велосипед'], label: 'Вело', unit: 'км', isBodyweight: false },
  { type: 'swim', patterns: ['плавание'], label: 'Плавание', unit: 'мин', isBodyweight: false },
  { type: 'water', patterns: ['вода'], label: 'Вода', unit: 'мл', isBodyweight: false },
];

export const BODYWEIGHT_DAILY_TYPES: DailyType[] = ['pullups', 'abs', 'triceps', 'squats'];

export function getDailyAlias(type: DailyType) {
  return DAILY_ALIASES.find((a) => a.type === type);
}

export function matchDailyType(name: string): DailyType | null {
  const q = name.toLowerCase().trim();
  if (!q) return null;
  for (const alias of DAILY_ALIASES) {
    for (const p of alias.patterns) {
      if (q === p) return alias.type;
    }
  }
  for (const alias of DAILY_ALIASES) {
    for (const p of alias.patterns) {
      if (q.startsWith(p) && (q.length === p.length || q[p.length] === ' ')) return alias.type;
    }
  }
  return null;
}

export interface ParsedLine {
  lineIdx: number;
  raw: string;
  name: string;
  nums: number[];
  reps: number[];
  hasNumbers: boolean;
  matched: Exercise | null;
  matchedDaily: DailyType | null;
  candidates: Exercise[];
}

export function parseLine(rawLine: string, lineIdx: number, exercises: Exercise[]): ParsedLine | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(LIST_PREFIX_RE, '').trim();
  if (!cleaned) return null;
  const m = cleaned.match(LINE_RE);
  let name: string;
  let nums: number[] = [];
  let reps: number[] = [];
  let hasNumbers = false;
  if (m) {
    name = m[1].trim();
    nums = m[2].split('-').map((s) => parseFloat(s.replace(',', '.'))).filter((n) => !isNaN(n));
    if (m[3]) reps = m[3].split('-').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
    hasNumbers = nums.length > 0;
  } else {
    name = cleaned;
  }
  // Daily aliases take priority — short fixed names that map to Daily counters
  const matchedDaily = matchDailyType(name);
  if (matchedDaily) {
    return { lineIdx, raw: trimmed, name, nums, reps, hasNumbers, matched: null, matchedDaily, candidates: [] };
  }
  const matched = matchExerciseExact(name, exercises);
  const candidates = matched ? [] : rankExerciseCandidates(name, exercises);
  return { lineIdx, raw: trimmed, name, nums, reps, hasNumbers, matched, matchedDaily: null, candidates };
}

export function getLastReps(exId: number, logs: WorkoutLog[]): number {
  const last = logs.find((l) => l.exerciseId === exId);
  return last?.reps || 10;
}

export interface SetEntry { weight: number; reps: number }

export function buildSets(parsed: ParsedLine, defaultReps: number): SetEntry[] {
  if (!parsed.matched || !parsed.hasNumbers) return [];
  if (parsed.matched.weightType === 0) {
    return parsed.nums.map((n) => ({ weight: 0, reps: Math.round(n) }));
  }
  return parsed.nums.map((w, i) => {
    const r = parsed.reps[i] ?? parsed.reps[parsed.reps.length - 1] ?? defaultReps;
    return { weight: w, reps: r };
  });
}

export function groupSets(sets: SetEntry[]): { weight: number; reps: number; count: number }[] {
  const groups: { weight: number; reps: number; count: number }[] = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.weight === s.weight && last.reps === s.reps) last.count++;
    else groups.push({ ...s, count: 1 });
  }
  return groups;
}

export function formatGroupedCounts(nums: number[]): string {
  if (nums.length === 0) return '';
  const groups: { val: number; count: number }[] = [];
  for (const n of nums) {
    const last = groups[groups.length - 1];
    if (last && last.val === n) last.count++;
    else groups.push({ val: n, count: 1 });
  }
  return groups.map((g) => (g.count > 1 ? `${g.val}×${g.count}` : `${g.val}`)).join(' / ');
}

export function formatDailyLabel(matchedDaily: DailyType, nums: number[]): string {
  if (nums.length === 0) return '';
  const alias = getDailyAlias(matchedDaily);
  if (!alias) return '';
  return `${formatGroupedCounts(nums)} ${alias.unit}`;
}

export function formatSetsLabel(sets: SetEntry[], weightType: number): string {
  if (sets.length === 0) return '';
  const grouped = groupSets(sets);
  if (weightType === 0) {
    return grouped.map((g) => (g.count > 1 ? `${g.reps}×${g.count}` : `${g.reps}`)).join(' / ') + ' повт.';
  }
  const allSameReps = sets.every((s) => s.reps === sets[0].reps);
  const weightsPart = grouped.map((g) => (g.count > 1 ? `${g.weight}кг×${g.count}` : `${g.weight}кг`)).join(' / ');
  if (allSameReps) return `${weightsPart} (${sets[0].reps} повт.)`;
  const repsPart = sets.map((s) => s.reps).join('/');
  return `${weightsPart} (${repsPart})`;
}

export function replaceLineExercise(text: string, lineIdx: number, exercise: Exercise): string {
  const lines = text.split('\n');
  if (lineIdx < 0 || lineIdx >= lines.length) return text;
  const oldLine = lines[lineIdx];
  const trailingSpaces = oldLine.match(/\s*$/)?.[0] || '';
  const trimmed = oldLine.trim();
  const listPrefix = trimmed.match(LIST_PREFIX_RE)?.[0] || '';
  const stripped = trimmed.replace(LIST_PREFIX_RE, '');
  const m = stripped.match(LINE_RE);
  let rebuilt: string;
  if (m) {
    const numsPart = m[2];
    const repsPart = m[3] ? `(${m[3]})` : '';
    rebuilt = `${listPrefix}${exercise.name} ${numsPart}${repsPart ? ' ' + repsPart : ''}`;
  } else {
    rebuilt = `${listPrefix}${exercise.name}`;
  }
  lines[lineIdx] = rebuilt + trailingSpaces;
  return lines.join('\n');
}
