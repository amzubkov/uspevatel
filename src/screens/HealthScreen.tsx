import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, SectionList, TouchableOpacity, TextInput,
  Alert, ScrollView, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useSettingsStore } from '../store/settingsStore';
import { useHealthStore, HealthMetric, HealthEntry, MetricRef } from '../store/healthStore';
import { useDoctorStore, DoctorVisit, DoctorVisitImage, VisitStatus } from '../store/doctorStore';
import { useDoctorContactStore, Doctor } from '../store/doctorContactStore';
import { useAttachmentStore, resolveAttachmentUri, Attachment } from '../store/attachmentStore';
import { usePersonStore, Person } from '../store/personStore';
import { useLabArchiveStore, LabRecord, LabStatus } from '../store/labArchiveStore';
import { fetchProdoctorov } from '../utils/prodoctorovParser';
import { Linking } from 'react-native';
import { DatePickerField } from '../components/DatePickerField';
import { colors } from '../utils/theme';
import { HEALTH_PRESETS, HEALTH_GROUPS, HEALTH_SOURCES, SOURCE_LABELS, HealthSource } from '../db/healthPresets';
import { ZoomableImage } from '../components/ZoomableImage';

function statusColor(value: number, refMin?: number, refMax?: number, c?: any): string {
  if (!c) return '#22C55E';
  if (refMin != null && value < refMin) return c.warning;
  if (refMax != null && value > refMax) return c.danger;
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

/* ── Person Picker (reusable inline chip row) ── */
function PersonPicker({ persons, value, onChange, c }: {
  persons: Person[]; value: string; onChange: (id: string) => void; c: any;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
      {persons.map((p) => (
        <TouchableOpacity key={p.id} onPress={() => onChange(p.id)}
          style={[s.chip, { backgroundColor: p.id === value ? c.primary : c.border, marginRight: 6 }]}>
          <Text style={{ color: p.id === value ? '#FFF' : c.text, fontSize: 13 }}>{p.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

/* ── Entry Form ── */
function EntryForm({ metrics, persons, initial, defaultPersonId, onSave, onCancel, c }: {
  metrics: HealthMetric[]; persons: Person[]; initial?: HealthEntry;
  defaultPersonId: string;
  onSave: (e: Omit<HealthEntry, 'id' | 'createdAt'>) => void; onCancel: () => void; c: any;
}) {
  const [metricId, setMetricId] = useState(initial?.metricId || metrics[0]?.id || '');
  const [value, setValue] = useState(initial ? String(initial.value) : '');
  const [date, setDate] = useState(initial?.date || todayStr());
  const [notes, setNotes] = useState(initial?.notes || '');
  const [personId, setPersonId] = useState(initial?.personId || defaultPersonId || 'me');

  return (
    <View style={[s.formCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.formTitle, { color: c.text }]}>{initial ? 'Редактировать результат' : 'Новый результат'}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 2 }}>Человек</Text>
      <PersonPicker persons={persons} value={personId} onChange={setPersonId} c={c} />
      <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 2 }}>Показатель</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {metrics.map((m) => (
          <TouchableOpacity key={m.id} onPress={() => setMetricId(m.id)}
            style={[s.chip, { backgroundColor: m.id === metricId ? c.primary : c.border, marginRight: 6 }]}>
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
          onSave({ metricId, personId, value: v, date, notes: notes.trim() });
        }}><Text style={s.btnText}>Сохранить</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary }]} onPress={onCancel}><Text style={s.btnText}>Отмена</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Import Form ── */
function ImportForm({ onDone, onCancel, c, persons, defaultPersonId }: {
  onDone: (n: number) => void; onCancel: () => void; c: any;
  persons: Person[]; defaultPersonId: string;
}) {
  const bulkImport = useHealthStore((s) => s.bulkImport);
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayStr());
  const [personId, setPersonId] = useState(defaultPersonId || 'me');
  const parsed = useMemo(() => {
    return text.split('\n').map((line) => {
      const t = line.trim(); if (!t || t === '---') return null;
      const parts = t.split(/[;\t]/).map((p) => p.trim());
      if (parts.length < 2) return { raw: t, error: true as const };
      const name = parts[0];
      const maybeValue = parseFloat(parts[1].replace(',', '.'));

      if (!isNaN(maybeValue)) {
        // Result line: name, value
        return { kind: 'result' as const, name, value: maybeValue, error: false as const };
      } else {
        // Metric definition: name, unit, refMin, refMax
        const unit = parts[1];
        const refMin = parts[2] ? parseFloat(parts[2].replace(',', '.')) : undefined;
        const refMax = parts[3] ? parseFloat(parts[3].replace(',', '.')) : undefined;
        return { kind: 'metric' as const, name, unit, refMin: isNaN(refMin as any) ? undefined : refMin, refMax: isNaN(refMax as any) ? undefined : refMax, error: false as const };
      }
    }).filter(Boolean) as any[];
  }, [text]);
  const valid = parsed.filter((p: any) => !p.error);
  const errors = parsed.filter((p: any) => p.error);

  return (
    <View style={[s.formCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.formTitle, { color: c.text }]}>Импорт анализов</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 2 }}>Человек</Text>
      <PersonPicker persons={persons} value={personId} onChange={setPersonId} c={c} />
      <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 6 }}>
        Результаты: Название, значение{'\n'}
        Показатели: Название, ед.изм, реф.мин, реф.макс
      </Text>
      <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 140, textAlignVertical: 'top' }]}
        placeholder={'Гемоглобин, 140\nХолестерин, 5.2\n---\nГемоглобин, г/л, 120, 170'} placeholderTextColor={c.textSecondary} value={text} onChangeText={setText} multiline />
      <DatePickerField value={date} onChange={setDate} label="Дата" textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
      {parsed.length > 0 && (
        <View style={{ marginBottom: 4 }}>
          <Text style={{ color: c.success, fontSize: 12 }}>
            Распознано: {valid.filter((p: any) => p.kind === 'result').length} результатов, {valid.filter((p: any) => p.kind === 'metric').length} показателей
            {errors.length > 0 ? `, ошибок: ${errors.length}` : ''}
          </Text>
        </View>
      )}
      <View style={s.row}>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.primary }]} onPress={async () => {
          if (!valid.length) { Alert.alert('Ошибка', 'Нет строк'); return; }
          const results = valid.filter((p: any) => p.kind === 'result');
          const metricDefs = valid.filter((p: any) => p.kind === 'metric');
          let count = 0;
          // Import metric definitions first
          if (metricDefs.length) {
            count += await bulkImport(metricDefs.map((m: any) => ({ name: m.name, value: 0, unit: m.unit, refMin: m.refMin, refMax: m.refMax })), date, personId);
            // Remove the dummy 0-value entries just created
            // Actually, better: add metrics without entries
          }
          if (results.length) {
            count = await bulkImport(results, date, personId);
          }
          // For metric-only imports, just add metrics via addMetric
          if (metricDefs.length && !results.length) {
            const { addMetric, metrics } = useHealthStore.getState();
            for (const m of metricDefs) {
              const exists = metrics.find((x) => x.name.toLowerCase() === m.name.toLowerCase());
              if (!exists) await addMetric({ name: m.name, unit: m.unit || '', refMin: m.refMin, refMax: m.refMax, periodDays: undefined });
              else {
                const { updateMetric } = useHealthStore.getState();
                await updateMetric(exists.id, { unit: m.unit || exists.unit, refMin: m.refMin ?? exists.refMin, refMax: m.refMax ?? exists.refMax });
              }
            }
            count = metricDefs.length;
          }
          onDone(count);
        }}><Text style={s.btnText}>Импорт ({valid.length})</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary }]} onPress={onCancel}><Text style={s.btnText}>Отмена</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Metrics Content ── */
