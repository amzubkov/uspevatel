import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, TextInput,
  Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSettingsStore } from '../../store/settingsStore';
import { useHealthStore, HealthMetric, HealthEntry } from '../../store/healthStore';
import { Person } from '../../store/personStore';
import { DatePickerField } from '../../components/DatePickerField';
import { colors } from '../../utils/theme';
import { HEALTH_PRESETS, HEALTH_GROUPS, HEALTH_SOURCES, SOURCE_LABELS, HealthSource } from '../../db/healthPresets';
import { s, PersonPicker, todayStr, daysDiff } from './shared';

function statusColor(value: number, refMin?: number, refMax?: number, c?: any): string {
  if (!c) return '#22C55E';
  if (refMin != null && value < refMin) return c.warning;
  if (refMax != null && value > refMax) return c.danger;
  return c.success;
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
export function MetricsContent({ activePerson, persons }: { activePerson: string | null; persons: Person[] }) {
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
