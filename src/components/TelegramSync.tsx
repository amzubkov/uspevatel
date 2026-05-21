import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { getDb, getImageBaseDir } from '../db/database';
import { useSettingsStore } from '../store/settingsStore';
import { useTaskStore } from '../store/taskStore';
import { useFlightStore } from '../store/flightStore';
import { useDocumentStore } from '../store/documentStore';
import { useHealthStore } from '../store/healthStore';
import { colors } from '../utils/theme';
import { useAttachmentStore } from '../store/attachmentStore';
import { useMoneyStore } from '../store/moneyStore';
import { useNoteStore } from '../store/noteStore';
import { useDoctorContactStore } from '../store/doctorContactStore';
import { fetchProdoctorov } from '../utils/prodoctorovParser';
import { fetchUpdates, getFileUrl } from '../services/telegramService';
import { parseMessages, ParsedItem } from '../services/telegramParser';

interface SelectableItem {
  item: ParsedItem;
  updateId: number;
  selected: boolean;
}

async function downloadTgPhoto(token: string, fileId: string, subdir: string, fileName: string): Promise<string | null> {
  try {
    const fileUrl = await getFileUrl(token, fileId);
    const dir = new Directory(getImageBaseDir(), subdir);
    if (!dir.exists) dir.create();
    const dest = new File(dir, fileName);
    const res = await fetch(fileUrl);
    const blob = await res.blob();
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    dest.write(base64.split(',')[1], { encoding: 'base64' });
    return `${subdir}/${fileName}`;
  } catch (e: any) {
    console.warn(`Failed to download photo to ${subdir}:`, e?.message);
    return null;
  }
}

