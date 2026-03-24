import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, ScrollView, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSettingsStore } from '../store/settingsStore';
import { useHealthStore, HealthMetric, HealthEntry } from '../store/healthStore';
import { useDoctorStore, DoctorVisit, DoctorVisitImage } from '../store/doctorStore';
import { DatePickerField } from '../components/DatePickerField';
import { colors } from '../utils/theme';

function statusColor(value: number, metric: HealthMetric, c: any): string {
  if (metric.refMin != null && value < metric.refMin) return c.warning;
  if (metric.refMax != null && value > metric.refMax) return c.danger;
  return c.success;
}

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

function daysDiff(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

/* ── Metric Form ── */
function MetricForm({ initial, onSave, onCancel, c }: {
  initial?: HealthMetric; onSave: (m: Omit<HealthMetric, 'id' | 'sortOrder'>) => void; onCancel: () => void; c: any;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [unit, setUnit] = useState(initial?.unit || '');
  const [refMin, setRefMin] = useState(initial?.refMin != null ? String(initial.refMin) : '');
  const [refMax, setRefMax] = useState(initial?.refMax != null ? String(initial.refMax) : '');
  const [periodDays, setPeriodDays] = useState(initial?.periodDays != null ? String(initial.periodDays) : '');

  const save = () => {
    const n = name.trim();
    if (!n) { Alert.alert('Ошибка', 'Введите название'); return; }
    onSave({
      name: n, unit: unit.trim(),
      refMin: refMin ? parseFloat(refMin) : undefined,
      refMax: refMax ? parseFloat(refMax) : undefined,
      periodDays: periodDays ? parseInt(periodDays) : undefined,
    });
  };

  return (
    <View style={[s.formCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.formTitle, { color: c.text }]}>{initial ? 'Редактировать' : 'Новый показатель'}</Text>
      <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Название" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
      <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Единицы (г/л...)" placeholderTextColor={c.textSecondary} value={unit} onChangeText={setUnit} />
      <View style={s.row}>
        <TextInput style={[s.input, s.halfInput, { color: c.text, borderColor: c.border }]} placeholder="Реф. мин" placeholderTextColor={c.textSecondary} value={refMin} onChangeText={setRefMin} keyboardType="numeric" />
        <TextInput style={[s.input, s.halfInput, { color: c.text, borderColor: c.border }]} placeholder="Реф. макс" placeholderTextColor={c.textSecondary} value={refMax} onChangeText={setRefMax} keyboardType="numeric" />
      </View>
      <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Периодичность (дней, напр. 90)" placeholderTextColor={c.textSecondary} value={periodDays} onChangeText={setPeriodDays} keyboardType="numeric" />
      <View style={s.row}>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.primary }]} onPress={save}><Text style={s.btnText}>Сохранить</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary }]} onPress={onCancel}><Text style={s.btnText}>Отмена</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Entry Form ── */
function EntryForm({ metrics, onSave, onCancel, c }: {
  metrics: HealthMetric[]; onSave: (e: Omit<HealthEntry, 'id' | 'createdAt'>) => void; onCancel: () => void; c: any;
}) {
  const [metricId, setMetricId] = useState(metrics[0]?.id || '');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');

  return (
    <View style={[s.formCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.formTitle, { color: c.text }]}>Новый результат</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {metrics.map((m) => (
          <TouchableOpacity key={m.id} onPress={() => setMetricId(m.id)}
            style={[s.chip, { backgroundColor: m.id === metricId ? c.primary : c.border }]}>
            <Text style={{ color: m.id === metricId ? '#FFF' : c.text, fontSize: 13 }}>{m.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Значение" placeholderTextColor={c.textSecondary} value={value} onChangeText={setValue} keyboardType="numeric" />
      <DatePickerField value={date} onChange={setDate} label="Дата" textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
      <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Заметки" placeholderTextColor={c.textSecondary} value={notes} onChangeText={setNotes} />
      <View style={s.row}>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.primary }]} onPress={() => {
          const v = parseFloat(value); if (isNaN(v)) { Alert.alert('Ошибка', 'Введите значение'); return; }
          onSave({ metricId, value: v, date, notes: notes.trim() });
        }}><Text style={s.btnText}>Сохранить</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary }]} onPress={onCancel}><Text style={s.btnText}>Отмена</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Import Form ── */
