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
  revolut_crypto: 'Revolut Crypto',
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
  const productIdx = header.findIndex((h) =>
    h === 'продукт' || h === 'product');

  if (dateIdx === -1 || amountIdx === -1) return [];

  const results: ParsedTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;
    // Only completed transactions
    if (stateIdx >= 0) {
      const state = String(row[stateIdx] || '').toLowerCase();
      if (state !== 'completed' && state !== 'выполнено') continue;
    }
    // Skip savings/deposit products (separate account)
    if (productIdx >= 0) {
      const product = String(row[productIdx] || '').toLowerCase();
      if (product.includes('депозит') || product.includes('savings') || product.includes('сбереж')) continue;
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

/**
 * Hellenic Bank (Eurobank) text parser.
 * Parses text copied from PDF bank statement.
 * Format: DD/MM  Description  Debit  Credit  ValueDate  Balance
 * Numbers: 10.983,88 (dot=thousands, comma=decimal)
 * Skips: BALANCE B/F, CARRIED FORWARD, T O T A L S
 */
function parseEurobankAmount(s: string): number | null {
  if (!s) return null;
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseEurobankLines(lines: string[]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  // Find statement year from header (e.g. "31/08/2023")
  let year = new Date().getFullYear().toString();
  for (const l of lines.slice(0, 30)) {
    const ym = l.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (ym) { year = ym[3]; break; }
  }

  // First pass: build transaction entries with multi-line descriptions
  interface RawTx { dd: string; mm: string; desc: string; amounts: number[] }
  const rawTxs: RawTx[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Skip only lines that can't be transactions (no DD/MM prefix)
    const hasDate = /^\d{2}\/\d{2}\s/.test(line);
    if (!hasDate) {
      if (lower.includes('balance b/f') || lower.includes('μεταφορα')) continue;
      if (lower.includes('carried forward')) continue;
      if (lower.includes('t o t a l')) continue;
      if (lower.includes('totals')) continue;
      if (lower.includes('statement of account') || lower.includes('κατασταση λογαριασμου')) continue;
      if (lower.includes('interest statement') || lower.includes('κατασταση τοκων')) continue;
      if (lower.includes('hellenic') || lower.includes('ελληνικ')) continue;
      if (lower.includes('service line') || lower.includes('εξυπηρετ')) continue;
    }

    // DD/MM line with amounts = transaction
    const m = line.match(/^(\d{2})\/(\d{2})\s+(.*)/);
    if (m) {
      const rest = m[3];
      const amounts = [...rest.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((am) => parseEurobankAmount(am[1])!);
      const desc = rest.substring(0, rest.search(/\d{1,3}(?:\.\d{3})*,\d{2}/) >= 0 ? rest.search(/\d{1,3}(?:\.\d{3})*,\d{2}/) : rest.length).trim();
      if (amounts.length >= 2) {
        rawTxs.push({ dd: m[1], mm: m[2], desc, amounts });
      } else if (amounts.length === 0 && desc) {
        // Date line with description only (no amounts) — description continues on next line
        // or this is a description-only line before amounts come on next DD/MM line
        rawTxs.push({ dd: m[1], mm: m[2], desc, amounts: [] });
      }
      continue;
    }

    // Non-date line: append as description to last transaction
    const trimmed = line.trim();
    if (trimmed && rawTxs.length > 0) {
      const last = rawTxs[rawTxs.length - 1];
      // Check if this line has amounts (continuation with amounts)
      const amounts = [...trimmed.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((am) => parseEurobankAmount(am[1])!);
      const textPart = trimmed.substring(0, trimmed.search(/\d{1,3}(?:\.\d{3})*,\d{2}/) >= 0 ? trimmed.search(/\d{1,3}(?:\.\d{3})*,\d{2}/) : trimmed.length).trim();
      if (textPart) last.desc = last.desc ? last.desc + ' ' + textPart : textPart;
      if (amounts.length > 0 && last.amounts.length === 0) last.amounts = amounts;
    }
  }

  // Second pass: convert to transactions using balance comparison
  let prevBalance: number | null = null;

  // Find opening balance from BALANCE B/F line
  for (const l of lines) {
    if (l.toLowerCase().includes('balance b/f') || l.toLowerCase().includes('μεταφορα')) {
      const amts = [...l.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)];
      if (amts.length > 0) { prevBalance = parseEurobankAmount(amts[amts.length - 1][1]); break; }
    }
  }

  for (const tx of rawTxs) {
    if (tx.amounts.length < 2) continue; // need amount + balance
    const txAmount = tx.amounts[0];
    const balance = tx.amounts[tx.amounts.length - 1];

    let amount: number;
    if (prevBalance != null) {
      amount = balance > prevBalance ? txAmount : -txAmount;
    } else {
      amount = -txAmount; // default debit
    }
    prevBalance = balance;

    const date = `${year}-${tx.mm}-${tx.dd}`;
    results.push({
      date,
      timestamp: `${date}T00:00:00`,
      amount,
      category: '',
      tag: '',
      comment: tx.desc || '(без описания)',
    });
  }
  return results;
}

function csvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' && !inQuotes) {
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\r' && !inQuotes) {
      // skip
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const RU_MONTHS: Record<string, string> = {
  'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'мая': '05', 'май': '05',
  'июн': '06', 'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12',
  'нояб': '11',
};

function parseRuDate(val: string): { date: string; timestamp: string } | null {
  // "22 нояб. 2023 г., 16:18:43" or "4 апр. 2024 г., 16:32:27"
  const s = val.trim();
  const m = s.match(/^(\d{1,2})\s+(\S+?)\.?\s+(\d{4})\s*г\.,?\s*(\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const monthStr = m[2].toLowerCase().replace('.', '');
  const month = RU_MONTHS[monthStr];
  if (!month) return null;
  const year = m[3];
  const time = m[4].length === 5 ? m[4] + ':00' : m[4];
  const date = `${year}-${month}-${day}`;
  return { date, timestamp: `${date}T${time}` };
}

function parseRuAmount(val: string): number | null {
  // "3 107,00€" or "23,88 GEL" or "3 370,018163"
  const s = val.replace(/[€$₽]/g, '').replace(/[A-Z]{3}/g, '').trim();
  const cleaned = s.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Revolut Crypto CSV (Russian locale)
 * Headers: Symbol, Type, Quantity, Price, Value, Fees, Date
 * Types: Покупка, Продажа, Отправка, Получение, Платеж
 */
function parseRevolutCrypto(rows: any[][]): ParsedTransaction[] {
  const header = rows[0]?.map((h: any) => String(h || '').toLowerCase().trim()) || [];
  const symbolIdx = header.findIndex((h) => h === 'symbol');
  const typeIdx = header.findIndex((h) => h === 'type' || h === 'тип');
  const qtyIdx = header.findIndex((h) => h === 'quantity' || h === 'количество');
  const priceIdx = header.findIndex((h) => h === 'price' || h === 'цена');
  const feeIdx = header.findIndex((h) => h === 'fees' || h === 'комиссия');
  const dateIdx = header.findIndex((h) => h === 'date' || h === 'дата');

  // Debug info as first transaction
  const firstRow = rows[1];
  const debugDate = firstRow ? String(firstRow[dateIdx] ?? 'UNDEF') : 'NO_ROW';
  const debugQty = firstRow ? String(firstRow[qtyIdx] ?? 'UNDEF') : 'NO_ROW';
  const testDate = firstRow ? parseRuDate(debugDate) : null;
  const testQty = firstRow ? parseRuAmount(debugQty) : null;
  const debugTx: ParsedTransaction = {
    date: '0000-00-00', timestamp: '0000-00-00T00:00:00',
    amount: 0, category: 'DEBUG', tag: '',
    comment: `hdr=[${header.join('|')}] di=${dateIdx} qi=${qtyIdx} d="${debugDate.substring(0, 30)}" q="${debugQty.substring(0, 15)}" td=${!!testDate} tq=${testQty} rows=${rows.length} cols=${firstRow?.length}`,
  };

  if (dateIdx === -1 || qtyIdx === -1) return [debugTx];

  const results: ParsedTransaction[] = [debugTx];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;
    const dt = parseRuDate(String(row[dateIdx])) || parseDate(row[dateIdx]);
    if (!dt) continue;

    const symbol = symbolIdx >= 0 ? String(row[symbolIdx] || '') : '';
    const type = typeIdx >= 0 ? String(row[typeIdx] || '') : '';
    const qty = parseRuAmount(String(row[qtyIdx] || ''));
    if (qty == null) continue;

    // Determine sign: Покупка/Получение = incoming (+), Продажа/Отправка/Платеж = outgoing (-)
    const typeLower = type.toLowerCase();
    const isOutgoing = typeLower.includes('продажа') || typeLower.includes('отправка')
      || typeLower.includes('платеж') || typeLower === 'sell' || typeLower === 'send' || typeLower === 'payment';
    const amount = isOutgoing ? -qty : qty;

    results.push({
      date: dt.date,
      timestamp: dt.timestamp,
      amount,
      category: type,
      tag: symbol,
      comment: `${type} ${qty} ${symbol}`,
    });

    // Fee as separate transaction (convert from fiat to crypto via price)
    if (feeIdx >= 0 && priceIdx >= 0) {
      const feeStr = String(row[feeIdx] || '');
      const fee = parseRuAmount(feeStr);
      const price = parseRuAmount(String(row[priceIdx] || ''));
      if (fee && fee > 0 && price && price > 0) {
        const feeInCrypto = fee / price;
        results.push({
          date: dt.date,
          timestamp: dt.timestamp,
          amount: -parseFloat(feeInCrypto.toFixed(6)),
          category: 'Комиссия',
          tag: symbol,
          comment: `Комиссия ${symbol}`,
        });
      }
    }
  }
  return results;
}

export function parseBankFile(content: string, bank: BankType): ParsedTransaction[] {
  if (bank === 'eurobank') {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    return parseEurobankLines(lines);
  }

  const rows = csvToRows(content);
  if (!rows.length) return [];

  switch (bank) {
    case 'revolut': return parseRevolut(rows);
    case 'revolut_crypto': return parseRevolutCrypto(rows);
    default: return [];
  }
}
