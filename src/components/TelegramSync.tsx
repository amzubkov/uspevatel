import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';
import { useSettingsStore } from '../store/settingsStore';
import { useTaskStore } from '../store/taskStore';
import { reconcileFlightReminder, useFlightStore } from '../store/flightStore';
import { useDocumentStore } from '../store/documentStore';
import { useHealthStore } from '../store/healthStore';
import { colors } from '../utils/theme';
import { useAttachmentStore } from '../store/attachmentStore';
import { insertLedgerTransaction, useMoneyStore } from '../store/moneyStore';
import { useNoteStore } from '../store/noteStore';
import { useDoctorContactStore } from '../store/doctorContactStore';
import { fetchProdoctorov } from '../utils/prodoctorovParser';
import { fetchUpdates, getFileUrl, sendMessage, TgUpdate } from '../services/telegramService';
import { getSecret } from '../services/secrets';
import { isValidDateStr, toDateStr } from '../utils/date';
import { parseMessagesDetailed, ParsedItem } from '../services/telegramParser';
import { useExerciseStore } from '../store/exerciseStore';

interface SelectableItem {
  item: ParsedItem;
  updateId: number;
  itemIndex: number;
  selected: boolean;
}

interface InboxRow {
  update_id: number;
  item_index: number;
  payload: string;
}

const TELEGRAM_DOWNLOAD_TIMEOUT_MS = 30_000;

class StaleTelegramSessionError extends Error {
  constructor() {
    super('Telegram session was reset');
    this.name = 'StaleTelegramSessionError';
  }
}

function telegramEntityId(si: Pick<SelectableItem, 'updateId' | 'itemIndex'>, suffix = ''): string {
  return `telegram-${si.updateId}-${si.itemIndex}${suffix ? `-${suffix}` : ''}`;
}

