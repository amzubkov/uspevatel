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

/** Revolut XLSX: Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance */
function parseRevolut(rows: any[][]): ParsedTransaction[] {
  const header = rows[0]?.map((h: any) => String(h || '').toLowerCase().trim()) || [];
  const dateIdx = header.findIndex((h) => h.includes('started') || h.includes('completed') || h === 'date');
  const amountIdx = header.findIndex((h) => h === 'amount');
  const descIdx = header.findIndex((h) => h === 'description' || h === 'desc');
  const typeIdx = header.findIndex((h) => h === 'type');
  const stateIdx = header.findIndex((h) => h === 'state');

  if (dateIdx === -1 || amountIdx === -1) return [];

  const results: ParsedTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;
    // Skip failed/reverted
    if (stateIdx >= 0) {
      const state = String(row[stateIdx] || '').toLowerCase();
      if (state === 'failed' || state === 'reverted' || state === 'declined') continue;
    }
    const dt = parseDate(row[dateIdx]);
    const amount = parseAmount(row[amountIdx]);
    if (!dt || amount == null) continue;
    const type = typeIdx >= 0 ? String(row[typeIdx] || '') : '';
    const desc = descIdx >= 0 ? String(row[descIdx] || '') : '';
    results.push({
      date: dt.date,
      timestamp: dt.timestamp,
      amount,
      category: type,
      tag: '',
      comment: desc,
    });
  }
  return results;
}

/** Eurobank XLSX: tries common column names */
function parseEurobank(rows: any[][]): ParsedTransaction[] {
  const header = rows[0]?.map((h: any) => String(h || '').toLowerCase().trim()) || [];

  // Try to find columns by common Greek/English Eurobank headers
  const dateIdx = header.findIndex((h) =>
    h.includes('date') || h.includes('ημερομηνία') || h.includes('ημ/νία') || h.includes('trans'));
  const amountIdx = header.findIndex((h) =>
    h.includes('amount') || h.includes('ποσό') || h.includes('ποσον'));
  // Sometimes debit/credit separate columns
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

export function parseXlsx(base64: string, bank: BankType): ParsedTransaction[] {
  const wb = XLSX.read(base64, { type: 'base64' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return [];

  switch (bank) {
    case 'revolut': return parseRevolut(rows);
    case 'eurobank': return parseEurobank(rows);
    default: return [];
  }
}
