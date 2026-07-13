import { parseMessage, parseMessagesDetailed } from '../telegramParser';

describe('telegramParser locale-safe fields', () => {
  it('parses a decimal comma in /tx when semicolons delimit fields', () => {
    expect(parseMessage('/tx Карта; -5,6; Еда; кофе; капучино; 13.07.2026 01:30', 0)).toMatchObject({
      type: 'tx',
      account: 'Карта',
      amount: -5.6,
      category: 'Еда',
      tag: 'кофе',
      comment: 'капучино',
      date: '2026-07-13',
      time: '01:30',
    });
  });

  it('keeps unit, references, date and decimal commas in /health results', () => {
    expect(parseMessage('/health Глюкоза; 5,6; ммоль/л; 3,9; 6,1; 13.07.2026', 0)).toMatchObject({
      type: 'health',
      results: [{
        name: 'Глюкоза',
        value: 5.6,
        unit: 'ммоль/л',
        refMin: 3.9,
        refMax: 6.1,
        date: '2026-07-13',
      }],
    });
  });

  it('parses metric definitions and references with decimal commas', () => {
    expect(parseMessage('/health Глюкоза; ммоль/л; 3,9; 6,1', 0)).toMatchObject({
      type: 'health',
      metrics: [{ name: 'Глюкоза', unit: 'ммоль/л', refMin: 3.9, refMax: 6.1 }],
    });
    expect(parseMessage('/ref source:WHO\nГлюкоза; 3,9; 6,1; 365', 0)).toMatchObject({
      type: 'ref',
      source: 'WHO',
      refs: [{ name: 'Глюкоза', refMin: 3.9, refMax: 6.1, periodDays: 365 }],
    });
  });

  it('rejects impossible calendar dates and times', () => {
    expect(parseMessage('/flight KUF-SVO, 31.02.2026 10:00', 0)).toBeNull();
    expect(parseMessage('/flight KUF-SVO, 13.07.2026 25:00', 0)).toBeNull();
    expect(parseMessage('/tx Карта; -100; Еда; тест; чек; 31.02.2026', 0)).toBeNull();
    expect(parseMessage('/tx Карта; -100; Еда; тест; чек; 13.07.2026 25:00', 0)).toBeNull();
    expect(parseMessage('/task Позвонить, 31.02.2026', 0)).toBeNull();
    expect(parseMessage('/hotel Самара, Отель, 13.07.2026, 31.02.2026', 0)).toBeNull();
  });

  it('rejects extra datetime tokens and invalid date-like fields before a valid date', () => {
    expect(parseMessage('/flight KUF-SVO, 13.07.2026 10:00 лишнее', 0)).toBeNull();
    expect(parseMessage('/flight KUF-SVO, 31.02.2026, 13.07.2026', 0)).toBeNull();
    expect(parseMessage('/hotel Самара, Отель, 31.02.2026, 13.07.2026, 14.07.2026', 0)).toBeNull();
  });

  it('rejects invalid health dates instead of silently dropping them', () => {
    expect(parseMessage('/health Глюкоза; 5,6; ммоль/л; 3,9; 6,1; 31.02.2026', 0)).toBeNull();
    expect(parseMessage('/health Глюкоза; 5,6; 31.02.2026', 0)).toBeNull();
    expect(parseMessage('/health Глюкоза; 5,6\n31.02.2026', 0)).toBeNull();
    expect(parseMessagesDetailed('/health Глюкоза; 5,6; ммоль/л; 3,9; 6,1; 31.02.2026', 0).errors)
      .toEqual(['Команда содержит некорректные поля']);
  });

  it('supports an event end time on the departure date', () => {
    expect(parseMessage('/event Концерт, 13.07.2026 19:00, 22:30', 0)).toMatchObject({
      type: 'flight',
      kind: 'event',
      title: 'Концерт',
      departDate: '2026-07-13',
      departTime: '19:00',
      arriveDate: '2026-07-13',
      arriveTime: '22:30',
    });
  });

  it('parses decimal-comma travel prices only with unambiguous delimiters', () => {
    expect(parseMessage('/flight KUF-SVO; 13.07.2026 10:00; 12,5 EUR', 0)).toMatchObject({
      kind: 'flight',
      price: 12.5,
      currency: 'EUR',
    });
    expect(parseMessage('/hotel Самара; Отель; 13.07.2026; 14.07.2026; 1250,50 RUB', 0)).toMatchObject({
      kind: 'hotel',
      city: 'Самара',
      title: 'Отель',
      price: 1250.5,
      currency: 'RUB',
    });
    expect(parseMessage('/flight KUF-SVO, 13.07.2026, 12,5 EUR', 0)).toBeNull();
    expect(parseMessage('/hotel Самара, Отель, 13.07.2026, 14.07.2026, 1250,50 RUB', 0)).toBeNull();
  });

  it('reports every invalid line in a multi-transaction message', () => {
    const parsed = parseMessagesDetailed(
      '/tx Карта; -10; Еда\n/tx Карта; nope; Еда\n/tx Карта; -20; Еда',
      0,
    );
    expect(parsed.items).toHaveLength(2);
    expect(parsed.errors).toEqual(['Строка 2: некорректная /tx команда']);
  });
});