async function responseToBase64(res: Response): Promise<string> {
  if (!res.ok) throw new Error(`Telegram file download failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('Telegram file has invalid encoding'));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Telegram file read failed'));
    reader.readAsDataURL(blob);
  });
}

async function downloadTgFile(token: string, fileId: string, subdir: string, fileName: string): Promise<string> {
  const fileUrl = await getFileUrl(token, fileId);
  const dir = new Directory(getImageBaseDir(), subdir);
  if (!dir.exists) dir.create();
  const dest = new File(dir, fileName);
  const existedBefore = dest.exists;
  const temp = new File(dir, `.telegram-${Crypto.randomUUID()}.download`);
  let backup: File | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(fileUrl, { signal: controller.signal });
    const base64 = await responseToBase64(response);
    if (controller.signal.aborted) throw new Error('Telegram file download aborted');
    temp.write(base64, { encoding: 'base64' });
    if (!temp.exists) throw new Error(`Telegram file was not prepared: ${fileName}`);
    if (dest.exists) {
      backup = new File(dir, `.telegram-${Crypto.randomUUID()}.backup`);
      dest.move(backup);
    }
    temp.move(dest);
    if (!dest.exists) throw new Error(`Telegram file was not written: ${fileName}`);
    if (backup?.exists) backup.delete();
    return `${subdir}/${fileName}`;
  } catch (error) {
    if (temp.exists) {
      try { temp.delete(); } catch {}
    }
    if (backup?.exists) {
      try {
        if (dest.exists) dest.delete();
        backup.move(dest);
      } catch (restoreError) {
        console.warn('Telegram file rollback failed:', restoreError);
      }
    } else if (!existedBefore && dest.exists) {
      try { dest.delete(); } catch {}
    }
    if (controller.signal.aborted) {
      throw new Error(`Загрузка файла Telegram превысила ${TELEGRAM_DOWNLOAD_TIMEOUT_MS / 1000} с`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// /plan argument: "завтра", "вчера", DD.MM, YYYY-MM-DD; default today
function parsePlanDateArg(arg?: string): string | null {
  const now = new Date();
  const a = (arg || '').trim().toLowerCase();
  if (!a || a === 'сегодня') return toDateStr(now);
  if (a === 'завтра') return toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (a === 'вчера') return toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const iso = a.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isValidDateStr(a) ? a : null;
  const dm = a.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (dm) {
    const y = dm[3] ? parseInt(dm[3]) : now.getFullYear();
    const value = `${y}-${String(parseInt(dm[2])).padStart(2, '0')}-${String(parseInt(dm[1])).padStart(2, '0')}`;
    return isValidDateStr(value) ? value : null;
  }
  return null;
}

function fmtW(w: number): string {
  return w % 1 ? String(w) : String(Math.round(w));
}

async function buildPlanReply(date: string): Promise<string> {
  const st = useExerciseStore.getState();
  if (!st.loaded) await st.load();
  const { plan, exercises, logs } = useExerciseStore.getState();
  const dayPlan = plan.filter((p) => p.date === date);
  const [y, m, d] = date.split('-');
  const dateLabel = `${d}.${m}.${y}`;
  if (dayPlan.length === 0) return `📋 План на ${dateLabel} пуст`;

  const lines: string[] = [`📋 План на ${dateLabel}:`, ''];
  let done = 0;
  for (const p of dayPlan) {
    const ex = exercises.find((e) => e.id === p.exerciseId);
    if (!ex) continue;
    const dayDetail = logs
      .filter((l) => l.exerciseId === p.exerciseId && l.date === date)
      .map((l) => `${fmtW(l.weight)}×${l.reps}`).join(', ');
    if (dayDetail) {
      done++;
      lines.push(`✅ ${ex.name} — ${dayDetail}`);
    } else {
      // most recent past performance as a weight hint
      let lastDate = '';
      const lastSets: string[] = [];
      for (const l of logs) {
        if (l.exerciseId !== p.exerciseId || l.date >= date) continue;
        if (!lastDate) lastDate = l.date;
        if (l.date !== lastDate) break;
        lastSets.push(`${fmtW(l.weight)}×${l.reps}`);
      }
      lines.push(`⬜ ${ex.name}${lastSets.length ? ` (прошлый раз: ${lastSets.join(', ')})` : ''}`);
    }
  }
  lines.push('', done === dayPlan.length ? '🏆 Всё выполнено!' : `Выполнено ${done} из ${dayPlan.length}`);
  return lines.join('\n');
}

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

async function ensurePairingCode(): Promise<string> {
  const existing = await getSetting('tgPairingCode');
  if (existing && /^[A-F0-9]{8}$/.test(existing)) return existing;
  const code = Crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  await setSetting('tgPairingCode', code);
  return code;
}

function parseStoredChatId(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed !== 0 ? parsed : 0;
}

function parseStoredOffset(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function loadPendingInbox(): Promise<SelectableItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<InboxRow>(
    `SELECT update_id, item_index, payload
       FROM telegram_inbox
      WHERE status = 'pending'
      ORDER BY update_id, item_index`,
  );
  const result: SelectableItem[] = [];
  for (const row of rows) {
    try {
      const item = JSON.parse(row.payload) as ParsedItem;
      if (!item || typeof item !== 'object' || typeof item.type !== 'string') throw new Error('invalid payload');
      result.push({ item, updateId: row.update_id, itemIndex: row.item_index, selected: true });
    } catch (e: any) {
      await db.runAsync(
        `UPDATE telegram_inbox SET status = 'error', last_error = ? WHERE update_id = ? AND item_index = ?`,
        [String(e?.message || e), row.update_id, row.item_index],
      );
    }
  }
  return result;
}

async function persistInboxItems(update: TgUpdate, chatId: number, parsed: ParsedItem[]): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (let index = 0; index < parsed.length; index++) {
      await tx.runAsync(
        `INSERT OR IGNORE INTO telegram_inbox
          (update_id, item_index, chat_id, payload, status, last_error, created_at, processed_at)
         VALUES (?, ?, ?, ?, 'pending', NULL, ?, NULL)`,
        [update.update_id, index, String(chatId), JSON.stringify(parsed[index]), now],
      );
    }
  });
}

async function attachTelegramDocument(
  token: string,
  si: SelectableItem,
  entityType: 'document' | 'flight',
  entityId: string,
  fileId: string,
  originalName?: string,
  mimeType?: string,
): Promise<void> {
  const db = await getDb();
  const rawExt = (originalName || '').split('.').pop() || 'bin';
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
  const attachmentId = telegramEntityId(si, `${entityType}-attachment`);
  const relativePath = await downloadTgFile(token, fileId, 'attachments', `${attachmentId}.${ext}`);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO attachments
      (id, entity_type, entity_id, name, file_path, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [attachmentId, entityType, entityId, originalName || `document.${ext}`, relativePath, mimeType || null, now],
  );
}

async function importInboxItem(si: SelectableItem, token: string): Promise<ParsedItem['type']> {
  const db = await getDb();
  const item = si.item;
  const entityId = telegramEntityId(si);
  const now = new Date().toISOString();
  let doctorData: Awaited<ReturnType<typeof fetchProdoctorov>> | null = null;
  if (item.type === 'doctor') doctorData = await fetchProdoctorov(item.url);

  await db.withExclusiveTransactionAsync(async (tx) => {
    if (item.type === 'task') {
      await tx.runAsync(
        `INSERT OR IGNORE INTO tasks
          (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at,
           priority, is_recurring, recur_days, completed, completed_at, created_at, updated_at)
         VALUES (?, '', ?, 'IN', NULL, ?, '', NULL, ?, NULL, 'normal', 0, NULL, 0, NULL, ?, ?)`,
        [entityId, item.subject, item.project || null, item.deadline || null, now, now],
      );
    } else if (item.type === 'flight') {
      await tx.runAsync(
        `INSERT OR IGNORE INTO flights
          (id, kind, title, city, flight_number, status, depart_date, depart_time, arrive_date, arrive_time,
           notes, price, currency, image_data, created_at)
         VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [entityId, item.kind, item.title, item.city || null, item.flightNumber || null, item.departDate,
         item.departTime || null, item.arriveDate || null, item.arriveTime || null, item.notes || '',
         item.price ?? null, item.currency || 'EUR', now],
      );
    } else if (item.type === 'doc') {
      const order = await tx.getFirstAsync<{ value: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM documents');
      await tx.runAsync(
        'INSERT OR IGNORE INTO documents (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
        [entityId, item.name, order?.value ?? 1, now],
      );
    } else if (item.type === 'tx') {
      const account = await tx.getFirstAsync<{ id: string }>(
        'SELECT id FROM accounts WHERE lower(name) = lower(?) LIMIT 1',
        [item.account],
      );
      if (!account) throw new Error(`Счёт «${item.account}» не найден`);
      const date = item.date || toDateStr(new Date(item.msgDate * 1000));
      const time = item.time || '00:00:00';
      await insertLedgerTransaction(tx, {
        accountId: account.id,
        amount: item.amount,
        date,
        timestamp: `${date}T${time}`,
        category: item.category,
        tag: item.tag,
        comment: item.comment,
      }, { id: entityId, createdAt: now, idempotent: true });
    } else if (item.type === 'note') {
      await tx.runAsync(
        'INSERT OR IGNORE INTO notes (id, text, image_path, created_at) VALUES (?, ?, NULL, ?)',
        [entityId, item.text, now],
      );
      for (const tag of item.tags) {
        await tx.runAsync('INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)', [entityId, tag]);
      }
    } else if (item.type === 'health') {
      let metricSequence = 0;
      const ensureMetric = async (name: string, unit?: string, refMin?: number, refMax?: number): Promise<string> => {
        const sequence = metricSequence++;
        let metric = await tx.getFirstAsync<{ id: string }>('SELECT id FROM health_metrics WHERE lower(name) = lower(?) LIMIT 1', [name]);
        if (!metric) {
          const metricId = telegramEntityId(si, `metric-${sequence}`);
          const order = await tx.getFirstAsync<{ value: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM health_metrics');
          await tx.runAsync(
            `INSERT OR IGNORE INTO health_metrics (id, name, unit, ref_min, ref_max, period_days, sort_order)
             VALUES (?, ?, ?, ?, ?, NULL, ?)`,
            [metricId, name, unit || '', refMin ?? null, refMax ?? null, order?.value ?? 1],
          );
          metric = await tx.getFirstAsync<{ id: string }>('SELECT id FROM health_metrics WHERE lower(name) = lower(?) LIMIT 1', [name]);
        } else if (unit || refMin != null || refMax != null) {
          await tx.runAsync(
            `UPDATE health_metrics
                SET unit = CASE WHEN ? <> '' THEN ? ELSE unit END,
                    ref_min = COALESCE(?, ref_min), ref_max = COALESCE(?, ref_max)
              WHERE id = ?`,
            [unit || '', unit || '', refMin ?? null, refMax ?? null, metric.id],
          );
        }
        if (!metric) throw new Error(`Не удалось создать показатель «${name}»`);
        return metric.id;
      };
      for (const metric of item.metrics) {
        await ensureMetric(metric.name, metric.unit, metric.refMin, metric.refMax);
      }
      const defaultDate = item.date || toDateStr(new Date(item.msgDate * 1000));
      for (let index = 0; index < item.results.length; index++) {
        const result = item.results[index];
        const metricId = await ensureMetric(result.name, result.unit, result.refMin, result.refMax);
        await tx.runAsync(
          `INSERT OR IGNORE INTO health_entries
            (id, metric_id, person_id, value, date, notes, created_at)
           VALUES (?, ?, 'me', ?, ?, '', ?)`,
          [telegramEntityId(si, `health-${index}`), metricId, result.value, result.date || defaultDate, now],
        );
      }
    } else if (item.type === 'ref') {
      for (let index = 0; index < item.refs.length; index++) {
        const ref = item.refs[index];
        const metric = await tx.getFirstAsync<{ id: string }>(
          'SELECT id FROM health_metrics WHERE lower(name) = lower(?) LIMIT 1',
          [ref.name],
        );
        if (!metric) throw new Error(`Показатель «${ref.name}» не найден`);
        await tx.runAsync(
          `INSERT INTO health_metric_refs (id, metric_id, source, ref_min, ref_max, period_days)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(metric_id, source) DO UPDATE SET
             ref_min = excluded.ref_min, ref_max = excluded.ref_max, period_days = excluded.period_days`,
          [telegramEntityId(si, `ref-${index}`), metric.id, item.source,
           ref.refMin ?? null, ref.refMax ?? null, ref.periodDays ?? null],
        );
      }
    } else if (item.type === 'doctor') {
      const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM doctors WHERE url = ? LIMIT 1', [item.url]);
      const doctorId = existing?.id || entityId;
      await tx.runAsync(
        `INSERT INTO doctors (id, name, specialty, phone, address, clinic, url, notes, created_at, updated_at)
         VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, specialty = excluded.specialty, clinic = excluded.clinic,
           notes = excluded.notes, updated_at = excluded.updated_at`,
        [doctorId, doctorData?.name || 'Без имени', doctorData?.specialty || '', doctorData?.clinic || '',
         item.url, doctorData?.city ? `Город: ${doctorData.city}` : '', now, now],
      );
    }
  });

  if ('photoFileId' in item && item.photoFileId) {
    const subdir = item.type === 'task' ? 'task_images'
      : item.type === 'flight' ? 'flight_images'
      : item.type === 'doc' ? 'document_images'
      : item.type === 'note' ? 'note_images' : null;
    if (subdir) {
      const relativePath = await downloadTgFile(token, item.photoFileId, subdir, `${entityId}.jpg`);
      if (item.type === 'task') await db.runAsync('UPDATE tasks SET image_data = ? WHERE id = ?', [relativePath, entityId]);
      else if (item.type === 'flight') await db.runAsync('UPDATE flights SET image_data = ? WHERE id = ?', [relativePath, entityId]);
      else if (item.type === 'note') await db.runAsync('UPDATE notes SET image_path = ? WHERE id = ?', [relativePath, entityId]);
      else if (item.type === 'doc') {
        await db.runAsync(
          `INSERT OR REPLACE INTO document_images (id, document_id, image_path, sort_order, created_at)
           VALUES (?, ?, ?, 1, ?)`,
          [telegramEntityId(si, 'image'), entityId, relativePath, now],
        );
      }
    }
  }

  if (item.type === 'doc' && item.docFileId) {
    await attachTelegramDocument(token, si, 'document', entityId, item.docFileId, item.docFileName, item.docMimeType);
  } else if (item.type === 'flight' && item.docFileId) {
    await attachTelegramDocument(token, si, 'flight', entityId, item.docFileId, item.docFileName, item.docMimeType);
  }
  if (item.type === 'flight') {
    await reconcileFlightReminder({
      id: entityId,
      kind: item.kind,
      status: 'planned',
      title: item.title,
      flightNumber: item.flightNumber,
      departDate: item.departDate,
      departTime: item.departTime,
    }).catch(() => {});
  }
  return item.type;
}

