export type HealthSource = 'WHO' | 'MZ_RF' | 'USPSTF' | 'JSHC' | 'CN_WST' | 'ESC';

export const SOURCE_LABELS: Record<HealthSource, string> = {
  WHO: 'ВОЗ',
  MZ_RF: 'МЗ РФ',
  USPSTF: 'USPSTF',
  JSHC: 'Япония',
  CN_WST: 'Китай',
  ESC: 'Европа',
};

export const HEALTH_SOURCES: HealthSource[] = ['WHO', 'MZ_RF', 'USPSTF', 'JSHC', 'CN_WST', 'ESC'];

export interface PresetMetric {
  name: string;
  unit: string;
  group: string;
  refs: { source: HealthSource; refMin?: number; refMax?: number; periodDays: number }[];
}

export const HEALTH_PRESETS: PresetMetric[] = [
  // ── Общий анализ крови ──
  { name: 'Гемоглобин', unit: 'г/л', group: 'Общий анализ крови', refs: [
    { source: 'WHO', refMin: 130, refMax: 170, periodDays: 365 },
    { source: 'MZ_RF', refMin: 130, refMax: 160, periodDays: 365 },
    { source: 'USPSTF', refMin: 135, refMax: 175, periodDays: 365 },
    { source: 'JSHC', refMin: 131, refMax: 172, periodDays: 365 },
    { source: 'CN_WST', refMin: 120, refMax: 160, periodDays: 365 },
    { source: 'ESC', refMin: 130, refMax: 170, periodDays: 365 },
  ]},
  { name: 'Эритроциты', unit: '×10¹²/л', group: 'Общий анализ крови', refs: [
    { source: 'WHO', refMin: 4.0, refMax: 5.5, periodDays: 365 },
    { source: 'MZ_RF', refMin: 4.0, refMax: 5.5, periodDays: 365 },
  ]},
  { name: 'Лейкоциты', unit: '×10⁹/л', group: 'Общий анализ крови', refs: [
    { source: 'WHO', refMin: 4.0, refMax: 9.0, periodDays: 365 },
    { source: 'MZ_RF', refMin: 4.0, refMax: 9.0, periodDays: 365 },
  ]},
  { name: 'Тромбоциты', unit: '×10⁹/л', group: 'Общий анализ крови', refs: [
    { source: 'WHO', refMin: 150, refMax: 400, periodDays: 365 },
    { source: 'MZ_RF', refMin: 180, refMax: 320, periodDays: 365 },
  ]},
  { name: 'СОЭ', unit: 'мм/ч', group: 'Общий анализ крови', refs: [
    { source: 'WHO', refMin: 2, refMax: 15, periodDays: 365 },
    { source: 'MZ_RF', refMin: 2, refMax: 10, periodDays: 365 },
  ]},
  { name: 'Гематокрит', unit: '%', group: 'Общий анализ крови', refs: [
    { source: 'WHO', refMin: 40, refMax: 50, periodDays: 365 },
  ]},

  // ── Биохимия ──
  { name: 'Глюкоза', unit: 'ммоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 3.9, refMax: 6.1, periodDays: 365 },
    { source: 'MZ_RF', refMin: 3.3, refMax: 5.5, periodDays: 365 },
    { source: 'USPSTF', refMin: 3.9, refMax: 5.6, periodDays: 1095 },
    { source: 'JSHC', refMin: 3.9, refMax: 5.5, periodDays: 365 },
    { source: 'CN_WST', refMin: 3.9, refMax: 6.1, periodDays: 365 },
    { source: 'ESC', refMin: 3.9, refMax: 5.6, periodDays: 365 },
  ]},
  { name: 'HbA1c', unit: '%', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 4.0, refMax: 6.0, periodDays: 365 },
    { source: 'USPSTF', refMin: 4.0, refMax: 5.7, periodDays: 1095 },
  ]},
  { name: 'Креатинин', unit: 'мкмоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 62, refMax: 115, periodDays: 365 },
    { source: 'MZ_RF', refMin: 62, refMax: 115, periodDays: 365 },
  ]},
  { name: 'Мочевина', unit: 'ммоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 2.5, refMax: 8.3, periodDays: 365 },
  ]},
  { name: 'Мочевая кислота', unit: 'мкмоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 210, refMax: 420, periodDays: 365 },
    { source: 'JSHC', refMin: 210, refMax: 360, periodDays: 365 },
    { source: 'CN_WST', refMin: 150, refMax: 416, periodDays: 365 },
  ]},
  { name: 'Билирубин общий', unit: 'мкмоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 3.4, refMax: 20.5, periodDays: 365 },
    { source: 'MZ_RF', refMin: 3.4, refMax: 20.5, periodDays: 365 },
  ]},
  { name: 'АЛТ', unit: 'Ед/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 0, refMax: 41, periodDays: 365 },
    { source: 'MZ_RF', refMin: 0, refMax: 41, periodDays: 365 },
  ]},
  { name: 'АСТ', unit: 'Ед/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 0, refMax: 40, periodDays: 365 },
    { source: 'MZ_RF', refMin: 0, refMax: 40, periodDays: 365 },
  ]},
  { name: 'ГГТ', unit: 'Ед/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 10, refMax: 71, periodDays: 365 },
  ]},
  { name: 'Общий белок', unit: 'г/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 64, refMax: 83, periodDays: 365 },
  ]},
  { name: 'СРБ', unit: 'мг/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 0, refMax: 5.0, periodDays: 365 },
  ]},
  { name: 'Ферритин', unit: 'мкг/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 20, refMax: 250, periodDays: 365 },
  ]},
  { name: 'Железо', unit: 'мкмоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 11.6, refMax: 31.3, periodDays: 365 },
  ]},
  { name: 'Калий', unit: 'ммоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 3.5, refMax: 5.1, periodDays: 365 },
  ]},
  { name: 'Натрий', unit: 'ммоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 136, refMax: 145, periodDays: 365 },
  ]},
  { name: 'Кальций', unit: 'ммоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 2.15, refMax: 2.55, periodDays: 365 },
  ]},
  { name: 'Магний', unit: 'ммоль/л', group: 'Биохимия', refs: [
    { source: 'WHO', refMin: 0.66, refMax: 1.07, periodDays: 365 },
  ]},

  // ── Липидный профиль ──
  { name: 'Холестерин общий', unit: 'ммоль/л', group: 'Липидный профиль', refs: [
    { source: 'WHO', refMin: 3.0, refMax: 5.2, periodDays: 365 },
    { source: 'MZ_RF', refMin: 3.0, refMax: 5.0, periodDays: 365 },
    { source: 'USPSTF', refMin: 3.0, refMax: 5.2, periodDays: 1825 },
    { source: 'JSHC', refMin: 3.1, refMax: 5.7, periodDays: 365 },
    { source: 'CN_WST', refMin: 2.8, refMax: 5.7, periodDays: 365 },
    { source: 'ESC', refMin: 3.0, refMax: 5.0, periodDays: 365 },
  ]},
  { name: 'ЛПНП', unit: 'ммоль/л', group: 'Липидный профиль', refs: [
    { source: 'WHO', refMin: 0, refMax: 3.0, periodDays: 365 },
    { source: 'MZ_RF', refMin: 0, refMax: 3.0, periodDays: 365 },
    { source: 'USPSTF', refMin: 0, refMax: 3.4, periodDays: 1825 },
    { source: 'JSHC', refMin: 0, refMax: 3.5, periodDays: 365 },
    { source: 'CN_WST', refMin: 0, refMax: 3.4, periodDays: 365 },
    { source: 'ESC', refMin: 0, refMax: 2.6, periodDays: 365 },
  ]},
  { name: 'ЛПВП', unit: 'ммоль/л', group: 'Липидный профиль', refs: [
    { source: 'WHO', refMin: 1.0, refMax: 2.2, periodDays: 365 },
    { source: 'USPSTF', refMin: 1.0, refMax: 2.2, periodDays: 1825 },
    { source: 'JSHC', refMin: 1.0, refMax: 2.5, periodDays: 365 },
    { source: 'ESC', refMin: 1.0, refMax: 2.3, periodDays: 365 },
  ]},
  { name: 'Триглицериды', unit: 'ммоль/л', group: 'Липидный профиль', refs: [
    { source: 'WHO', refMin: 0, refMax: 1.7, periodDays: 365 },
    { source: 'USPSTF', refMin: 0, refMax: 1.7, periodDays: 1825 },
    { source: 'JSHC', refMin: 0, refMax: 1.7, periodDays: 365 },
    { source: 'ESC', refMin: 0, refMax: 1.5, periodDays: 365 },
  ]},

  // ── Щитовидная железа ──
  { name: 'ТТГ', unit: 'мМЕ/л', group: 'Щитовидная железа', refs: [
    { source: 'WHO', refMin: 0.4, refMax: 4.0, periodDays: 365 },
    { source: 'MZ_RF', refMin: 0.4, refMax: 4.0, periodDays: 365 },
  ]},
  { name: 'Т4 свободный', unit: 'пмоль/л', group: 'Щитовидная железа', refs: [
    { source: 'WHO', refMin: 9.0, refMax: 22.0, periodDays: 365 },
  ]},
  { name: 'Т3 свободный', unit: 'пмоль/л', group: 'Щитовидная железа', refs: [
    { source: 'WHO', refMin: 2.6, refMax: 5.7, periodDays: 730 },
  ]},
  { name: 'АТ-ТПО', unit: 'МЕ/мл', group: 'Щитовидная железа', refs: [
    { source: 'WHO', refMin: 0, refMax: 34, periodDays: 1095 },
  ]},

  // ── Гормоны ──
  { name: 'Тестостерон общий', unit: 'нмоль/л', group: 'Гормоны', refs: [
    { source: 'WHO', refMin: 12.0, refMax: 33.0, periodDays: 365 },
    { source: 'MZ_RF', refMin: 12.0, refMax: 33.0, periodDays: 365 },
  ]},
  { name: 'ГСПГ', unit: 'нмоль/л', group: 'Гормоны', refs: [
    { source: 'WHO', refMin: 18, refMax: 54, periodDays: 365 },
  ]},
  { name: 'Пролактин', unit: 'мМЕ/л', group: 'Гормоны', refs: [
    { source: 'WHO', refMin: 73, refMax: 407, periodDays: 730 },
  ]},
  { name: 'Кортизол', unit: 'нмоль/л', group: 'Гормоны', refs: [
    { source: 'WHO', refMin: 171, refMax: 536, periodDays: 730 },
  ]},
  { name: 'Инсулин', unit: 'мкМЕ/мл', group: 'Гормоны', refs: [
    { source: 'WHO', refMin: 2.6, refMax: 24.9, periodDays: 365 },
  ]},

  // ── Витамины ──
  { name: 'Витамин D (25-OH)', unit: 'нг/мл', group: 'Витамины', refs: [
    { source: 'WHO', refMin: 20, refMax: 100, periodDays: 365 },
    { source: 'MZ_RF', refMin: 30, refMax: 100, periodDays: 180 },
    { source: 'USPSTF', refMin: 20, refMax: 50, periodDays: 365 },
    { source: 'JSHC', refMin: 20, refMax: 80, periodDays: 365 },
    { source: 'ESC', refMin: 20, refMax: 100, periodDays: 365 },
  ]},
  { name: 'Витамин B12', unit: 'пг/мл', group: 'Витамины', refs: [
    { source: 'WHO', refMin: 191, refMax: 663, periodDays: 365 },
  ]},
  { name: 'Фолиевая кислота', unit: 'нг/мл', group: 'Витамины', refs: [
    { source: 'WHO', refMin: 3.1, refMax: 20.5, periodDays: 365 },
  ]},
  { name: 'Гомоцистеин', unit: 'мкмоль/л', group: 'Витамины', refs: [
    { source: 'WHO', refMin: 5.0, refMax: 15.0, periodDays: 365 },
  ]},

  // ── Онкомаркеры ──
  { name: 'ПСА общий', unit: 'нг/мл', group: 'Онкомаркеры', refs: [
    { source: 'MZ_RF', refMin: 0, refMax: 4.0, periodDays: 365 },
    { source: 'USPSTF', refMin: 0, refMax: 4.0, periodDays: 730 },
  ]},
  { name: 'РЭА', unit: 'нг/мл', group: 'Онкомаркеры', refs: [
    { source: 'WHO', refMin: 0, refMax: 5.0, periodDays: 730 },
  ]},
  { name: 'АФП', unit: 'МЕ/мл', group: 'Онкомаркеры', refs: [
    { source: 'WHO', refMin: 0, refMax: 10.0, periodDays: 730 },
  ]},

  // ── Инфекции ──
  { name: 'ВИЧ 1/2', unit: 'качеств.', group: 'Инфекции', refs: [
    { source: 'WHO', refMin: 0, refMax: 0, periodDays: 365 },
    { source: 'MZ_RF', refMin: 0, refMax: 0, periodDays: 365 },
    { source: 'USPSTF', refMin: 0, refMax: 0, periodDays: 365 },
  ]},
  { name: 'Гепатит B (HBsAg)', unit: 'качеств.', group: 'Инфекции', refs: [
    { source: 'MZ_RF', refMin: 0, refMax: 0, periodDays: 1095 },
    { source: 'USPSTF', refMin: 0, refMax: 0, periodDays: 1095 },
  ]},
  { name: 'Гепатит C (анти-HCV)', unit: 'качеств.', group: 'Инфекции', refs: [
    { source: 'MZ_RF', refMin: 0, refMax: 0, periodDays: 1095 },
    { source: 'USPSTF', refMin: 0, refMax: 0, periodDays: 0 },
  ]},
  { name: 'Сифилис (RPR)', unit: 'качеств.', group: 'Инфекции', refs: [
    { source: 'MZ_RF', refMin: 0, refMax: 0, periodDays: 365 },
  ]},

  // ── Коагулограмма ──
  { name: 'Фибриноген', unit: 'г/л', group: 'Коагулограмма', refs: [
    { source: 'WHO', refMin: 2.0, refMax: 4.0, periodDays: 365 },
  ]},
  { name: 'МНО', unit: '—', group: 'Коагулограмма', refs: [
    { source: 'WHO', refMin: 0.85, refMax: 1.15, periodDays: 365 },
  ]},
  { name: 'D-димер', unit: 'нг/мл', group: 'Коагулограмма', refs: [
    { source: 'WHO', refMin: 0, refMax: 500, periodDays: 730 },
  ]},
];

export const HEALTH_GROUPS = [
  'Общий анализ крови',
  'Биохимия',
  'Липидный профиль',
  'Щитовидная железа',
  'Гормоны',
  'Витамины',
  'Онкомаркеры',
  'Инфекции',
  'Коагулограмма',
];