function MetricsContent({ activePerson, persons }: { activePerson: string | null; persons: Person[] }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const metrics = useHealthStore((s) => s.metrics);
  const metricRefs = useHealthStore((s) => s.metricRefs);
  const allEntries = useHealthStore((s) => s.entries);
  const entries = useMemo(
    () => (activePerson ? allEntries.filter((e) => e.personId === activePerson) : allEntries),
    [allEntries, activePerson],
  );
  const [selectedSource, setSelectedSource] = useState<HealthSource | null>(null);
  const addMetric = useHealthStore((s) => s.addMetric);
  const updateMetric = useHealthStore((s) => s.updateMetric);
  const removeMetric = useHealthStore((s) => s.removeMetric);
  const addEntry = useHealthStore((s) => s.addEntry);
  const updateEntry = useHealthStore((s) => s.updateEntry);
  const removeEntry = useHealthStore((s) => s.removeEntry);

  const [showMetricForm, setShowMetricForm] = useState(false);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HealthEntry | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProblems, setShowProblems] = useState(false);
  const [showExpired, setShowExpired] = useState(false);

  const getRef = useCallback((metricId: string): { refMin?: number; refMax?: number; periodDays?: number } | null => {
    if (!selectedSource) return null; // use metric's own refs
    return metricRefs.find((r) => r.metricId === metricId && r.source === selectedSource) || null;
  }, [metricRefs, selectedSource]);

  const filteredMetrics = useMemo(() => {
    let result = metrics;
    if (selectedSource) {
      const hasRef = new Set(metricRefs.filter((r) => r.source === selectedSource).map((r) => r.metricId));
      result = result.filter((m) => hasRef.has(m.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q));
    }
    if (showProblems) {
      result = result.filter((m) => {
        const latest = entries.filter((e) => e.metricId === m.id).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!latest) return false;
        const srcRef = getRef(m.id);
        const refMin = srcRef ? srcRef.refMin : m.refMin;
        const refMax = srcRef ? srcRef.refMax : m.refMax;
        return (refMin != null && latest.value < refMin) || (refMax != null && latest.value > refMax);
      });
    }
    if (showExpired) {
      const today = todayStr();
      result = result.filter((m) => {
        const srcRef = getRef(m.id);
        const period = srcRef ? srcRef.periodDays : m.periodDays;
        if (!period) return false;
        const latest = entries.filter((e) => e.metricId === m.id).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!latest) return true; // never taken — overdue
        return daysDiff(latest.date, today) >= period;
      });
    }
    return result;
  }, [metrics, metricRefs, selectedSource, searchQuery, showProblems, showExpired, entries, getRef]);

  const entriesForMetric = useCallback(
    (metricId: string) => entries.filter((e) => e.metricId === metricId).sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  const renderMetric = ({ item: m }: { item: HealthMetric }) => {
    const isExpanded = expandedMetric === m.id;
    const metricEntries = entriesForMetric(m.id);
    const latest = metricEntries[0];
    const srcRef = getRef(m.id);
    const activeRefMin = srcRef ? srcRef.refMin : m.refMin;
    const activeRefMax = srcRef ? srcRef.refMax : m.refMax;
    const activePeriod = srcRef ? srcRef.periodDays : m.periodDays;
    const refStr = [activeRefMin != null ? String(activeRefMin) : '', activeRefMax != null ? String(activeRefMax) : ''].filter(Boolean).join(' – ');

    // Sources available for this metric
    const sources = metricRefs.filter((r) => r.metricId === m.id).map((r) => r.source);

    // Period info
    let periodInfo = '';
    if (activePeriod && latest) {
      const diff = daysDiff(latest.date, todayStr());
      const remaining = activePeriod - diff;
      if (remaining <= 0) periodInfo = 'Пора сдавать!';
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
                {m.unit}{refStr ? ` | Реф: ${refStr}` : ''}{activePeriod ? ` | ${activePeriod} дн.` : ''}
                {sources.length > 0 ? `  ${sources.map((s) => SOURCE_LABELS[s as HealthSource] || s).join(' ')}` : ''}
              </Text>
              {periodInfo ? (
                <Text style={{ color: periodInfo === 'Пора сдавать!' ? c.danger : c.warning, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{periodInfo}</Text>
              ) : null}
            </View>
            {latest && (() => {
              const age = daysDiff(latest.date, todayStr());
              const ageColor = activePeriod && age > activePeriod ? c.danger : age > 90 ? c.warning : c.textSecondary;
              return (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: statusColor(latest.value, activeRefMin, activeRefMax, c) }}>{latest.value}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11 }}>{latest.date}</Text>
                  <Text style={{ color: ageColor, fontSize: 10, fontWeight: '600' }}>{age} дн. назад</Text>
                </View>
              );
            })()}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
            <TouchableOpacity style={[s.smallBtn, { backgroundColor: c.primary, alignSelf: 'flex-start', marginBottom: 6 }]}
              onPress={() => { setEditingMetric(m); setShowMetricForm(true); }}>
              <Text style={s.btnText}>Ред.</Text>
            </TouchableOpacity>
            {metricEntries.length === 0 && <Text style={{ color: c.textSecondary, fontSize: 12 }}>Нет записей</Text>}
            {metricEntries.map((e) => {
              const eAge = daysDiff(e.date, todayStr());
              return (
                <TouchableOpacity key={e.id}
                  onPress={() => { setEditingEntry(e); setShowEntryForm(true); }}
                  onLongPress={() =>
                    Alert.alert('Удалить?', '', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => removeEntry(e.id) }])
                  } style={s.entryRow}>
                  <Text style={{ color: statusColor(e.value, activeRefMin, activeRefMax, c), fontWeight: '600', width: 60 }}>{e.value}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12, width: 80 }}>{e.date}</Text>
                  <Text style={{ color: eAge > 90 ? c.warning : c.textSecondary, fontSize: 11, width: 40 }}>{eAge}д</Text>
                  {e.notes ? <Text style={{ color: c.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>{e.notes}</Text> : null}
                </TouchableOpacity>
              );
            })}
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
        <EntryForm metrics={metrics} persons={persons} initial={editingEntry ?? undefined} c={c}
          defaultPersonId={activePerson || 'me'}
          onSave={(e) => {
            if (editingEntry) { updateEntry(editingEntry.id, e); }
            else { addEntry(e); }
            setShowEntryForm(false); setEditingEntry(null);
          }}
          onCancel={() => { setShowEntryForm(false); setEditingEntry(null); }} />
      )}
      {showImportForm && (
        <ImportForm c={c}
          persons={persons} defaultPersonId={activePerson || 'me'}
          onDone={(n) => { setShowImportForm(false); Alert.alert('Импорт', `Добавлено ${n} записей`); }}
          onCancel={() => setShowImportForm(false)} />
      )}

      {/* Source switcher */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ minHeight: 34, maxHeight: 34 }}
        contentContainerStyle={{ gap: 4, paddingHorizontal: 8, alignItems: 'center' }}>
        <TouchableOpacity
          style={[s.chip, { backgroundColor: !selectedSource ? c.primary : c.border }]}
          onPress={() => setSelectedSource(null)}>
          <Text style={{ color: !selectedSource ? '#FFF' : c.text, fontSize: 11, fontWeight: '600' }}>Все</Text>
        </TouchableOpacity>
        {HEALTH_SOURCES.map((src) => (
          <TouchableOpacity key={src}
            style={[s.chip, { backgroundColor: selectedSource === src ? c.primary : c.border }]}
            onPress={() => setSelectedSource(selectedSource === src ? null : src)}>
            <Text style={{ color: selectedSource === src ? '#FFF' : c.text, fontSize: 11, fontWeight: '600' }}>{SOURCE_LABELS[src]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search + problem filter */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 6 }}>
        <TextInput
          style={{ flex: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderRadius: 6, borderColor: c.border, color: c.text, backgroundColor: c.card }}
          placeholder="Поиск анализов..."
          placeholderTextColor={c.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[s.chip, { backgroundColor: showProblems ? c.danger : c.border, paddingHorizontal: 8, paddingVertical: 5 }]}
          onPress={() => setShowProblems(!showProblems)}>
          <Text style={{ color: showProblems ? '#FFF' : c.text, fontSize: 11, fontWeight: '700' }}>Проблемы</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.chip, { backgroundColor: showExpired ? c.warning : c.border, paddingHorizontal: 8, paddingVertical: 5 }]}
          onPress={() => setShowExpired(!showExpired)}>
          <Text style={{ color: showExpired ? '#FFF' : c.text, fontSize: 11, fontWeight: '700' }}>Пересдать</Text>
        </TouchableOpacity>
      </View>

      <SectionList
        sections={(() => {
          // Build group map from presets
          const groupMap = new Map<string, string>();
          for (const p of HEALTH_PRESETS) groupMap.set(p.name.toLowerCase(), p.group);
          // Group metrics
          const grouped = new Map<string, HealthMetric[]>();
          for (const m of filteredMetrics) {
            const group = groupMap.get(m.name.toLowerCase()) || 'Другое';
            const arr = grouped.get(group) || [];
            arr.push(m);
            grouped.set(group, arr);
          }
          // Sort groups by HEALTH_GROUPS order
          const sections: { title: string; data: HealthMetric[] }[] = [];
          for (const g of [...HEALTH_GROUPS, 'Другое']) {
            const data = grouped.get(g);
            if (data?.length) sections.push({ title: g, data });
          }
          return sections;
        })()}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => renderMetric({ item })}
        renderSectionHeader={({ section }) => (
          <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>
            {section.title}
          </Text>
        )}
        contentContainerStyle={{ padding: 0, paddingBottom: 12 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Добавьте показатели</Text>}
        stickySectionHeadersEnabled={false}
      />

      <View style={s.fabRow}>
        {!showMetricForm && !showEntryForm && !showImportForm && (
          <>
            <TouchableOpacity style={[s.fab, { backgroundColor: c.primary }]} onPress={() => { setEditingMetric(null); setShowMetricForm(true); }}>
              <Text style={s.fabText}>+ Показатель</Text>
            </TouchableOpacity>
            {metrics.length > 0 && (
              <TouchableOpacity style={[s.fab, { backgroundColor: c.success }]} onPress={() => { setEditingEntry(null); setShowEntryForm(true); }}>
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
function DoctorsContent({ activePerson, persons }: { activePerson: string | null; persons: Person[] }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const allVisits = useDoctorStore((s) => s.visits);
  const images = useDoctorStore((s) => s.images);
  const addVisit = useDoctorStore((s) => s.addVisit);
  const updateVisit = useDoctorStore((s) => s.updateVisit);
  const removeVisit = useDoctorStore((s) => s.removeVisit);
  const addImage = useDoctorStore((s) => s.addImage);
  const removeImage = useDoctorStore((s) => s.removeImage);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullImg, setFullImg] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [personId, setPersonId] = useState<string>(activePerson || 'me');
  const [status, setStatus] = useState<VisitStatus>('done');

  const visits = useMemo(
    () => (activePerson ? allVisits.filter((v) => v.personId === activePerson) : allVisits),
    [allVisits, activePerson],
  );
  const today = todayStr();
  const planned = useMemo(
    () => visits.filter((v) => v.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)),
    [visits],
  );
  const history = useMemo(
    () => visits.filter((v) => v.status !== 'planned').sort((a, b) => b.date.localeCompare(a.date)),
    [visits],
  );
  const sorted = useMemo(() => [...planned, ...history], [planned, history]);

  const imagesForVisit = useCallback(
    (visitId: string) => images.filter((i) => i.visitId === visitId).sort((a, b) => a.sortOrder - b.sortOrder),
    [images],
  );

  const resetForm = () => {
    setName(''); setDate(new Date().toISOString().slice(0, 10)); setNotes('');
    setShowForm(false); setEditingId(null);
    setPersonId(activePerson || 'me'); setStatus('done');
  };

  const startEdit = (v: DoctorVisit) => {
    setEditingId(v.id); setName(v.name); setDate(v.date); setNotes(v.notes);
    setPersonId(v.personId || 'me'); setStatus(v.status);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !date.trim()) { Alert.alert('Ошибка', 'Введите название и дату'); return; }
    const payload = { name: name.trim(), date: date.trim(), notes: notes.trim(), personId, status };
    if (editingId) {
      await updateVisit(editingId, payload);
    } else {
      await addVisit(payload);
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
    const isPlanned = item.status === 'planned';
    const personName = persons.find((p) => p.id === item.personId)?.name || '';
    const daysToVisit = isPlanned ? daysDiff(today, item.date) : 0;
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: isPlanned ? c.warning : c.success }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>{isPlanned ? '📅' : '🩺'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.metricName, { color: c.text }]}>{item.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {item.date}{personName ? ` · ${personName}` : ''}
              {isPlanned && daysToVisit >= 0 ? ` · через ${daysToVisit} дн.` : ''}
              {isPlanned && daysToVisit < 0 ? ` · просрочен ${-daysToVisit} дн.` : ''}
            </Text>
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
                    <TouchableOpacity onPress={() => setFullImg(img.imagePath)}>
                      <Image source={{ uri: img.imagePath }} style={s.docImg} resizeMode="cover" />
                    </TouchableOpacity>
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

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Ред.</Text>
              </TouchableOpacity>
              {isPlanned && (
                <TouchableOpacity onPress={() => updateVisit(item.id, { status: 'done' })}>
                  <Text style={{ color: c.success, fontSize: 13, fontWeight: '600' }}>✓ Состоялся</Text>
                </TouchableOpacity>
              )}
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
          <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 2 }}>Человек</Text>
          <PersonPicker persons={persons} value={personId} onChange={setPersonId} c={c} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TouchableOpacity
              style={[s.chip, { backgroundColor: status === 'planned' ? c.warning : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
              onPress={() => setStatus('planned')}>
              <Text style={{ color: status === 'planned' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Запланирован</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.chip, { backgroundColor: status === 'done' ? c.success : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
              onPress={() => setStatus('done')}>
              <Text style={{ color: status === 'done' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Состоялся</Text>
            </TouchableOpacity>
          </View>
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

      <ZoomableImage uri={fullImg} onClose={() => setFullImg(null)} />
    </View>
  );
}

/* ── Doctor Contacts Content ── */
function DoctorContactsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const city = useSettingsStore((s) => s.city);
  const doctors = useDoctorContactStore((s) => s.doctors);
  const addDoctor = useDoctorContactStore((s) => s.addDoctor);
  const updateDoctor = useDoctorContactStore((s) => s.updateDoctor);
  const removeDoctor = useDoctorContactStore((s) => s.removeDoctor);
  const attachments = useAttachmentStore((s) => s.attachments);
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const removeAttachment = useAttachmentStore((s) => s.removeAttachment);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [clinic, setClinic] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [fetching, setFetching] = useState(false);
  // Pending business-card photos for a NEW contact (no id yet). Attached on save.
  const [pendingCards, setPendingCards] = useState<{ uri: string; name: string; mimeType?: string; size?: number }[]>([]);
  const [fullCardImg, setFullCardImg] = useState<string | null>(null);

  const cardsForDoctor = (id: string): Attachment[] =>
    attachments.filter((a) => a.entityType === 'doctor' && a.entityId === id);

  const reset = () => {
    setName(''); setSpecialty(''); setPhone(''); setAddress('');
    setClinic(''); setUrl(''); setNotes('');
    setPendingCards([]);
    setEditingId(null); setShowForm(false);
  };

  const startEdit = (d: Doctor) => {
    setEditingId(d.id); setName(d.name); setSpecialty(d.specialty); setPhone(d.phone);
    setAddress(d.address); setClinic(d.clinic); setUrl(d.url); setNotes(d.notes);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
    const data = {
      name: name.trim(), specialty: specialty.trim(), phone: phone.trim(),
      address: address.trim(), clinic: clinic.trim(), url: url.trim(), notes: notes.trim(),
    };
    let targetId = editingId;
    if (editingId) {
      await updateDoctor(editingId, data);
    } else {
      targetId = await addDoctor(data);
    }
    // Flush pending card photos to the now-known doctor id.
    if (targetId && pendingCards.length > 0) {
      for (const p of pendingCards) {
        try { await addAttachment('doctor', targetId, p.uri, p.name, p.mimeType, p.size); } catch {}
      }
    }
    reset();
  };

  const pickCardImage = async (fromCamera: boolean) => {
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к камере'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее'); return; }
    }
    const r = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const fileName = a.fileName || `card-${Date.now()}.jpg`;
    if (editingId) {
      try { await addAttachment('doctor', editingId, a.uri, fileName, a.mimeType, a.fileSize); }
      catch (e: any) { Alert.alert('Ошибка', e?.message || 'Не удалось сохранить'); }
    } else {
      setPendingCards((p) => [...p, { uri: a.uri, name: fileName, mimeType: a.mimeType, size: a.fileSize }]);
    }
  };

  const handleDeleteCard = (att: Attachment) => {
    Alert.alert('Удалить визитку?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeAttachment(att.id) },
    ]);
  };

  const handleDeletePending = (uri: string) => {
    setPendingCards((p) => p.filter((x) => x.uri !== uri));
  };

  const handleFetchFromUrl = async () => {
    if (!url.trim()) { Alert.alert('Нет URL', 'Сначала вставьте ссылку на prodoctorov'); return; }
    setFetching(true);
    const data = await fetchProdoctorov(url.trim());
    setFetching(false);
    const rawLine = data?.rawTitle ? `\n\nТitle: ${data.rawTitle}` : '';
    if (!data || (!data.name && !data.specialty && !data.clinic)) {
      Alert.alert('Ничего не распознал', `Заполни поля вручную${rawLine}`);
      return;
    }
    if (data.name && !name.trim()) setName(data.name);
    if (data.specialty && !specialty.trim()) setSpecialty(data.specialty);
    if (data.clinic && !clinic.trim()) setClinic(data.clinic);
    const recognised = [
      data.name && `имя: ${data.name}`,
      data.specialty && `спец.: ${data.specialty}`,
      data.clinic && `клиника: ${data.clinic}`,
      data.city && `город: ${data.city}`,
    ].filter(Boolean).join('\n');
    Alert.alert('Распознано', `${recognised}${rawLine}`);
  };

  const handleSearchProdoctorov = async () => {
    if (!city) {
      Alert.alert('Город не указан', 'Введите город в настройках (напр. moskva, spb)');
      return;
    }
    const q = (name.trim() || specialty.trim()) || '';
    const target = `https://prodoctorov.ru/${encodeURIComponent(city)}/${q ? '?q=' + encodeURIComponent(q) : ''}`;
    Linking.openURL(target).catch(() => Alert.alert('Не открылось', target));
  };

  const handleOpenUrl = () => {
    if (!url.trim()) return;
    Linking.openURL(url.trim()).catch(() => Alert.alert('Не открылось', url));
  };

  const handleCallPhone = (p: string) => {
    if (!p) return;
    Linking.openURL(`tel:${p.replace(/[^\d+]/g, '')}`).catch(() => {});
  };

  const handleDelete = (d: Doctor) => {
    Alert.alert('Удалить контакт?', d.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        // Cascade-delete attached card photos for this doctor.
        for (const a of cardsForDoctor(d.id)) {
          try { await removeAttachment(a.id); } catch {}
        }
        await removeDoctor(d.id);
      } },
    ]);
  };

  if (showForm) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        <Text style={[s.formTitle, { color: c.text }]}>{editingId ? 'Редактировать контакт' : 'Новый контакт'}</Text>
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="ФИО" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Специализация" placeholderTextColor={c.textSecondary} value={specialty} onChangeText={setSpecialty} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Телефон" placeholderTextColor={c.textSecondary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Клиника" placeholderTextColor={c.textSecondary} value={clinic} onChangeText={setClinic} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Адрес" placeholderTextColor={c.textSecondary} value={address} onChangeText={setAddress} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, flex: 1 }]} placeholder="prodoctorov.ru/..." placeholderTextColor={c.textSecondary} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
          <TouchableOpacity onPress={handleOpenUrl} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 18 }}>🔗</Text>
          </TouchableOpacity>
        </View>
        <View style={[s.row, { marginBottom: 8 }]}>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1, opacity: fetching ? 0.6 : 1 }]} onPress={handleFetchFromUrl} disabled={fetching}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>{fetching ? 'Загрузка…' : 'Заполнить из URL'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, flex: 1 }]} onPress={handleSearchProdoctorov}>
            <Text style={[s.btnText, { textAlign: 'center', color: c.text }]}>Поиск {city ? `(${city})` : ''}</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 60 }]} placeholder="Заметки" placeholderTextColor={c.textSecondary} value={notes} onChangeText={setNotes} multiline />

        {/* Business card photos */}
        <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 6 }}>Визитки</Text>
        {(() => {
          const saved = editingId ? cardsForDoctor(editingId) : [];
          const hasAny = saved.length > 0 || pendingCards.length > 0;
          return hasAny ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {saved.map((a) => {
                const uri = resolveAttachmentUri(a);
                return (
                  <View key={a.id} style={{ marginRight: 8, position: 'relative' }}>
                    <TouchableOpacity onPress={() => setFullCardImg(uri)}>
                      <Image source={{ uri }} style={s.docImg} resizeMode="cover" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.docImgDelete} onPress={() => handleDeleteCard(a)}>
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {pendingCards.map((p) => (
                <View key={p.uri} style={{ marginRight: 8, position: 'relative' }}>
                  <TouchableOpacity onPress={() => setFullCardImg(p.uri)}>
                    <Image source={{ uri: p.uri }} style={s.docImg} resizeMode="cover" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.docImgDelete} onPress={() => handleDeletePending(p.uri)}>
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null;
        })()}
        <View style={[s.row, { marginBottom: 12 }]}>
          <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickCardImage(true)}>
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>📷 Камера</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickCardImage(false)}>
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>🖼 Галерея</Text>
          </TouchableOpacity>
        </View>

        <View style={s.row}>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={reset}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
        <ZoomableImage uri={fullCardImg} onClose={() => setFullCardImg(null)} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={[s.fab, { backgroundColor: c.primary, margin: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 10 }]}
        onPress={() => setShowForm(true)}>
        <Text style={s.fabText}>+ Контакт</Text>
      </TouchableOpacity>
      <FlatList
        data={doctors}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => startEdit(item)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{item.name}</Text>
              {cardsForDoctor(item.id).length > 0 && (
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>📇 {cardsForDoctor(item.id).length}</Text>
              )}
            </View>
            {!!item.specialty && <Text style={{ color: c.primary, fontSize: 13, marginTop: 2 }}>{item.specialty}</Text>}
            {!!item.clinic && <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{item.clinic}</Text>}
            {!!item.phone && (
              <TouchableOpacity onPress={() => handleCallPhone(item.phone)} style={{ marginTop: 4 }}>
                <Text style={{ color: c.primary, fontSize: 13 }}>📞 {item.phone}</Text>
              </TouchableOpacity>
            )}
            {!!item.address && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>{item.address}</Text>}
            {!!item.url && (
              <TouchableOpacity onPress={() => Linking.openURL(item.url).catch(() => {})} style={{ marginTop: 4 }}>
                <Text style={{ color: c.primary, fontSize: 12 }} numberOfLines={1}>🔗 {item.url}</Text>
              </TouchableOpacity>
            )}
            {!!item.notes && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>{item.notes}</Text>}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет контактов</Text>}
      />
    </View>
  );
}

