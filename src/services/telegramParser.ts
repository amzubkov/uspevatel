export interface ParsedTask {
  type: 'task';
  subject: string;
  project?: string;
  deadline?: string; // YYYY-MM-DD
  photoFileId?: string;
  msgDate: number;   // unix ts from telegram
}

export interface ParsedFlight {
  type: 'flight';
  kind: 'flight' | 'hotel' | 'event';
  title: string;       // SVO-KUF or hotel name
  city?: string;       // city for hotels
  flightNumber?: string; // SU1234
  departDate: string;  // YYYY-MM-DD (check-in for hotel)
  departTime?: string; // HH:MM
  arriveDate?: string; // (check-out for hotel)
  arriveTime?: string;
  notes?: string;
  price?: number;
  currency?: string;
  photoFileId?: string;
  docFileId?: string;
  docFileName?: string;
  docMimeType?: string;
  msgDate: number;
}

export interface ParsedDoc {
  type: 'doc';
  name: string;
  photoFileId?: string;
  docFileId?: string;   // telegram document (PDF etc)
  docFileName?: string;
  docMimeType?: string;
  msgDate: number;
}

export interface ParsedHealth {
  type: 'health';
  results: { name: string; value: number; unit?: string; refMin?: number; refMax?: number; date?: string }[];
  metrics: { name: string; unit: string; refMin?: number; refMax?: number }[];
  date?: string;
  msgDate: number;
}

export interface ParsedRef {
  type: 'ref';
  source: string;
  refs: { name: string; refMin?: number; refMax?: number; periodDays?: number }[];
  msgDate: number;
}

export interface ParsedTx {
  type: 'tx';
  account: string;   // account name (must match existing)
  amount: number;     // negative = expense, positive = income
  category: string;
  tag: string;
  comment: string;
  date?: string;      // YYYY-MM-DD, defaults to today
  time?: string;      // HH:MM
  msgDate: number;
}

export interface ParsedNote {
  type: 'note';
  text: string;
  tags: string[];
  photoFileId?: string;
  msgDate: number;
}

export interface ParsedDoctor {
  type: 'doctor';
  url: string;
  msgDate: number;
}

export type ParsedItem = ParsedTask | ParsedFlight | ParsedDoc | ParsedHealth | ParsedRef | ParsedTx | ParsedNote | ParsedDoctor;

// Normalise date: "14.04.2026" → "2026-04-14", "2026-04-14" stays as is
function isCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function normaliseDate(s: string): string | null {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    return isCalendarDate(y, m, d) ? s : null;
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (isCalendarDate(year, month, day)) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
  }
  return null;
}

// Parse "14.04.2026 14:30" or "2026-04-14 14:30" or just date
function parseDatetime(s: string): { date: string; time?: string } | null {
  const parts = s.trim().split(/\s+/);
  if (parts.length > 2) return null;
  const date = normaliseDate(parts[0]);
  if (!date) return null;
  const time = parts[1] ? normaliseTime(parts[1]) : undefined;
  if (parts[1] && !time) return null;
  return { date, time: time || undefined };
}

function normaliseTime(s: string): string | null {
  const timeMatch = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch || Number(timeMatch[1]) > 23 || Number(timeMatch[2]) > 59) return null;
  return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
}

function looksLikeDateOrTime(value: string): boolean {
  return /^\d{1,4}[.-]\d{1,2}(?:[.-]\d{1,4})?(?:\s|$)/.test(value.trim())
    || /^\d{1,2}:\d{2}(?:\s|$)/.test(value.trim());
}

// Semicolon/tab is the unambiguous format and preserves locale decimal commas.
// Comma-only input remains supported for backwards compatibility.
function splitFields(value: string): string[] {
  const delimiter = value.includes(';') ? /;/ : value.includes('\t') ? /\t/ : /,/;
  return value.split(delimiter).map((part) => part.trim());
}

function parseLocaleNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Parse text (or caption) + optional photo
export function parseMessage(text: string, msgDate: number, photoFileId?: string, docFileId?: string, docFileName?: string, docMimeType?: string): ParsedItem | null {
  const trimmed = text.trim();

  // Auto-detect prodoctorov.ru link in any message — create a Doctor contact
  const proDoctorMatch = trimmed.match(/https?:\/\/(?:[a-z0-9-]+\.)*prodoctorov\.ru\/[^\s]*/i);
  if (proDoctorMatch) {
    return { type: 'doctor', url: proDoctorMatch[0], msgDate };
  }

  // /task [project:XXX] <subject>[, <deadline>]
  const taskMatch = trimmed.match(/^\/task\s+(.+)/i);
  if (taskMatch) {
    let body = taskMatch[1].trim();
    // Extract project:XXX
    let project: string | undefined;
    const projMatch = body.match(/^project:(\S+)\s+/i);
    if (projMatch) {
      project = projMatch[1];
      body = body.substring(projMatch[0].length).trim();
    }
    const lastComma = body.lastIndexOf(',');
    if (lastComma > 0) {
      const maybeDateStr = body.substring(lastComma + 1).trim();
      const dt = parseDatetime(maybeDateStr);
      if (dt) {
        return { type: 'task', subject: body.substring(0, lastComma).trim(), project, deadline: dt.date, photoFileId, msgDate };
      }
      if (looksLikeDateOrTime(maybeDateStr)) return null;
    }
    return { type: 'task', subject: body, project, photoFileId, msgDate };
  }

  // /flight <route>, <depart_date> [time][, <arrive_date> [time]]
  // /hotel <city>, <name>, <check-in>, <check-out>  OR  /hotel <name>, <check-in>, <check-out>
  // /event <name>, <date> [time][, <end_time>]
  const flightMatch = trimmed.match(/^\/flight\s+(.+)/i);
  const hotelMatch = trimmed.match(/^\/hotel\s+(.+)/i);
  const eventMatch = trimmed.match(/^\/event\s+(.+)/i);
  if (flightMatch || hotelMatch || eventMatch) {
    const isHotel = !!hotelMatch;
    const isEvent = !!eventMatch;
    const body = (flightMatch || hotelMatch || eventMatch)![1];
    const parts = splitFields(body);
    if (parts.length < 2) return null;
    let dateIdx = -1;
    for (let i = 1; i < parts.length; i++) {
      if (parseDatetime(parts[i])) { dateIdx = i; break; }
      // Do not silently absorb an invalid date into the route/hotel name and
      // then accept a later valid date.
      if (looksLikeDateOrTime(parts[i])) return null;
    }
    if (dateIdx === -1) return null;

    let title: string;
    let city: string | undefined;
    if ((isHotel || isEvent) && dateIdx >= 2) {
      city = parts.slice(0, dateIdx - 1).join(', ').trim();
      title = parts[dateIdx - 1].trim();
    } else {
      title = parts.slice(0, dateIdx).join(', ').trim();
    }
    const depart = parseDatetime(parts[dateIdx]);
    if (!depart || !title) return null;
    const arriveCandidate = parts[dateIdx + 1];
    let arrive = arriveCandidate ? parseDatetime(arriveCandidate) : undefined;
    if (isEvent && arriveCandidate && !arrive) {
      const endTime = normaliseTime(arriveCandidate);
      if (endTime) arrive = { date: depart.date, time: endTime };
    }
    if (arriveCandidate && !arrive && looksLikeDateOrTime(arriveCandidate)) return null;
    if (isHotel && !arrive) return null;
    // Everything after dates: check for fn:XXX (flight number), price, rest goes to notes
    const notesStartIdx = dateIdx + (arrive ? 2 : 1);
    const tail = parts.slice(notesStartIdx);
    let price: number | undefined;
    let currency: string | undefined;
    let flightNumber: string | undefined;
    const notesParts: string[] = [];
    for (const p of tail) {
      const fnMatch = p.match(/^fn:(.+)$/i);
      if (fnMatch && !flightNumber) {
        flightNumber = fnMatch[1].trim().toUpperCase();
        continue;
      }
      const priceMatch = p.match(/^(\d+(?:[.,]\d+)?)\s*([€₽]|EUR|RUB)?$/i);
      if (priceMatch && price == null) {
        price = parseLocaleNumber(priceMatch[1]);
        const cur = (priceMatch[2] || '').toUpperCase();
        currency = cur === '₽' || cur === 'RUB' ? 'RUB' : cur === '€' || cur === 'EUR' ? 'EUR' : undefined;
      } else if (priceMatch) {
        // In comma-delimited legacy input, a locale decimal such as 12,5 is
        // split into two price-looking fields. Reject it instead of importing
        // the corrupted integer part; semicolon/tab input is unambiguous.
        return null;
      } else {
        notesParts.push(p);
      }
    }
    const notes = notesParts.join(', ').trim() || undefined;
    return { type: 'flight', kind: isEvent ? 'event' : isHotel ? 'hotel' : 'flight', title, city, flightNumber, departDate: depart.date, departTime: depart.time, arriveDate: arrive?.date, arriveTime: arrive?.time, notes, price, currency, photoFileId, docFileId, docFileName, docMimeType, msgDate };
  }

  // /doc <name> (with optional photo or document attached)
  const docMatch = trimmed.match(/^\/doc\s+(.+)/i);
  if (docMatch) {
    return { type: 'doc', name: docMatch[1].trim(), photoFileId, docFileId, docFileName, docMimeType, msgDate };
  }

  // /note [#tag1 #tag2 ...] text
  const noteMatch = trimmed.match(/^\/note\s+(.+)/is);
  if (noteMatch) {
    const body = noteMatch[1].trim();
    const tags: string[] = [];
    const tagMatches = body.matchAll(/#(\S+)/g);
    for (const tm of tagMatches) tags.push(tm[1].toLowerCase());
    const text = body.replace(/#\S+/g, '').trim();
    return { type: 'note', text, tags, photoFileId, msgDate };
  }

  // /tx <account>; <amount>[; <category>[; <tag>[; <comment>[; <date>]]]]
  // Commas are still accepted as legacy field separators, but use semicolons
  // whenever a number itself contains a decimal comma.
  // amount: "150" or "-150" or "+150", negative = expense by default
  const txMatch = trimmed.match(/^\/tx\s+(.+)/i);
  if (txMatch) {
    const parts = splitFields(txMatch[1]);
    if (parts.length >= 2) {
      const account = parts[0];
      const amountStr = parts[1].replace(/\s/g, '');
      const num = parseLocaleNumber(amountStr);
      if (num != null && account) {
        // -amount = expense, +amount or no sign = income
        const amount = amountStr.startsWith('-') ? -Math.abs(num) : Math.abs(num);
        const category = parts[2]?.trim() || '';
        const tag = parts[3]?.trim() || '';
        const comment = parts[4]?.trim() || '';
        const dateStr = parts[5]?.trim();
        const dt = dateStr ? parseDatetime(dateStr) : undefined;
        if (dateStr && !dt) return null;
        return { type: 'tx', account, amount, category, tag, comment, date: dt?.date, time: dt?.time, msgDate };
      }
    }
  }

  // /health - multi-line: each line "name; value[; unit; refMin; refMax; date]"
  // Semicolons preserve decimal commas. Legacy comma-separated lines are accepted.
  // optional last line with date (YYYY-MM-DD or DD.MM.YYYY)
  const healthMatch = trimmed.match(/^\/health\s+([\s\S]+)/i);
  if (healthMatch) {
    const lines = healthMatch[1].split('\n').map((l) => l.trim()).filter(Boolean);
    const results: ParsedHealth['results'] = [];
    const metrics: ParsedHealth['metrics'] = [];
    let date: string | undefined;
    for (const line of lines) {
      if (line === '---') continue;
      const parts = splitFields(line);
      const maybeDate = normaliseDate(parts[0]);
      if (maybeDate && parts.length === 1) { date = maybeDate; continue; }
      if (parts.length === 1 && looksLikeDateOrTime(parts[0])) return null;
      if (parts.length < 2) continue;
      const maybeValue = parseLocaleNumber(parts[1]);
      if (maybeValue != null) {
        // Legacy third field may be a date; otherwise it is the unit.
        const legacyDate = parts[2] ? normaliseDate(parts[2]) : null;
        if (parts[2] && looksLikeDateOrTime(parts[2]) && !legacyDate) return null;
        const refMin = legacyDate ? undefined : parseLocaleNumber(parts[3]);
        const refMax = legacyDate ? undefined : parseLocaleNumber(parts[4]);
        const explicitDate = parts[5] ? normaliseDate(parts[5]) : null;
        if (parts[5] && !explicitDate) return null;
        const inlineDate = legacyDate || explicitDate;
        results.push({
          name: parts[0],
          value: maybeValue,
          unit: legacyDate ? undefined : (parts[2] || undefined),
          refMin,
          refMax,
          date: inlineDate || undefined,
        });
      } else {
        // Metric def: name, unit, refMin, refMax
        const refMin = parseLocaleNumber(parts[2]);
        const refMax = parseLocaleNumber(parts[3]);
        metrics.push({ name: parts[0], unit: parts[1], refMin, refMax });
      }
    }
    if (results.length > 0 || metrics.length > 0) {
      return { type: 'health', results, metrics, date, msgDate };
    }
  }

  // /ref source:XXX — update reference values
  // lines: name; refMin; refMax[; periodDays]
  const refMatch = trimmed.match(/^\/ref\s+([\s\S]+)/i);
  if (refMatch) {
    const lines = refMatch[1].split('\n').map((l) => l.trim()).filter(Boolean);
    let source = '';
    const refs: ParsedRef['refs'] = [];
    for (const line of lines) {
      const srcMatch = line.match(/^source:(\S+)$/i);
      if (srcMatch) { source = srcMatch[1].toUpperCase(); continue; }
      const parts = splitFields(line);
      if (parts.length < 3) continue;
      const refMin = parseLocaleNumber(parts[1]);
      const refMax = parseLocaleNumber(parts[2]);
      const periodDays = parts[3] ? parseInt(parts[3]) : undefined;
      if (refMin == null || refMax == null) continue;
      refs.push({ name: parts[0], refMin, refMax, periodDays: isNaN(periodDays as any) ? undefined : periodDays });
    }
    if (source && refs.length > 0) {
      return { type: 'ref', source, refs, msgDate };
    }
  }

  return null;
}

/** Parse a message that may contain multiple /tx lines. Returns array of items. */
export function parseMessages(text: string, msgDate: number, photoFileId?: string, docFileId?: string, docFileName?: string, docMimeType?: string): ParsedItem[] {
  return parseMessagesDetailed(text, msgDate, photoFileId, docFileId, docFileName, docMimeType).items;
}

export interface ParsedMessagesResult {
  items: ParsedItem[];
  errors: string[];
}

/** Parse every command and retain per-line errors instead of silently dropping them. */
export function parseMessagesDetailed(text: string, msgDate: number, photoFileId?: string, docFileId?: string, docFileName?: string, docMimeType?: string): ParsedMessagesResult {
  const lines = text.trim().split('\n');
  const txLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\/tx\s+/i.test(line.trim()));
  if (txLines.length > 1) {
    const results: ParsedItem[] = [];
    const errors: string[] = [];
    for (const { line, index } of txLines) {
      const item = parseMessage(line, msgDate);
      if (item) results.push(item);
      else errors.push(`Строка ${index + 1}: некорректная /tx команда`);
    }
    return { items: results, errors };
  }
  const item = parseMessage(text, msgDate, photoFileId, docFileId, docFileName, docMimeType);
  const isKnownCommand = /^\/(?:task|flight|hotel|event|doc|note|tx|health|ref)\b/i.test(text.trim());
  return { items: item ? [item] : [], errors: !item && isKnownCommand ? ['Команда содержит некорректные поля'] : [] };
}