function ImportForm({ onDone, onCancel, c }: { onDone: (n: number) => void; onCancel: () => void; c: any }) {
  const bulkImport = useHealthStore((s) => s.bulkImport);
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayStr());
  const parsed = useMemo(() => {
    return text.split('\n').map((line) => {
      const t = line.trim(); if (!t) return null;
      const m = t.match(/^(.+?)[,;\t]\s*(-?\d+[.,]?\d*)$/) || t.match(/^(.+?)\s+(-?\d+[.,]?\d*)$/);
      if (!m) return { raw: t, error: true as const };
      const name = m[1].trim(); const value = parseFloat(m[2].replace(',', '.'));
      if (!name || isNaN(value)) return { raw: t, error: true as const };
      return { name, value, error: false as const };
    }).filter(Boolean) as any[];
  }, [text]);
  const valid = parsed.filter((p: any) => !p.error);
  const errors = parsed.filter((p: any) => p.error);

  return (
    <View style={[s.formCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.formTitle, { color: c.text }]}>Импорт анализов</Text>
      <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 6 }}>По строке: Название, значение</Text>
      <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 140, textAlignVertical: 'top' }]}
        placeholder={'Гемоглобин, 140\nХолестерин, 5.2'} placeholderTextColor={c.textSecondary} value={text} onChangeText={setText} multiline />
      <DatePickerField value={date} onChange={setDate} label="Дата" textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
      {parsed.length > 0 && <Text style={{ color: c.success, fontSize: 12, marginBottom: 4 }}>Распознано: {valid.length}{errors.length > 0 ? `, ошибок: ${errors.length}` : ''}</Text>}
      <View style={s.row}>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.primary }]} onPress={async () => {
          if (!valid.length) { Alert.alert('Ошибка', 'Нет строк'); return; }
          const n = await bulkImport(valid, date); onDone(n);
        }}><Text style={s.btnText}>Импорт ({valid.length})</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary }]} onPress={onCancel}><Text style={s.btnText}>Отмена</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Metrics Content ── */
function MetricsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const metrics = useHealthStore((s) => s.metrics);
  const entries = useHealthStore((s) => s.entries);
  const addMetric = useHealthStore((s) => s.addMetric);
  const updateMetric = useHealthStore((s) => s.updateMetric);
  const removeMetric = useHealthStore((s) => s.removeMetric);
  const addEntry = useHealthStore((s) => s.addEntry);
  const removeEntry = useHealthStore((s) => s.removeEntry);

  const [showMetricForm, setShowMetricForm] = useState(false);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const entriesForMetric = useCallback(
    (metricId: string) => entries.filter((e) => e.metricId === metricId),
    [entries],
  );

  const renderMetric = ({ item: m }: { item: HealthMetric }) => {
    const isExpanded = expandedMetric === m.id;
    const metricEntries = entriesForMetric(m.id);
    const latest = metricEntries[0];
    const refStr = [m.refMin != null ? String(m.refMin) : '', m.refMax != null ? String(m.refMax) : ''].filter(Boolean).join(' – ');

    // Period info
    let periodInfo = '';
    if (m.periodDays && latest) {
      const diff = daysDiff(latest.date, todayStr());
      const remaining = m.periodDays - diff;
      if (remaining <= 0) periodInfo = 'Пора сдавать!';
      else if (remaining <= 7) periodInfo = `Через ${remaining} дн.`;
      else periodInfo = `Через ${remaining} дн.`;
    }

    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity onPress={() => setExpandedMetric(isExpanded ? null : m.id)} onLongPress={() =>
          Alert.alert('Удалить', `"${m.name}" и все результаты?`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: () => removeMetric(m.id) },
          ])}>
          <View style={s.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.metricName, { color: c.text }]}>{m.name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {m.unit}{refStr ? ` | Реф: ${refStr}` : ''}{m.periodDays ? ` | Каждые ${m.periodDays} дн.` : ''}
              </Text>
              {periodInfo ? (
                <Text style={{ color: periodInfo === 'Пора сдавать!' ? c.danger : c.warning, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{periodInfo}</Text>
              ) : null}
            </View>
            {latest && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: statusColor(latest.value, m, c) }}>{latest.value}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 11 }}>{latest.date}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
            <TouchableOpacity style={[s.smallBtn, { backgroundColor: c.primary, alignSelf: 'flex-start', marginBottom: 6 }]}
              onPress={() => { setEditingMetric(m); setShowMetricForm(true); }}>
              <Text style={s.btnText}>Ред.</Text>
            </TouchableOpacity>
            {metricEntries.length === 0 && <Text style={{ color: c.textSecondary, fontSize: 12 }}>Нет записей</Text>}
            {metricEntries.map((e) => (
              <TouchableOpacity key={e.id} onLongPress={() =>
                Alert.alert('Удалить?', '', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(e.id) }])
              } style={s.entryRow}>
                <Text style={{ color: statusColor(e.value, m, c), fontWeight: '600', width: 60 }}>{e.value}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, width: 90 }}>{e.date}</Text>
                {e.notes ? <Text style={{ color: c.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>{e.notes}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {showMetricForm && (
        <MetricForm initial={editingMetric ?? undefined} c={c}
          onSave={(m) => { editingMetric ? updateMetric(editingMetric.id, m) : addMetric(m); setShowMetricForm(false); setEditingMetric(null); }}
          onCancel={() => { setShowMetricForm(false); setEditingMetric(null); }} />
      )}
      {showEntryForm && (
        <EntryForm metrics={metrics} c={c}
          onSave={(e) => { addEntry(e); setShowEntryForm(false); }}
          onCancel={() => setShowEntryForm(false)} />
      )}
      {showImportForm && (
        <ImportForm c={c}
          onDone={(n) => { setShowImportForm(false); Alert.alert('Импорт', `Добавлено ${n} записей`); }}
          onCancel={() => setShowImportForm(false)} />
      )}

      <FlatList data={metrics} keyExtractor={(m) => m.id} renderItem={renderMetric}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Добавьте показатели</Text>} />

      <View style={s.fabRow}>
        {!showMetricForm && !showEntryForm && !showImportForm && (
          <>
            <TouchableOpacity style={[s.fab, { backgroundColor: c.primary }]} onPress={() => { setEditingMetric(null); setShowMetricForm(true); }}>
              <Text style={s.fabText}>+ Показатель</Text>
            </TouchableOpacity>
            {metrics.length > 0 && (
              <TouchableOpacity style={[s.fab, { backgroundColor: c.success }]} onPress={() => setShowEntryForm(true)}>
                <Text style={s.fabText}>+ Результат</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.fab, { backgroundColor: c.warning }]} onPress={() => setShowImportForm(true)}>
              <Text style={s.fabText}>Импорт</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Doctors Content ── */
function DoctorsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const visits = useDoctorStore((s) => s.visits);
  const images = useDoctorStore((s) => s.images);
  const addVisit = useDoctorStore((s) => s.addVisit);
  const updateVisit = useDoctorStore((s) => s.updateVisit);
  const removeVisit = useDoctorStore((s) => s.removeVisit);
  const addImage = useDoctorStore((s) => s.addImage);
  const removeImage = useDoctorStore((s) => s.removeImage);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const sorted = useMemo(() => [...visits].sort((a, b) => b.date.localeCompare(a.date)), [visits]);

  const imagesForVisit = useCallback(
    (visitId: string) => images.filter((i) => i.visitId === visitId).sort((a, b) => a.sortOrder - b.sortOrder),
    [images],
  );

  const resetForm = () => { setName(''); setDate(new Date().toISOString().slice(0, 10)); setNotes(''); setShowForm(false); setEditingId(null); };

  const startEdit = (v: DoctorVisit) => {
    setEditingId(v.id); setName(v.name); setDate(v.date); setNotes(v.notes); setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !date.trim()) { Alert.alert('Ошибка', 'Введите название и дату'); return; }
    if (editingId) {
      await updateVisit(editingId, { name: name.trim(), date: date.trim(), notes: notes.trim() });
    } else {
      await addVisit({ name: name.trim(), date: date.trim(), notes: notes.trim() });
    }
    resetForm();
  };

  const handlePickImage = async (visitId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(visitId, r.assets[0].uri);
  };

  const handleCamera = async (visitId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к камере'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(visitId, r.assets[0].uri);
  };

  const handleDelete = (v: DoctorVisit) => {
    Alert.alert('Удалить визит?', v.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeVisit(v.id) },
    ]);
  };

  const handleDeleteImage = (img: DoctorVisitImage) => {
    Alert.alert('Удалить фото?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeImage(img.id) },
    ]);
  };

  const renderVisit = ({ item }: { item: DoctorVisit }) => {
    const isExpanded = expanded === item.id;
    const visitImages = imagesForVisit(item.id);
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>🩺</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.metricName, { color: c.text }]}>{item.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{item.date}</Text>
          </View>
          {visitImages.length > 0 && (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{visitImages.length} фото</Text>
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
            {item.notes ? <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>{item.notes}</Text> : null}

            {visitImages.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {visitImages.map((img) => (
                  <View key={img.id} style={{ marginRight: 8, position: 'relative' }}>
                    <Image source={{ uri: img.imagePath }} style={s.docImg} resizeMode="cover" />
                    <TouchableOpacity style={s.docImgDelete} onPress={() => handleDeleteImage(img)}>
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={s.row}>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border }]} onPress={() => handlePickImage(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border }]} onPress={() => handleCamera(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Камера</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Ред.</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={{ color: '#EF4444', fontSize: 13 }}>Удалить</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {showForm ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={[s.formTitle, { color: c.text }]}>{editingId ? 'Редактировать' : 'Новый визит'}</Text>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Врач / клиника" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
          <DatePickerField value={date} onChange={setDate} label="Дата визита" textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 60 }]} placeholder="Заметки" placeholderTextColor={c.textSecondary} value={notes} onChangeText={setNotes} multiline />
          <View style={s.row}>
            <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
              <Text style={[s.btnText, { textAlign: 'center' }]}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={resetForm}>
              <Text style={[s.btnText, { textAlign: 'center' }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <>
          <TouchableOpacity style={[s.fab, { backgroundColor: c.primary, margin: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 10 }]}
            onPress={() => setShowForm(true)}>
            <Text style={s.fabText}>+ Визит</Text>
          </TouchableOpacity>
          <FlatList
            data={sorted}
            keyExtractor={(v) => v.id}
            renderItem={renderVisit}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
            ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет визитов</Text>}
          />
        </>
      )}
    </View>
  );
}

