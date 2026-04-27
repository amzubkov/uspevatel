import * as XLSX from 'xlsx';
import { BankType } from '../store/moneyStore';

export interface ParsedTransaction {
  date: string;       // YYYY-MM-DD
  timestamp: string;  // YYYY-MM-DDTHH:MM:SS
  amount: number;     // negative = expense, positive = income
  category: string;
  tag: string;
  comment: string;
}

export const BANK_LABELS: Record<string, string> = {
  revolut: 'Revolut',
  eurobank: 'Eurobank',
};

function excelDateToISO(serial: number): string {
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return d.toISOString().substring(0, 10);
}

function parseDate(val: any): { date: string; timestamp: string } | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = excelDateToISO(val);
    return { date: d, timestamp: `${d}T00:00:00` };
  }
  const s = String(val).trim();
  // YYYY-MM-DD HH:MM:SS or YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
  if (isoMatch) {
    const date = isoMatch[1];
    const time = isoMatch[2] || '00:00:00';
    return { date, timestamp: `${date}T${time.length === 5 ? time + ':00' : time}` };
  }
  // DD/MM/YYYY or DD.MM.YYYY
  const euMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (euMatch) {
    const date = `${euMatch[3]}-${euMatch[2].padStart(2, '0')}-${euMatch[1].padStart(2, '0')}`;
    const time = euMatch[4] || '00:00:00';
    return { date, timestamp: `${date}T${time.length === 5 ? time + ':00' : time}` };
  }
  return null;
}

function parseAmount(val: any): number | null {
  if (typeof val === 'number') return val;
  if (!val) return null;
  const s = String(val).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Revolut CSV/XLSX (Russian locale)
 * Headers: Тип, Продукт, Дата начала, Дата выполнения, Описание, Сумма, Комиссия, Валюта, State, Остаток средств
 * English: Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance
 */
function parseRevolut(rows: any[][]): ParsedTransaction[] {
  const header = rows[0]?.map((h: any) => String(h || '').toLowerCase().trim()) || [];

  // Support both Russian and English headers
  const dateIdx = header.findIndex((h) =>
    h.includes('дата начала') || h.includes('started') || h === 'date');
  const amountIdx = header.findIndex((h) =>
    h === 'сумма' || h === 'amount');
  const feeIdx = header.findIndex((h) =>
    h === 'комиссия' || h === 'fee');
  const descIdx = header.findIndex((h) =>
    h === 'описание' || h === 'description');
  const stateIdx = header.findIndex((h) =>
    h === 'state' || h === 'статус');

  if (dateIdx === -1 || amountIdx === -1) return [];

  const results: ParsedTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;
    // Skip failed/reverted
    if (stateIdx >= 0) {
      const state = String(row[stateIdx] || '').toLowerCase();
      if (state === 'failed' || state === 'reverted' || state === 'declined'
        || state === 'отменено' || state === 'неудачно') continue;
    }
    const dt = parseDate(row[dateIdx]);
    const amount = parseAmount(row[amountIdx]);
    if (!dt || amount == null) continue;
    const desc = descIdx >= 0 ? String(row[descIdx] || '') : '';
    results.push({
      date: dt.date,
      timestamp: dt.timestamp,
      amount,
      category: '',
      tag: '',
      comment: desc,
    });
    // Fee as separate transaction
    if (feeIdx >= 0) {
      const fee = parseAmount(row[feeIdx]);
      if (fee && fee > 0) {
        results.push({
          date: dt.date,
          timestamp: dt.timestamp,
          amount: -fee,
          category: 'Комиссия',
          tag: '',
          comment: desc,
        });
      }
    }
  }
  return results;
}

/** Eurobank XLSX: tries common column names */
function parseEurobank(rows: any[][]): ParsedTransaction[] {
  const header = rows[0]?.map((h: any) => String(h || '').toLowerCase().trim()) || [];

  const dateIdx = header.findIndex((h) =>
    h.includes('date') || h.includes('ημερομηνία') || h.includes('ημ/νία') || h.includes('trans'));
  const amountIdx = header.findIndex((h) =>
    h.includes('amount') || h.includes('ποσό') || h.includes('ποσον'));
  const debitIdx = header.findIndex((h) => h.includes('debit') || h.includes('χρέωση'));
  const creditIdx = header.findIndex((h) => h.includes('credit') || h.includes('πίστωση'));
  const descIdx = header.findIndex((h) =>
    h.includes('description') || h.includes('περιγραφή') || h.includes('αιτιολογία'));

  const hasDebitCredit = debitIdx >= 0 && creditIdx >= 0;
  if (dateIdx === -1 || (amountIdx === -1 && !hasDebitCredit)) return [];

  const results: ParsedTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;
    const dt = parseDate(row[dateIdx]);
    if (!dt) continue;
    let amount: number | null;
    if (hasDebitCredit) {
      const debit = parseAmount(row[debitIdx]);
      const credit = parseAmount(row[creditIdx]);
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
      else continue;
    } else {
      amount = parseAmount(row[amountIdx]);
    }
    if (amount == null) continue;
    const desc = descIdx >= 0 ? String(row[descIdx] || '') : '';
    results.push({
      date: dt.date,
      timestamp: dt.timestamp,
      amount,
      category: '',
      tag: '',
      comment: desc,
    });
  }
  return results;
}

function csvToRows(text: string): any[][] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (ch === '\r' && !inQuotes) {
      // skip
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cell += '"'; i++; }
        else q = !q;
      } else if (ch === ',' && !q) {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells;
  });
}

export function parseBankFile(content: string, bank: BankType, isXlsx: boolean): ParsedTransaction[] {
  let rows: any[][];
  if (isXlsx) {
    const wb = XLSX.read(content, { type: 'base64' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  } else {
    rows = csvToRows(content);
  }
  if (!rows.length) return [];

  switch (bank) {
    case 'revolut': return parseRevolut(rows);
    case 'eurobank': return parseEurobank(rows);
    default: return [];
  }
}