async function reloadImportedStores(types: Set<ParsedItem['type']>): Promise<void> {
  if (types.has('task')) { useTaskStore.setState({ loaded: false }); await useTaskStore.getState().load(); }
  if (types.has('flight')) { useFlightStore.setState({ loaded: false }); await useFlightStore.getState().load(); }
  if (types.has('doc')) { useDocumentStore.setState({ loaded: false }); await useDocumentStore.getState().load(); }
  if (types.has('health') || types.has('ref')) { useHealthStore.setState({ loaded: false }); await useHealthStore.getState().load(); }
  if (types.has('tx')) { useMoneyStore.setState({ loaded: false }); await useMoneyStore.getState().load(); }
  if (types.has('note')) { useNoteStore.setState({ loaded: false }); await useNoteStore.getState().load(); }
  if (types.has('doctor')) { useDoctorContactStore.setState({ loaded: false }); await useDoctorContactStore.getState().load(); }
  if (types.has('doc') || types.has('flight')) {
    useAttachmentStore.setState({ loaded: false });
    await useAttachmentStore.getState().load();
  }
}

export function TelegramSync({ onClose }: { onClose: () => void }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [items, setItems] = useState<SelectableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [closeWhenIdle, setCloseWhenIdle] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairedChatId, setPairedChatId] = useState<number | null>(null);
  const activeOperationRef = useRef<'fetch' | 'save' | 'reset' | null>(null);
  const sessionGenerationRef = useRef(0);
  const busy = loading || saving || resetting;

  usePreventRemove(busy, () => {
    Alert.alert('Telegram', 'Дождитесь завершения текущей операции.');
  });

  useEffect(() => () => {
    // Invalidates every continuation which awaited network or storage when the
    // screen is removed by its parent despite the navigation guard.
    sessionGenerationRef.current += 1;
  }, []);

  useEffect(() => {
    if (closeWhenIdle && !busy) {
      setCloseWhenIdle(false);
      onClose();
    }
  }, [busy, closeWhenIdle, onClose]);

  const handleClose = useCallback(() => {
    if (activeOperationRef.current) {
      Alert.alert('Telegram', 'Дождитесь завершения текущей операции.');
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    let active = true;
    (async () => {
      const allowed = await getSetting('tgAllowedChatId');
      if (!active) return;
      const allowedId = parseStoredChatId(allowed);
      if (allowedId) {
        setPairedChatId(allowedId);
        setPairingCode('');
      } else {
        setPairingCode(await ensurePairingCode());
      }
    })().catch((e) => console.warn('Telegram pairing state:', e));
    return () => { active = false; };
  }, []);

  const handleFetch = useCallback(async () => {
    if (activeOperationRef.current) return;
    activeOperationRef.current = 'fetch';
    const generation = sessionGenerationRef.current;
    const assertCurrentSession = () => {
      if (sessionGenerationRef.current !== generation) throw new StaleTelegramSessionError();
    };
    setLoading(true);
    try {
      const db = await getDb();
      const token = await getSecret('tgBotToken');
      assertCurrentSession();
      if (!token) throw new Error('Токен бота не задан. Настройки → Telegram бот');
      setTgToken(token);

      const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
      const lastTokenHash = await getSetting('tgBotTokenHash');
      const pairedTokenHash = await getSetting('tgPairedTokenHash');
      let allowedChatId = parseStoredChatId(await getSetting('tgAllowedChatId'));
      const tokenChanged = (lastTokenHash != null && lastTokenHash !== tokenHash)
        || (allowedChatId !== 0 && pairedTokenHash !== tokenHash);
      assertCurrentSession();
      if (tokenChanged) {
        // Offsets and queued files belong to the previous bot and must never be
        // reused with a newly configured token.
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.runAsync(
            "DELETE FROM settings WHERE key IN ('tgAllowedChatId','tgPairedTokenHash','tgPairingCode','tgUpdateOffset','tgPlanLastUpdateId')",
          );
          await tx.runAsync('DELETE FROM telegram_inbox');
        });
        allowedChatId = 0;
        setPairedChatId(null);
      }
      await setSetting('tgBotTokenHash', tokenHash);
      let code = allowedChatId ? '' : await ensurePairingCode();
      setPairingCode(code);

      const offsetRow = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['tgUpdateOffset']);
      const offset = parseStoredOffset(offsetRow?.value);
      const updates = await fetchUpdates(token, offset);
      assertCurrentSession();
      let planAnswered = parseStoredOffset(await getSetting('tgPlanLastUpdateId'));
      let planReplies = 0;
      let strangersSkipped = 0;
      let safeOffset = offset;
      let fetchError = '';
      const parseWarnings: string[] = [];

      for (const u of [...updates].sort((a, b) => a.update_id - b.update_id)) {
        const msg = u.channel_post || u.message;
        if (!msg?.chat?.id) {
          safeOffset = u.update_id + 1;
          continue;
        }
        const text = msg.text || msg.caption || '';

        if (!allowedChatId) {
          const pair = text.trim().match(/^\/pair\s+([A-Z0-9]+)$/i);
          if (pair && pair[1].toUpperCase() === code.toUpperCase()) {
            assertCurrentSession();
            allowedChatId = msg.chat.id;
            await db.withExclusiveTransactionAsync(async (tx) => {
              await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['tgAllowedChatId', String(allowedChatId)]);
              await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['tgPairedTokenHash', tokenHash]);
              await tx.runAsync("DELETE FROM settings WHERE key = 'tgPairingCode'");
            });
            code = '';
            setPairingCode('');
            setPairedChatId(allowedChatId);
            try { await sendMessage(token, allowedChatId, '✅ Бот безопасно привязан к приложению'); } catch {}
          } else {
            strangersSkipped++;
          }
          safeOffset = u.update_id + 1;
          continue;
        }

        if (msg.chat.id !== allowedChatId) {
          strangersSkipped++;
          safeOffset = u.update_id + 1;
          continue;
        }

        const planMatch = text.trim().match(/^\/plan(?:\s+(.+))?$/i);
        if (planMatch) {
          if (u.update_id > planAnswered) {
            try {
              const planDate = parsePlanDateArg(planMatch[1]);
              await sendMessage(
                token,
                msg.chat.id,
                planDate
                  ? await buildPlanReply(planDate)
                  : 'Некорректная дата. Используйте /plan, /plan завтра, /plan ДД.ММ.ГГГГ или /plan ГГГГ-ММ-ДД.',
              );
              assertCurrentSession();
              planAnswered = u.update_id;
              await setSetting('tgPlanLastUpdateId', String(planAnswered));
              planReplies++;
            } catch (e: any) {
              fetchError = `Не удалось ответить на /plan: ${String(e?.message || e)}`;
              break;
            }
          }
          safeOffset = u.update_id + 1;
          continue;
        }

        if (!text) {
          safeOffset = u.update_id + 1;
          continue;
        }
        const photoFileId = msg.photo?.length
          ? msg.photo[msg.photo.length - 1].file_id
          : undefined;
        const docFileId = msg.document?.file_id;
        const docFileName = msg.document?.file_name;
        const docMimeType = msg.document?.mime_type;
        const parsed = parseMessagesDetailed(text, msg.date, photoFileId, docFileId, docFileName, docMimeType);
        for (const error of parsed.errors) parseWarnings.push(`#${u.update_id}: ${error}`);
        assertCurrentSession();
        if (parsed.items.length) await persistInboxItems(u, msg.chat.id, parsed.items);
        // The Telegram update is acknowledged only after every parsed item is durable.
        safeOffset = u.update_id + 1;
      }

      if (safeOffset > offset) {
        assertCurrentSession();
        await setSetting('tgUpdateOffset', String(safeOffset));
      }
      if (strangersSkipped) console.warn(`TelegramSync: skipped ${strangersSkipped} message(s) from unknown chats`);
      const pending = await loadPendingInbox();
      assertCurrentSession();
      setItems(pending);
      setFetched(true);
      if (fetchError) {
        Alert.alert('Telegram', fetchError);
      } else if (!allowedChatId) {
        Alert.alert('Привязка Telegram', `Отправьте боту команду /pair ${code}, затем повторите загрузку.`);
      } else if (parseWarnings.length > 0) {
        Alert.alert('Команды не распознаны', parseWarnings.slice(0, 10).join('\n'));
      } else if (!pending.length && planReplies > 0) {
        Alert.alert('Telegram', `Ответил на /plan (${planReplies})`);
      } else if (!pending.length && updates.length === 0) {
        Alert.alert('Telegram', 'Новых сообщений нет');
      } else if (!pending.length) {
        Alert.alert('Telegram', `${updates.length} сообщений обработано, новых команд нет`);
      }
    } catch (e: any) {
      if (e instanceof StaleTelegramSessionError) return;
      try {
        const pending = await loadPendingInbox();
        if (pending.length) { setItems(pending); setFetched(true); }
      } catch {}
      Alert.alert('Ошибка', String(e?.message || e));
    } finally {
      if (activeOperationRef.current === 'fetch') activeOperationRef.current = null;
      setLoading(false);
    }
  }, []);

  const resetPairing = useCallback(() => {
    if (activeOperationRef.current) return;
    Alert.alert('Сбросить привязку?', 'Незавершённые сообщения старого чата будут удалены.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Сбросить', style: 'destructive', onPress: async () => {
        // The confirmation may stay open while another operation starts.
        // Re-check the synchronous lock before touching pairing state.
        if (activeOperationRef.current) {
          Alert.alert('Telegram', 'Дождитесь завершения текущей операции.');
          return;
        }
        activeOperationRef.current = 'reset';
        sessionGenerationRef.current += 1;
        setResetting(true);
        try {
          const db = await getDb();
          await db.withExclusiveTransactionAsync(async (tx) => {
            await tx.runAsync("DELETE FROM settings WHERE key IN ('tgAllowedChatId','tgPairedTokenHash','tgPairingCode')");
            await tx.runAsync('DELETE FROM telegram_inbox');
          });
          setPairedChatId(null);
          setItems([]);
          setFetched(false);
          setPairingCode(await ensurePairingCode());
        } catch (e: any) {
          Alert.alert('Ошибка сброса', String(e?.message || e));
        } finally {
          if (activeOperationRef.current === 'reset') activeOperationRef.current = null;
          setResetting(false);
        }
      } },
    ]);
  }, []);

  const toggleItem = (idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  };

  const handleSave = useCallback(async () => {
    if (activeOperationRef.current) return;
    const selected = items.filter((it) => it.selected);
    if (!selected.length) { Alert.alert('Нечего сохранять'); return; }
    activeOperationRef.current = 'save';
    const generation = sessionGenerationRef.current;
    const assertCurrentSession = () => {
      if (sessionGenerationRef.current !== generation) throw new StaleTelegramSessionError();
    };
    setSaving(true);
    const successful = new Set<string>();
    const successfulTypes = new Set<ParsedItem['type']>();
    const errors: string[] = [];
    try {
      const db = await getDb();
      for (const si of selected) {
        assertCurrentSession();
        const key = `${si.updateId}:${si.itemIndex}`;
        try {
          const type = await importInboxItem(si, tgToken);
          assertCurrentSession();
          await db.runAsync(
            `UPDATE telegram_inbox
                SET status = 'processed', last_error = NULL, processed_at = ?
              WHERE update_id = ? AND item_index = ?`,
            [new Date().toISOString(), si.updateId, si.itemIndex],
          );
          successful.add(key);
          successfulTypes.add(type);
        } catch (e: any) {
          if (e instanceof StaleTelegramSessionError) throw e;
          const message = String(e?.message || e);
          errors.push(`#${si.updateId}.${si.itemIndex}: ${message}`);
          await db.runAsync(
            `UPDATE telegram_inbox SET last_error = ? WHERE update_id = ? AND item_index = ?`,
            [message, si.updateId, si.itemIndex],
          );
        }
      }
      assertCurrentSession();
      await reloadImportedStores(successfulTypes);
      const remaining = items.filter((si) => !successful.has(`${si.updateId}:${si.itemIndex}`));
      setItems(remaining);
      if (errors.length) {
        Alert.alert('Сохранено частично', `${successful.size} успешно. Остались в очереди:\n${errors.join('\n')}`);
      } else {
        Alert.alert('Сохранено', `Обработано: ${successful.size}`);
        if (remaining.length === 0) setCloseWhenIdle(true);
      }
    } catch (e: any) {
      if (!(e instanceof StaleTelegramSessionError)) {
        Alert.alert('Ошибка сохранения', String(e?.message || e));
      }
    } finally {
      if (activeOperationRef.current === 'save') activeOperationRef.current = null;
      setSaving(false);
    }
  }, [items, tgToken]);

  const selectedCount = items.filter((it) => it.selected).length;

  const renderItem = ({ item: si, index }: { item: SelectableItem; index: number }) => {
    const { item, selected } = si;
    const typeColor = item.type === 'task' ? '#3B82F6' : item.type === 'flight' ? '#F59E0B' : item.type === 'health' ? '#22C55E' : item.type === 'ref' ? '#F59E0B' : item.type === 'tx' ? '#10B981' : item.type === 'note' ? '#A855F7' : item.type === 'doctor' ? '#EC4899' : '#8B5CF6';
    const typeLabel = item.type === 'task' ? 'ЗАДАЧА' : item.type === 'flight' ? (item.kind === 'hotel' ? 'ОТЕЛЬ' : item.kind === 'event' ? 'СОБЫТИЕ' : 'ПЕРЕЛЁТ') : item.type === 'health' ? 'АНАЛИЗЫ' : item.type === 'ref' ? 'РЕФЫ' : item.type === 'tx' ? 'ТРАНЗАКЦИЯ' : item.type === 'note' ? 'ЗАМЕТКА' : item.type === 'doctor' ? 'ВРАЧ' : 'ДОКУМЕНТ';
    return (
      <TouchableOpacity
        style={[st.row, { backgroundColor: selected ? c.card : 'transparent', borderColor: c.border }]}
        onPress={() => toggleItem(index)}
      >
        <Text style={{ fontSize: 18, marginRight: 8 }}>{selected ? '☑' : '☐'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: typeColor, fontSize: 11, fontWeight: '700' }}>{typeLabel}</Text>
          <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={2}>
            {item.type === 'task' ? item.subject : item.type === 'flight' ? item.title : item.type === 'health' ? `${item.results.length} рез. ${item.metrics.length} показ.` : item.type === 'ref' ? `${item.source}: ${item.refs.length} рефов` : item.type === 'tx' ? `${item.account}: ${item.amount > 0 ? '+' : ''}${item.amount}` : item.type === 'note' ? `${item.tags.map(t => '#' + t).join(' ')} ${item.text}`.trim() : item.type === 'doctor' ? item.url : item.name}
          </Text>
          {item.type === 'task' && item.project && (
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>Проект: {item.project}</Text>
          )}
          {item.type === 'task' && item.deadline && (
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>Дедлайн: {item.deadline}</Text>
          )}
          {item.type === 'flight' && (
            <>
              <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                {item.departDate}{item.departTime ? ` ${item.departTime}` : ''}
                {item.arriveDate ? ` → ${item.arriveDate}` : ''}
                {item.arriveTime ? ` ${item.arriveTime}` : ''}
              </Text>
              {item.price ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>{item.price} {item.currency === 'RUB' ? '₽' : '€'}</Text> : null}
              {item.flightNumber ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>Рейс: {item.flightNumber}</Text> : null}
              {item.notes ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>{item.notes}</Text> : null}
              {item.docFileId ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>+ {item.docFileName || 'файл'}</Text> : null}
            </>
          )}
          {item.type === 'tx' && (
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>
              {item.category ? `${item.category} ` : ''}{item.tag ? `#${item.tag} ` : ''}{item.comment || ''}{item.date ? ` (${item.date})` : ''}
            </Text>
          )}
          {'photoFileId' in item && item.photoFileId && (
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>+ фото</Text>
          )}
          {item.type === 'doc' && item.docFileId && (
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>+ {item.docFileName || 'файл'}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[st.container, { backgroundColor: c.background }]}>
      <View style={[st.header, { borderBottomColor: c.border }]}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>Telegram Sync</Text>
        <TouchableOpacity
          onPress={handleClose}
          disabled={busy}
          style={busy ? { opacity: 0.4 } : undefined}
        >
          <Text style={{ color: c.primary, fontSize: 15, fontWeight: '600' }}>Закрыть</Text>
        </TouchableOpacity>
      </View>

      <View style={[st.pairing, { backgroundColor: c.card, borderColor: c.border }]}>
        {pairedChatId ? (
          <>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>Привязан chat {pairedChatId}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11 }}>Команды принимаются только из этого чата.</Text>
            </View>
            <TouchableOpacity
              onPress={resetPairing}
              style={[st.smallBtn, (loading || saving || resetting) && { opacity: 0.4 }]}
              disabled={loading || saving || resetting}
            >
              <Text style={{ color: c.danger, fontWeight: '600', fontSize: 12 }}>Сбросить</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Требуется безопасная привязка</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 3 }}>
              Отправьте боту: <Text style={{ color: c.primary, fontWeight: '700' }}>/pair {pairingCode || '…'}</Text>
            </Text>
          </View>
        )}
      </View>

      {!fetched ? (
        <View style={st.center}>
          <TouchableOpacity
            style={[st.btn, { backgroundColor: c.primary }]}
            onPress={handleFetch}
            disabled={loading || saving || resetting}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : (
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Загрузить сообщения</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={st.center}>
          <Text style={{ color: c.textSecondary, fontSize: 14 }}>Нет распознанных команд</Text>
          <TouchableOpacity
            style={[st.btn, { backgroundColor: c.card, marginTop: 12, borderWidth: 1, borderColor: c.border }]}
            onPress={handleFetch}
            disabled={loading || saving || resetting}
          >
            <Text style={{ color: c.text, fontWeight: '600' }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(si) => `${si.updateId}:${si.itemIndex}`}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12 }}
          />
          <View style={[st.footer, { borderTopColor: c.border }]}>
            <TouchableOpacity
              style={[st.btn, { backgroundColor: selectedCount ? c.primary : c.border, flex: 1 }]}
              onPress={handleSave}
              disabled={!selectedCount || saving || loading || resetting}
            >
              {saving ? <ActivityIndicator color="#FFF" /> : (
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Сохранить ({selectedCount})</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  btn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  footer: { padding: 12, borderTopWidth: 1 },
  pairing: { flexDirection: 'row', alignItems: 'center', margin: 12, marginBottom: 0, padding: 10, borderRadius: 8, borderWidth: 1 },
  smallBtn: { paddingVertical: 6, paddingHorizontal: 8 },
});