export function TelegramSync({ onClose }: { onClose: () => void }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [items, setItems] = useState<SelectableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [tgToken, setTgToken] = useState('');

  const handleFetch = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const tokenRow = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['tgBotToken']);
      const offsetRow = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['tgUpdateOffset']);
      const token = tokenRow?.value;
      if (!token) { Alert.alert('Ошибка', 'Токен бота не задан. Настройки → Telegram бот'); setLoading(false); return; }
      setTgToken(token);

      const offset = offsetRow?.value ? parseInt(offsetRow.value) : 0;
      const updates = await fetchUpdates(token, offset);

      const parsed: SelectableItem[] = [];
      for (const u of updates) {
        const msg = u.channel_post || u.message;
        if (!msg) continue;
        const text = msg.text || msg.caption || '';
        if (!text) continue;
        // Get largest photo file_id if present
        const photoFileId = msg.photo?.length
          ? msg.photo[msg.photo.length - 1].file_id
          : undefined;
        const docFileId = msg.document?.file_id;
        const docFileName = msg.document?.file_name;
        const docMimeType = msg.document?.mime_type;
        const items = parseMessages(text, msg.date, photoFileId, docFileId, docFileName, docMimeType);
        for (const p of items) parsed.push({ item: p, updateId: u.update_id, selected: true });
      }

      setItems(parsed);
      setFetched(true);
      if (!parsed.length && updates.length === 0) {
        Alert.alert('Telegram', 'Новых сообщений нет');
      } else if (!parsed.length) {
        Alert.alert('Telegram', `${updates.length} сообщений, но ни одно не распознано как /task, /flight или /doc`);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    }
    setLoading(false);
  }, []);

  const toggleItem = (idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  };

  const handleSave = useCallback(async () => {
    const selected = items.filter((it) => it.selected);
    if (!selected.length) { Alert.alert('Нечего сохранять'); return; }
    setSaving(true);
    try {
      const db = await getDb();
      let taskCount = 0;
      let flightCount = 0;
      let docCount = 0;
      let healthCount = 0;
      let txCount = 0;
      let noteCount = 0;
      let doctorCount = 0;
      const txSkipped: string[] = [];

      // Track saved IDs for post-transaction photo downloads
      const photoJobs: { type: string; id: string; fileId: string; subdir: string }[] = [];

      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const { item } of selected) {
          if (item.type === 'task') {
            const now = new Date().toISOString();
            const id = Crypto.randomUUID();
            await tx.runAsync(
              `INSERT INTO tasks (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at, priority, is_recurring, recur_days, completed, completed_at, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?,?)`,
              [id, '', item.subject, 'IN', null, item.project || null, '', null, item.deadline || null, null, 'normal', 0, null, now, now]
            );
            taskCount++;
            if (item.photoFileId) photoJobs.push({ type: 'task', id, fileId: item.photoFileId, subdir: 'task_images' });
          } else if (item.type === 'flight') {
            const id = Crypto.randomUUID();
            const now = new Date().toISOString();
            await tx.runAsync(
              `INSERT INTO flights (id, kind, title, city, flight_number, status, depart_date, depart_time, arrive_date, arrive_time, notes, price, currency, image_data, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [id, item.kind, item.title, item.city || null, item.flightNumber || null, 'planned', item.departDate, item.departTime || null,
               item.arriveDate || null, item.arriveTime || null, item.notes || '', item.price || null, item.currency || 'EUR', null, now]
            );
            flightCount++;
            if (item.photoFileId) photoJobs.push({ type: 'flight', id, fileId: item.photoFileId, subdir: 'flight_images' });
            if (item.docFileId) (item as any)._savedFlightId = id;
          } else if (item.type === 'doc') {
            const docId = Crypto.randomUUID();
            const now = new Date().toISOString();
            const maxOrderRow = await tx.getFirstAsync<{ m: number }>('SELECT COALESCE(MAX(sort_order),0) as m FROM documents');
            const sortOrder = (maxOrderRow?.m || 0) + 1;
            await tx.runAsync(
              'INSERT INTO documents (id, name, sort_order, created_at) VALUES (?,?,?,?)',
              [docId, item.name, sortOrder, now]
            );
            docCount++;
            if (item.photoFileId) photoJobs.push({ type: 'doc', id: docId, fileId: item.photoFileId, subdir: 'document_images' });
            if (item.docFileId) (item as any)._savedDocId = docId;
          } else if (item.type === 'tx') {
            // Find account by name (case-insensitive)
            const accounts = useMoneyStore.getState().accounts;
            const acc = accounts.find((a) => a.name.toLowerCase() === item.account.toLowerCase());
            if (acc) {
              const id = Crypto.randomUUID();
              const now = new Date().toISOString();
              const date = item.date || new Date(item.msgDate * 1000).toISOString().substring(0, 10);
              const time = item.time || '00:00:00';
              const timestamp = `${date}T${time}`;
              await tx.runAsync(
                'INSERT INTO transactions (id, account_id, amount, date, timestamp, category, tag, comment, is_correction, created_at) VALUES (?,?,?,?,?,?,?,?,0,?)',
                [id, acc.id, item.amount, date, timestamp, item.category, item.tag, item.comment, now]
              );
              txCount++;
            } else {
              txSkipped.push(`${item.account}: ${item.amount} (счёт не найден)`);
            }
          } else if (item.type === 'note') {
            const noteId = Crypto.randomUUID();
            const now = new Date().toISOString();
            await tx.runAsync(
              'INSERT INTO notes (id, text, image_path, created_at) VALUES (?,?,?,?)',
              [noteId, item.text, null, now]
            );
            for (const tag of item.tags) {
              await tx.runAsync('INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?,?)', [noteId, tag]);
            }
            noteCount++;
            if (item.photoFileId) photoJobs.push({ type: 'note', id: noteId, fileId: item.photoFileId, subdir: 'note_images' });
          } else if (item.type === 'health') {
            healthCount += item.results.length + item.metrics.length;
          } else if (item.type === 'ref') {
            healthCount += item.refs.length;
          } else if (item.type === 'doctor') {
            // handled outside transaction (network fetch)
          }
        }

        // Update offset to max+1
        const maxId = Math.max(...items.map((it) => it.updateId));
        await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['tgUpdateOffset', String(maxId + 1)]);
      });

      // Import health entries via store (outside transaction)
      for (const { item } of selected) {
        if (item.type === 'health') {
          const date = item.date || new Date().toISOString().slice(0, 10);
          const hs = useHealthStore.getState();
          // Import metric definitions
          for (const m of item.metrics) {
            const exists = hs.metrics.find((x) => x.name.toLowerCase() === m.name.toLowerCase());
            if (!exists) await hs.addMetric({ name: m.name, unit: m.unit, refMin: m.refMin, refMax: m.refMax, periodDays: undefined });
            else await hs.updateMetric(exists.id, { unit: m.unit || exists.unit, refMin: m.refMin ?? exists.refMin, refMax: m.refMax ?? exists.refMax });
          }
          // Import results — group by date
          if (item.results.length) {
            const byDate = new Map<string, typeof item.results>();
            for (const r of item.results) {
              const d = r.date || date;
              const arr = byDate.get(d) || [];
              arr.push(r);
              byDate.set(d, arr);
            }
            for (const [d, rs] of byDate) {
              await hs.bulkImport(rs, d);
            }
          }
        }
      }

      // Import doctor contacts from prodoctorov links (network fetch, then save)
      for (const { item } of selected) {
        if (item.type === 'doctor') {
          const data = await fetchProdoctorov(item.url);
          const dcs = useDoctorContactStore.getState();
          await dcs.addDoctor({
            name: data?.name || 'Без имени',
            specialty: data?.specialty || '',
            phone: '',
            address: '',
            clinic: data?.clinic || '',
            url: item.url,
            notes: data?.city ? `Город: ${data.city}` : '',
          });
          doctorCount++;
        }
      }

      // Import ref updates
      for (const { item } of selected) {
        if (item.type === 'ref') {
          const hs = useHealthStore.getState();
          const db = await getDb();
          for (const ref of item.refs) {
            const metric = hs.metrics.find((m) => m.name.toLowerCase() === ref.name.toLowerCase());
            if (!metric) continue;
            // Delete old, insert new
            await db.runAsync('DELETE FROM health_metric_refs WHERE metric_id = ? AND source = ?', [metric.id, item.source]);
            await db.runAsync(
              'INSERT INTO health_metric_refs (id, metric_id, source, ref_min, ref_max, period_days) VALUES (?,?,?,?,?,?)',
              [Crypto.randomUUID(), metric.id, item.source, ref.refMin ?? null, ref.refMax ?? null, ref.periodDays ?? null]
            );
          }
          useHealthStore.setState({ loaded: false });
          await useHealthStore.getState().load();
        }
      }

      // Download photos after transaction committed
      for (const job of photoJobs) {
        const relPath = await downloadTgPhoto(tgToken, job.fileId, job.subdir, `${job.id}.jpg`);
        if (!relPath) continue;
        if (job.type === 'task') {
          await db.runAsync('UPDATE tasks SET image_data = ? WHERE id = ?', [relPath, job.id]);
        } else if (job.type === 'flight') {
          await db.runAsync('UPDATE flights SET image_data = ? WHERE id = ?', [relPath, job.id]);
        } else if (job.type === 'doc') {
          const imgId = Crypto.randomUUID();
          const now = new Date().toISOString();
          await db.runAsync(
            'INSERT INTO document_images (id, document_id, image_path, sort_order, created_at) VALUES (?,?,?,?,?)',
            [imgId, job.id, relPath, 1, now]
          );
        } else if (job.type === 'note') {
          await db.runAsync('UPDATE notes SET image_path = ? WHERE id = ?', [relPath, job.id]);
        }
      }

      // Download document files (PDF etc) for /doc commands
      for (const { item } of selected) {
        if (item.type === 'doc' && item.docFileId && tgToken) {
          const docId = (item as any)._savedDocId;
          if (!docId) continue;
          try {
            const fileUrl = await getFileUrl(tgToken, item.docFileId);
            const ext = (item.docFileName || 'file').split('.').pop() || 'pdf';
            const fileName = item.docFileName || `document.${ext}`;
            const dir = new Directory(getImageBaseDir(), 'attachments');
            if (!dir.exists) dir.create();
            const attId = Crypto.randomUUID();
            const relPath = `attachments/${attId}.${ext}`;
            const dest = new File(dir, `${attId}.${ext}`);
            const res = await fetch(fileUrl);
            const blob = await res.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            dest.write(base64.split(',')[1], { encoding: 'base64' });
            if (!dest.exists) throw new Error('Файл не записался');
            // Insert directly into attachments table (file already at target location)
            const now = new Date().toISOString();
            await db.runAsync(
              'INSERT INTO attachments (id, entity_type, entity_id, name, file_path, mime_type, size, created_at) VALUES (?,?,?,?,?,?,?,?)',
              [attId, 'document', docId, fileName, relPath, item.docMimeType || null, null, now],
            );
          } catch (e: any) {
            Alert.alert('Ошибка загрузки PDF', String(e?.message || e));
          }
        }
      }

      // Download document files (PDF etc) for /flight commands
      for (const { item } of selected) {
        if (item.type === 'flight' && item.docFileId && tgToken) {
          const flightId = (item as any)._savedFlightId;
          if (!flightId) continue;
          try {
            const fileUrl = await getFileUrl(tgToken, item.docFileId);
            const ext = (item.docFileName || 'file').split('.').pop() || 'pdf';
            const fileName = item.docFileName || `document.${ext}`;
            const dir = new Directory(getImageBaseDir(), 'attachments');
            if (!dir.exists) dir.create();
            const attId = Crypto.randomUUID();
            const relPath = `attachments/${attId}.${ext}`;
            const dest = new File(dir, `${attId}.${ext}`);
            const res = await fetch(fileUrl);
            const blob = await res.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            dest.write(base64.split(',')[1], { encoding: 'base64' });
            if (!dest.exists) throw new Error('Файл не записался');
            const now = new Date().toISOString();
            await db.runAsync(
              'INSERT INTO attachments (id, entity_type, entity_id, name, file_path, mime_type, size, created_at) VALUES (?,?,?,?,?,?,?,?)',
              [attId, 'flight', flightId, fileName, relPath, item.docMimeType || null, null, now],
            );
          } catch (e: any) {
            Alert.alert('Ошибка загрузки PDF рейса', String(e?.message || e));
          }
        }
      }

      // Reload attachments store to reflect newly added files
      useAttachmentStore.setState({ loaded: false });
      await useAttachmentStore.getState().load();

      // Reload stores
      useTaskStore.setState({ loaded: false });
      useFlightStore.setState({ loaded: false });
      useDocumentStore.setState({ loaded: false });
      if (healthCount) useHealthStore.setState({ loaded: false });
      if (txCount) useMoneyStore.setState({ loaded: false });
      if (noteCount) useNoteStore.setState({ loaded: false });
      await useTaskStore.getState().load();
      await useFlightStore.getState().load();
      await useDocumentStore.getState().load();
      if (healthCount) await useHealthStore.getState().load();
      if (txCount) await useMoneyStore.getState().load();
      if (noteCount) await useNoteStore.getState().load();

      const parts = [];
      if (taskCount) parts.push(`задач: ${taskCount}`);
      if (flightCount) parts.push(`перелётов: ${flightCount}`);
      if (docCount) parts.push(`документов: ${docCount}`);
      if (noteCount) parts.push(`заметок: ${noteCount}`);
      if (healthCount) parts.push(`анализов: ${healthCount}`);
      if (txCount) parts.push(`транзакций: ${txCount}`);
      if (doctorCount) parts.push(`врачей: ${doctorCount}`);
      if (txSkipped.length) parts.push(`\nПропущено (${txSkipped.length}):\n${txSkipped.join('\n')}`);
      Alert.alert('Сохранено', parts.join(', '));
      onClose();
    } catch (e: any) {
      Alert.alert('Ошибка сохранения', String(e?.message || e));
    }
    setSaving(false);
  }, [items, onClose, tgToken]);

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
    <View style={[st.container, { backgroundColor: c.bg }]}>
      <View style={[st.header, { borderBottomColor: c.border }]}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>Telegram Sync</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: c.primary, fontSize: 15, fontWeight: '600' }}>Закрыть</Text>
        </TouchableOpacity>
      </View>

      {!fetched ? (
        <View style={st.center}>
          <TouchableOpacity
            style={[st.btn, { backgroundColor: c.primary }]}
            onPress={handleFetch}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : (
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Загрузить сообщения</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={st.center}>
          <Text style={{ color: c.textSecondary, fontSize: 14 }}>Нет распознанных команд</Text>
          <TouchableOpacity style={[st.btn, { backgroundColor: c.card, marginTop: 12, borderWidth: 1, borderColor: c.border }]} onPress={handleFetch}>
            <Text style={{ color: c.text, fontWeight: '600' }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12 }}
          />
          <View style={[st.footer, { borderTopColor: c.border }]}>
            <TouchableOpacity
              style={[st.btn, { backgroundColor: selectedCount ? c.primary : c.border, flex: 1 }]}
              onPress={handleSave}
              disabled={!selectedCount || saving}
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
});