/* ── Archive Content (lab results files) ── */
function ArchiveContent({ activePerson, persons }: { activePerson: string | null; persons: Person[] }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const allRecords = useLabArchiveStore((s) => s.records);
  const addRecord = useLabArchiveStore((s) => s.addRecord);
  const updateRecord = useLabArchiveStore((s) => s.updateRecord);
  const removeRecord = useLabArchiveStore((s) => s.removeRecord);
  const attachments = useAttachmentStore((s) => s.attachments);
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const removeAttachment = useAttachmentStore((s) => s.removeAttachment);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullImg, setFullImg] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [personId, setPersonId] = useState<string>(activePerson || 'me');
  const [status, setStatus] = useState<LabStatus>('done');

  const records = useMemo(
    () => (activePerson ? allRecords.filter((r) => r.personId === activePerson) : allRecords),
    [allRecords, activePerson],
  );
  const planned = useMemo(
    () => records.filter((r) => r.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)),
    [records],
  );
  const history = useMemo(
    () => records.filter((r) => r.status !== 'planned').sort((a, b) => b.date.localeCompare(a.date)),
    [records],
  );
  const sorted = useMemo(() => [...planned, ...history], [planned, history]);
  const today = todayStr();

  const filesFor = (id: string) => attachments.filter((a) => a.entityType === 'lab_archive' && a.entityId === id);
  const isImage = (a: Attachment) => (a.mimeType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(a.name);

  const reset = () => {
    setName(''); setDate(todayStr()); setNotes('');
    setEditingId(null); setShowForm(false);
    setPersonId(activePerson || 'me'); setStatus('done');
  };

  const startEdit = (r: LabRecord) => {
    setEditingId(r.id); setName(r.name); setDate(r.date); setNotes(r.notes);
    setPersonId(r.personId || 'me'); setStatus(r.status);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !date.trim()) { Alert.alert('Ошибка', 'Введите название и дату'); return; }
    const payload = { name: name.trim(), date: date.trim(), notes: notes.trim(), personId, status };
    if (editingId) {
      await updateRecord(editingId, payload);
    } else {
      await addRecord(payload);
    }
    reset();
  };

  const handleDelete = (r: LabRecord) => {
    Alert.alert('Удалить запись?', r.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          for (const a of filesFor(r.id)) {
            try { await removeAttachment(a.id); } catch {}
          }
          await removeRecord(r.id);
        },
      },
    ]);
  };

  const pickFile = async (recordId: string) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await addAttachment('lab_archive', recordId, a.uri, a.name || `file-${Date.now()}`, a.mimeType, a.size);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось добавить файл');
    }
  };

  const pickImage = async (recordId: string, fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const { status: ps } = await ImagePicker.requestCameraPermissionsAsync();
        if (ps !== 'granted') { Alert.alert('Нет доступа', 'Разрешите камеру'); return; }
      } else {
        const { status: ps } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (ps !== 'granted') { Alert.alert('Нет доступа', 'Разрешите галерею'); return; }
      }
      const r = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      const fileName = a.fileName || `lab-${Date.now()}.jpg`;
      await addAttachment('lab_archive', recordId, a.uri, fileName, a.mimeType, a.fileSize);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось добавить');
    }
  };

  const openFile = async (a: Attachment) => {
    const uri = resolveAttachmentUri(a);
    if (isImage(a)) { setFullImg(uri); return; }
    try {
      const can = await Sharing.isAvailableAsync();
      if (!can) { Alert.alert('Не поддерживается', 'Sharing недоступен'); return; }
      await Sharing.shareAsync(uri, { mimeType: a.mimeType, dialogTitle: a.name });
    } catch (e: any) {
      Alert.alert('Не открылось', e?.message || '');
    }
  };

  const handleDeleteFile = (a: Attachment) => {
    Alert.alert('Удалить файл?', a.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeAttachment(a.id) },
    ]);
  };

  if (showForm) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        <Text style={[s.formTitle, { color: c.text }]}>{editingId ? 'Редактировать' : 'Новая запись'}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 2 }}>Человек</Text>
        <PersonPicker persons={persons} value={personId} onChange={setPersonId} c={c} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity
            style={[s.chip, { backgroundColor: status === 'planned' ? c.warning : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={() => setStatus('planned')}>
            <Text style={{ color: status === 'planned' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Запланирована</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.chip, { backgroundColor: status === 'done' ? c.success : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={() => setStatus('done')}>
            <Text style={{ color: status === 'done' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Сдана</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Название (напр. ОАК, биохимия)" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
        <DatePickerField value={date} onChange={setDate} label="Дата" textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 60 }]} placeholder="Заметки (клиника, врач, и т.п.)" placeholderTextColor={c.textSecondary} value={notes} onChangeText={setNotes} multiline />
        <View style={s.row}>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={reset}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const renderRecord = ({ item }: { item: LabRecord }) => {
    const isExpanded = expanded === item.id;
    const files = filesFor(item.id);
    const isPlanned = item.status === 'planned';
    const personName = persons.find((p) => p.id === item.personId)?.name || '';
    const daysTo = isPlanned ? daysDiff(today, item.date) : 0;
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: isPlanned ? c.warning : c.success }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>{isPlanned ? '📅' : '📁'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.metricName, { color: c.text }]}>{item.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {item.date}{personName ? ` · ${personName}` : ''}
              {isPlanned && daysTo >= 0 ? ` · через ${daysTo} дн.` : ''}
              {isPlanned && daysTo < 0 ? ` · просрочена ${-daysTo} дн.` : ''}
            </Text>
          </View>
          {files.length > 0 && (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>📎 {files.length}</Text>
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
            {item.notes ? <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>{item.notes}</Text> : null}

            {files.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                {files.map((a) => (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
                    {isImage(a) ? (
                      <TouchableOpacity onPress={() => openFile(a)}>
                        <Image source={{ uri: resolveAttachmentUri(a) }} style={{ width: 40, height: 40, borderRadius: 4 }} />
                      </TouchableOpacity>
                    ) : (
                      <Text style={{ fontSize: 24 }}>📄</Text>
                    )}
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => openFile(a)}>
                      <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={1}>{a.name}</Text>
                      {a.size ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>{Math.round(a.size / 1024)} KB</Text> : null}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteFile(a)} style={{ paddingHorizontal: 8 }}>
                      <Text style={{ color: '#EF4444', fontSize: 18 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={[s.row, { marginBottom: 6 }]}>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickFile(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>📄 Файл/PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickImage(item.id, false)}>
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>🖼 Галерея</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickImage(item.id, true)}>
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>📷 Камера</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 6, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Ред.</Text>
              </TouchableOpacity>
              {isPlanned && (
                <TouchableOpacity onPress={() => updateRecord(item.id, { status: 'done' })}>
                  <Text style={{ color: c.success, fontSize: 13, fontWeight: '600' }}>✓ Сдана</Text>
                </TouchableOpacity>
              )}
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
      <TouchableOpacity style={[s.fab, { backgroundColor: c.primary, margin: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 10 }]}
        onPress={() => setShowForm(true)}>
        <Text style={s.fabText}>+ Запись</Text>
      </TouchableOpacity>
      <FlatList
        data={sorted}
        keyExtractor={(r) => r.id}
        renderItem={renderRecord}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет записей</Text>}
      />
      <ZoomableImage uri={fullImg} onClose={() => setFullImg(null)} />
    </View>
  );
}

/* ── Main Screen with tabs ── */
const HEALTH_MODES = [
  { key: 'metrics' as const, label: 'Анализы', icon: '🔬' },
  { key: 'doctors' as const, label: 'Визиты', icon: '🩺' },
  { key: 'archive' as const, label: 'Архив', icon: '📁' },
  { key: 'contacts' as const, label: 'Контакты', icon: '👨‍⚕️' },
];

type HealthMode = 'metrics' | 'doctors' | 'archive' | 'contacts';

export function HealthScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const persons = usePersonStore((s) => s.persons);
  const [mode, setMode] = useState<HealthMode>('metrics');
  const [activePerson, setActivePerson] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ minHeight: 36, maxHeight: 36, marginTop: 4 }}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 8, alignItems: 'center' }}>
        <TouchableOpacity
          style={[s.chip, { backgroundColor: !activePerson ? c.primary : c.border, paddingHorizontal: 10, paddingVertical: 5 }]}
          onPress={() => setActivePerson(null)}>
          <Text style={{ color: !activePerson ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Все</Text>
        </TouchableOpacity>
        {persons.map((p) => (
          <TouchableOpacity key={p.id}
            style={[s.chip, { backgroundColor: activePerson === p.id ? c.primary : c.border, paddingHorizontal: 10, paddingVertical: 5 }]}
            onPress={() => setActivePerson(p.id)}>
            <Text style={{ color: activePerson === p.id ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.modeRow}>
        {HEALTH_MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[s.modeBtn, { backgroundColor: mode === m.key ? c.primary : c.card, borderColor: c.border, borderWidth: 1 }]}
            onPress={() => setMode(m.key)}
          >
            <Text style={{ fontSize: 14 }}>{m.icon}</Text>
            <Text style={[s.modeBtnText, { color: mode === m.key ? '#FFF' : c.text, fontSize: 11 }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'metrics' && <MetricsContent activePerson={activePerson} persons={persons} />}
      {mode === 'doctors' && <DoctorsContent activePerson={activePerson} persons={persons} />}
      {mode === 'archive' && <ArchiveContent activePerson={activePerson} persons={persons} />}
      {mode === 'contacts' && <DoctorContactsContent />}
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
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
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