/* ── Main Screen with tabs ── */
const HEALTH_MODES = [
  { key: 'metrics' as const, label: 'Анализы', icon: '🔬' },
  { key: 'doctors' as const, label: 'Врачи', icon: '🩺' },
];

type HealthMode = 'metrics' | 'doctors';

export function HealthScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [mode, setMode] = useState<HealthMode>('metrics');

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={s.modeRow}>
        {HEALTH_MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[s.modeBtn, { backgroundColor: mode === m.key ? c.primary : c.card, borderColor: c.border, borderWidth: 1 }]}
            onPress={() => setMode(m.key)}
          >
            <Text style={{ fontSize: 16 }}>{m.icon}</Text>
            <Text style={[s.modeBtnText, { color: mode === m.key ? '#FFF' : c.text }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'metrics' ? <MetricsContent /> : <DoctorsContent />}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricName: { fontSize: 15, fontWeight: '700' },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  formCard: { borderWidth: 1, borderRadius: 10, padding: 12, margin: 12 },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14 },
  halfInput: { flex: 1, marginHorizontal: 4 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6 },
  fabRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingBottom: 16, paddingTop: 8 },
  fab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  fabText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  // Mode switcher
  modeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeBtnText: { fontSize: 13, fontWeight: '700' },
  // Doctor images
  docImg: { width: 200, height: 260, borderRadius: 8 },
  docImgDelete: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  docImgBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
});
