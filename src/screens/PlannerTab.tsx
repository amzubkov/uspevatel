import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, Alert, StyleSheet, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Calendar from 'expo-calendar';
import { useFlightStore, Flight, FlightStatus, FlightKind } from '../store/flightStore';
import { useTravelerStore, Traveler, ME_TRAVELER } from '../store/travelerStore';
import { AttachmentList } from '../components/AttachmentList';
import { DatePickerField } from '../components/DatePickerField';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function fmtDate(date: string, time?: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const now = new Date();
  const showYear = y !== now.getFullYear();
  let s = `${d} ${MONTHS_SHORT[m - 1]}`;
  if (showYear) s += ` ${y}`;
  if (time) s += ` ${time}`;
  return s;
}

const STATUS_LABELS: Record<FlightStatus, string> = {
  planned: 'Планируется',
  booked: 'Забронирован',
  completed: 'Выполнен',
  cancelled: 'Отменён',
};
const STATUS_COLORS: Record<FlightStatus, string> = {
  planned: '#3B82F6',
  booked: '#22C55E',
  completed: '#9CA3AF',
  cancelled: '#EF4444',
};
const STATUSES: FlightStatus[] = ['planned', 'booked', 'completed', 'cancelled'];
const KIND_EMOJI: Record<FlightKind, string> = { flight: '✈️', hotel: '🏨' };
const KIND_LABEL: Record<FlightKind, string> = { flight: 'Перелёт', hotel: 'Отель' };
const KINDS: FlightKind[] = ['flight', 'hotel'];

// ─── Import flights form ───
function ImportFlightsForm({ travelerId, onDone, onCancel, c }: { travelerId: string; onDone: (n: number) => void; onCancel: () => void; c: any }) {
  const addFlight = useFlightStore((s) => s.addFlight);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<FlightKind>('flight');

  const parsed = useMemo(() => {
    return text.split(/\r?\n/).map((line) => {
      const t = line.trim();
      if (!t) return null;
      // Format: title, depart_date [depart_time][, arrive_date [arrive_time]]
      // Split only on ", " (comma+space) to avoid splitting inside titles with commas
      const firstComma = t.indexOf(',');
      if (firstComma === -1) return { raw: t, error: true as const };
      const title = t.slice(0, firstComma).trim();
      const rest = t.slice(firstComma + 1).trim();
      if (!title) return { raw: t, error: true as const };

      const parseDT = (s: string): { date: string; time?: string } | null => {
        const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?$/);
        if (!m) return null;
        return { date: m[1], time: m[2] };
      };

      // rest may be "2026-04-04 14:30, 2026-04-04 19:10" or just "2026-04-04 14:30"
      const commaIdx = rest.indexOf(',');
      let departStr: string;
      let arriveStr: string | undefined;
      if (commaIdx !== -1) {
        departStr = rest.slice(0, commaIdx).trim();
        arriveStr = rest.slice(commaIdx + 1).trim();
      } else {
        departStr = rest;
      }

      const depart = parseDT(departStr);
      if (!depart) return { raw: t, error: true as const };
      const arrive = arriveStr ? parseDT(arriveStr) : undefined;

      return { title, depart, arrive: arrive || undefined, error: false as const };
    }).filter(Boolean) as any[];
  }, [text]);

  const valid = parsed.filter((p: any) => !p.error);
  const errors = parsed.filter((p: any) => p.error);

  const handleImport = async () => {
    if (!valid.length) { Alert.alert('Ошибка', 'Нет строк для импорта'); return; }
    for (const item of valid) {
      await addFlight({
        kind,
        title: item.title,
        status: 'planned',
        departDate: item.depart.date,
        departTime: item.depart.time,
        arriveDate: item.arrive?.date,
        arriveTime: item.arrive?.time,
        notes: '',
        travelerId: (travelerId === ME_TRAVELER.id || travelerId === '__all__') ? undefined : travelerId,
      });
    }
    onDone(valid.length);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
      <Text style={[s.formLabel, { color: c.text, fontSize: 15, fontWeight: '700', textTransform: 'none' }]}>
        Импорт {kind === 'flight' ? 'перелётов' : 'проживания'}
      </Text>

      <Text style={[s.formLabel, { color: c.textSecondary }]}>Тип</Text>
      <View style={s.statusRow}>
        {KINDS.map((k) => (
          <TouchableOpacity key={k}
            style={[s.statusChip, { backgroundColor: kind === k ? c.primary : c.card, borderColor: c.border }]}
            onPress={() => setKind(k)}>
            <Text style={{ color: kind === k ? '#FFF' : c.text, fontSize: 13, fontWeight: '600' }}>
              {KIND_EMOJI[k]} {KIND_LABEL[k]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.formLabel, { color: c.textSecondary }]}>По строке: название, дата [время][, дата прибытия [время]]</Text>
      <TextInput
        style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, height: 140, textAlignVertical: 'top' }]}
        placeholder={'SVO → IST, 2026-04-01 14:30, 2026-04-01 18:45\nIST → TBS, 2026-04-05 10:00'}
        placeholderTextColor={c.textSecondary}
        value={text} onChangeText={setText} multiline
      />

      {parsed.length > 0 && (
        <Text style={{ color: c.primary, fontSize: 12, marginBottom: 8 }}>
          Распознано: {valid.length}{errors.length > 0 ? `, ошибок: ${errors.length}` : ''}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity style={[s.formBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleImport}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Импорт ({valid.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.formBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={onCancel}>
          <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Flights sub-tab ───
function FlightsContent({ travelerId }: { travelerId: string }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const flights = useFlightStore((s) => s.flights);
  const travelers = useTravelerStore((s) => s.travelers);
  const addFlight = useFlightStore((s) => s.addFlight);
  const updateFlight = useFlightStore((s) => s.updateFlight);
  const removeFlight = useFlightStore((s) => s.removeFlight);
  const addImage = useFlightStore((s) => s.addImage);
  const removeImage = useFlightStore((s) => s.removeImage);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [kind, setKind] = useState<FlightKind>('flight');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<FlightStatus>('planned');
  const [departDate, setDepartDate] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [arriveDate, setArriveDate] = useState('');
  const [arriveTime, setArriveTime] = useState('');
  const [notes, setNotes] = useState('');

  const sorted = useMemo(() => {
    const isAll = travelerId === '__all__';
    const isMe = travelerId === ME_TRAVELER.id;
    return flights
      .filter((f) => f.status !== 'completed' && f.status !== 'cancelled')
      .filter((f) => isAll ? true : isMe ? !f.travelerId : f.travelerId === travelerId)
      .sort((a, b) => a.departDate.localeCompare(b.departDate));
  }, [flights, travelerId]);

  const resetForm = () => {
    setKind('flight'); setTitle(''); setStatus('planned'); setDepartDate(''); setDepartTime('');
    setArriveDate(''); setArriveTime(''); setNotes(''); setShowForm(false); setEditingId(null);
  };

  const startEdit = (f: Flight) => {
    setEditingId(f.id); setKind(f.kind); setTitle(f.title); setStatus(f.status);
    setDepartDate(f.departDate); setDepartTime(f.departTime || '');
    setArriveDate(f.arriveDate || ''); setArriveTime(f.arriveTime || '');
    setNotes(f.notes); setShowForm(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !departDate.trim()) {
      Alert.alert('Ошибка', 'Введите название и дату вылета');
      return;
    }
    if (editingId) {
      await updateFlight(editingId, {
        kind, title: title.trim(), status, departDate: departDate.trim(),
        departTime: departTime.trim() || undefined,
        arriveDate: arriveDate.trim() || undefined,
        arriveTime: arriveTime.trim() || undefined,
        notes: notes.trim(),
      });
    } else {
      await addFlight({
        kind, title: title.trim(), status, departDate: departDate.trim(),
        departTime: departTime.trim() || undefined,
        arriveDate: arriveDate.trim() || undefined,
        arriveTime: arriveTime.trim() || undefined,
        notes: notes.trim(),
        travelerId: (travelerId === ME_TRAVELER.id || travelerId === '__all__') ? undefined : travelerId,
      });
    }
    resetForm();
  };

  const handleStatusChange = (flight: Flight) => {
    const buttons = STATUSES.map((s) => ({
      text: STATUS_LABELS[s],
      onPress: () => updateFlight(flight.id, { status: s }),
    }));
    buttons.push({ text: 'Отмена', onPress: async () => {} });
    Alert.alert('Статус', flight.title, buttons);
  };

  const handlePickImage = async (id: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее в настройках'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(id, r.assets[0].uri);
  };

  const handleCamera = async (id: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(id, r.assets[0].uri);
  };

  const handleDelete = (flight: Flight) => {
    Alert.alert('Удалить?', flight.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeFlight(flight.id) },
    ]);
  };

  const renderFlight = ({ item }: { item: Flight }) => {
    const isExpanded = expanded === item.id;
    const sc = STATUS_COLORS[item.status];
    const traveler = item.travelerId ? travelers.find((t) => t.id === item.travelerId) : undefined;
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>{KIND_EMOJI[item.kind]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: c.text }]}>
              {item.title}{traveler && travelerId === '__all__' ? ` (${traveler.icon} ${traveler.name})` : ''}
            </Text>
            <Text style={[s.cardDate, { color: c.textSecondary }]}>
              {fmtDate(item.departDate, item.departTime)}
              {item.arriveDate ? `  →  ${fmtDate(item.arriveDate, item.arriveTime)}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => handleStatusChange(item)}>
            <Text style={[s.statusBadge, { color: sc, borderColor: sc }]}>{STATUS_LABELS[item.status]}</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {isExpanded && (
          <View style={s.cardBody}>
            {item.notes ? <Text style={[s.notes, { color: c.textSecondary }]}>{item.notes}</Text> : null}

            {item.imageData ? (
              <View style={{ marginTop: 8 }}>
                <Image source={{ uri: item.imageData }} style={s.flightImg} resizeMode="cover" />
                <TouchableOpacity style={s.imgDelete} onPress={() => removeImage(item.id)}>
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.imgButtons}>
                <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handlePickImage(item.id)}>
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handleCamera(item.id)}>
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>Камера</Text>
                </TouchableOpacity>
              </View>
            )}

            <AttachmentList entityType="flight" entityId={item.id} />

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Ред.</Text>
              </TouchableOpacity>
              {item.status !== 'completed' && item.status !== 'cancelled' && (
                <TouchableOpacity onPress={() => updateFlight(item.id, { status: 'completed' })}>
                  <Text style={{ color: '#22C55E', fontSize: 13, fontWeight: '600' }}>Завершить</Text>
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
      {showImport ? (
        <ImportFlightsForm travelerId={travelerId} c={c}
          onDone={(n) => { setShowImport(false); Alert.alert('Импорт', `Добавлено: ${n}`); }}
          onCancel={() => setShowImport(false)} />
      ) : showForm ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={[s.formLabel, { color: c.textSecondary }]}>Тип</Text>
          <View style={s.statusRow}>
            {KINDS.map((k) => (
              <TouchableOpacity key={k}
                style={[s.statusChip, { backgroundColor: kind === k ? c.primary : c.card, borderColor: c.border }]}
                onPress={() => setKind(k)}>
                <Text style={{ color: kind === k ? '#FFF' : c.text, fontSize: 13, fontWeight: '600' }}>
                  {KIND_EMOJI[k]} {KIND_LABEL[k]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.formLabel, { color: c.textSecondary }]}>{kind === 'flight' ? 'Рейс / маршрут' : 'Название отеля'}</Text>
          <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={title} onChangeText={setTitle}
            placeholder={kind === 'flight' ? 'SVO → IST' : 'Hilton Istanbul'}
            placeholderTextColor={c.textSecondary} />

          <Text style={[s.formLabel, { color: c.textSecondary }]}>Статус</Text>
          <View style={s.statusRow}>
            {STATUSES.map((st) => (
              <TouchableOpacity key={st}
                style={[s.statusChip, { backgroundColor: status === st ? STATUS_COLORS[st] : c.card, borderColor: STATUS_COLORS[st] }]}
                onPress={() => setStatus(st)}>
                <Text style={{ color: status === st ? '#FFF' : STATUS_COLORS[st], fontSize: 12, fontWeight: '600' }}>
                  {STATUS_LABELS[st]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <DatePickerField value={departDate} onChange={setDepartDate}
            label={kind === 'flight' ? 'Дата вылета *' : 'Дата заезда *'}
            textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} backgroundColor={c.card} />

          <Text style={[s.formLabel, { color: c.textSecondary }]}>{kind === 'flight' ? 'Время вылета' : 'Время заезда'}</Text>
          <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={departTime} onChangeText={setDepartTime} placeholder="14:30" placeholderTextColor={c.textSecondary} />

          <DatePickerField value={arriveDate} onChange={setArriveDate}
            label={kind === 'flight' ? 'Дата прилёта' : 'Дата выезда'}
            textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} backgroundColor={c.card} />

          <Text style={[s.formLabel, { color: c.textSecondary }]}>{kind === 'flight' ? 'Время прилёта' : 'Время выезда'}</Text>
          <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={arriveTime} onChangeText={setArriveTime} placeholder="18:45" placeholderTextColor={c.textSecondary} />

          <Text style={[s.formLabel, { color: c.textSecondary }]}>Заметки</Text>
          <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, height: 60 }]}
            value={notes} onChangeText={setNotes} placeholder="Бронь, терминал..." placeholderTextColor={c.textSecondary}
            multiline numberOfLines={3} />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[s.formBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.formBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={resetForm}>
              <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 12, marginBottom: 4 }}>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={() => setShowForm(true)}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>+ Перелёт</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={() => setShowImport(true)}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Импорт</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={sorted}
            keyExtractor={(f) => f.id}
            renderItem={renderFlight}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
            ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет перелётов</Text>}
          />
        </>
      )}
    </View>
  );
}

// ─── History sub-tab ───
function HistoryContent({ travelerId }: { travelerId: string }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const flights = useFlightStore((s) => s.flights);
  const updateFlight = useFlightStore((s) => s.updateFlight);
  const removeFlight = useFlightStore((s) => s.removeFlight);
  const removeImage = useFlightStore((s) => s.removeImage);
  const addImage = useFlightStore((s) => s.addImage);
  const [expanded, setExpanded] = useState<string | null>(null);

  const history = useMemo(() => {
    const isAll = travelerId === '__all__';
    const isMe = travelerId === ME_TRAVELER.id;
    return flights
      .filter((f) => f.status === 'completed' || f.status === 'cancelled')
      .filter((f) => isAll ? true : isMe ? !f.travelerId : f.travelerId === travelerId)
      .sort((a, b) => b.departDate.localeCompare(a.departDate));
  }, [flights, travelerId]);

  const handleDelete = (flight: Flight) => {
    Alert.alert('Удалить?', flight.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeFlight(flight.id) },
    ]);
  };

  const handleRestore = (flight: Flight) => {
    updateFlight(flight.id, { status: 'planned' });
  };

  const handlePickImage = async (id: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее в настройках'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(id, r.assets[0].uri);
  };

  const renderItem = ({ item }: { item: Flight }) => {
    const isExpanded = expanded === item.id;
    const sc = STATUS_COLORS[item.status];
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>{KIND_EMOJI[item.kind]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: c.text }]}>{item.title}</Text>
            <Text style={[s.cardDate, { color: c.textSecondary }]}>
              {fmtDate(item.departDate, item.departTime)}
              {item.arriveDate ? `  →  ${fmtDate(item.arriveDate, item.arriveTime)}` : ''}
            </Text>
          </View>
          <Text style={[s.statusBadge, { color: sc, borderColor: sc }]}>{STATUS_LABELS[item.status]}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={s.cardBody}>
            {item.notes ? <Text style={[s.notes, { color: c.textSecondary }]}>{item.notes}</Text> : null}

            {item.imageData ? (
              <View style={{ marginTop: 8 }}>
                <Image source={{ uri: item.imageData }} style={s.flightImg} resizeMode="cover" />
                <TouchableOpacity style={s.imgDelete} onPress={() => removeImage(item.id)}>
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border, marginTop: 8 }]} onPress={() => handlePickImage(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
              </TouchableOpacity>
            )}

            <AttachmentList entityType="flight" entityId={item.id} />

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
              <TouchableOpacity onPress={() => handleRestore(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Восстановить</Text>
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
    <FlatList
      data={history}
      keyExtractor={(f) => f.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20 }}
      ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет завершённых перелётов</Text>}
    />
  );
}

// ─── Calendar helpers ───
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthDays(year: number, month: number): { date: Date; isCurrentMonth: boolean }[] {
  const first = new Date(year, month, 1);
  // Monday-based week: 0=Mon..6=Sun
  let startDow = first.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  // Fill previous month days
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false });
  }
  // Current month
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDay; i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  // Fill to complete last week
  while (days.length % 7 !== 0) {
    const next = new Date(year, month + 1, days.length - startDow - lastDay + 1);
    days.push({ date: next, isCurrentMonth: false });
  }
  return days;
}

interface CalEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  color?: string;
}

// ─── Calendar sub-tab ───
function CalendarContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const today = useMemo(() => toDateStr(new Date()), []);

  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [calendarColors, setCalendarColors] = useState<Record<string, string>>({});

  const monthDays = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // Request calendar permission & load calendars
  useEffect(() => {
    (async () => {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const cm: Record<string, string> = {};
        for (const cal of cals) cm[cal.id] = cal.color || c.primary;
        setCalendarColors(cm);
      }
    })();
  }, []);

  // Load events for the visible month
  const loadEvents = useCallback(async () => {
    if (!hasPermission) return;
    const start = new Date(viewYear, viewMonth, 1);
    const end = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59);
    try {
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calIds = cals.map((c2) => c2.id);
      if (calIds.length === 0) return;
      const raw = await Calendar.getEventsAsync(calIds, start, end);
      setEvents(raw.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: new Date(e.startDate),
        endDate: new Date(e.endDate),
        allDay: e.allDay || false,
        color: calendarColors[e.calendarId] || c.primary,
      })));
    } catch {}
  }, [hasPermission, viewYear, viewMonth, calendarColors]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Events for selected date
  const dayEvents = useMemo(() => {
    return events.filter((e) => {
      const eStart = toDateStr(e.startDate);
      const eEnd = toDateStr(e.endDate);
      return selectedDate >= eStart && selectedDate <= eEnd;
    }).sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.startDate.getTime() - b.startDate.getTime();
    });
  }, [events, selectedDate]);

  // Dates that have events (for dots)
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(toDateStr(e.startDate));
    return set;
  }, [events]);

  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const requestPermission = async () => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    setHasPermission(status === 'granted');
    if (status === 'granted') {
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const cm: Record<string, string> = {};
      for (const cal of cals) cm[cal.id] = cal.color || c.primary;
      setCalendarColors(cm);
    }
  };

  if (hasPermission === false) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 12 }}>
          Нет доступа к календарю
        </Text>
        <TouchableOpacity style={{ backgroundColor: c.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
          onPress={requestPermission}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Разрешить доступ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Month header */}
      <View style={s.calHeader}>
        <TouchableOpacity onPress={goPrev} style={s.calArrow}>
          <Text style={{ color: c.primary, fontSize: 20, fontWeight: '700' }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setViewYear(new Date().getFullYear()); setViewMonth(new Date().getMonth()); setSelectedDate(today); }}>
          <Text style={[s.calMonthTitle, { color: c.text }]}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goNext} style={s.calArrow}>
          <Text style={{ color: c.primary, fontSize: 20, fontWeight: '700' }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday names */}
      <View style={s.calWeekRow}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={[s.calWeekday, { color: c.textSecondary }]}>{wd}</Text>
        ))}
      </View>

      {/* Days grid */}
      <View style={s.calGrid}>
        {monthDays.map(({ date, isCurrentMonth }, i) => {
          const ds = toDateStr(date);
          const isToday = ds === today;
          const isSelected = ds === selectedDate;
          const hasEvent = eventDates.has(ds);
          return (
            <TouchableOpacity
              key={i}
              style={[s.calDay, isSelected && { backgroundColor: c.primary, borderRadius: 20 },
                isToday && !isSelected && { borderWidth: 1, borderColor: c.primary, borderRadius: 20 }]}
              onPress={() => setSelectedDate(ds)}
            >
              <Text style={[s.calDayText,
                { color: isSelected ? '#FFF' : isCurrentMonth ? c.text : c.textSecondary },
                isToday && !isSelected && { color: c.primary, fontWeight: '800' }]}>
                {date.getDate()}
              </Text>
              {hasEvent && <View style={[s.calDot, { backgroundColor: isSelected ? '#FFF' : c.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day events */}
      <View style={[s.calEventsHeader, { borderColor: c.border }]}>
        <Text style={[s.calEventsTitle, { color: c.text }]}>
          {selectedDate === today ? 'Сегодня' : selectedDate}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{dayEvents.length} событий</Text>
      </View>

      <FlatList
        data={dayEvents}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View style={[s.eventRow, { borderColor: c.border }]}>
            <View style={[s.eventColorBar, { backgroundColor: item.color || c.primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.eventTitle, { color: c.text }]}>{item.title}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {item.allDay ? 'Весь день' : `${formatTime(item.startDate)} — ${formatTime(item.endDate)}`}
              </Text>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 20, fontSize: 13 }}>
            Нет событий
          </Text>
        }
      />
    </View>
  );
}

// ─── Traveler icon presets ───
const ICON_OPTIONS = ['🙂', '👧', '👩', '👦', '👨', '👶', '🧓', '🐱', '🐶', '❤️'];

// ─── Add Traveler Form ───
function AddTravelerForm({ onDone, onCancel, c }: { onDone: () => void; onCancel: () => void; c: any }) {
  const addTraveler = useTravelerStore((s) => s.addTraveler);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('👧');

  return (
    <View style={[s.travelerForm, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>Новый путешественник</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {ICON_OPTIONS.filter((i) => i !== '🙂').map((i) => (
          <TouchableOpacity key={i} onPress={() => setIcon(i)}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              backgroundColor: icon === i ? c.primary : c.background, borderWidth: 1, borderColor: icon === i ? c.primary : c.border }}>
            <Text style={{ fontSize: 18 }}>{i}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={[s.travelerInput, { color: c.text, borderColor: c.border }]}
        placeholder="Имя" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={{ backgroundColor: c.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
          onPress={async () => {
            if (!name.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
            await addTraveler(name.trim(), icon); onDone();
          }}>
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 13 }}>Добавить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8 }} onPress={onCancel}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Planner Tab with 2 modes ───
const PLANNER_MODES = [
  { key: 'calendar' as const, label: 'Календарь', icon: '📅' },
  { key: 'flights' as const, label: 'Перелёты', icon: '✈️' },
  { key: 'history' as const, label: 'История', icon: '📋' },
];

type PlannerMode = 'calendar' | 'flights' | 'history';

export function PlannerTab() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [mode, setMode] = useState<PlannerMode>('flights');
  const travelers = useTravelerStore((s) => s.travelers);
  const removeTraveler = useTravelerStore((s) => s.removeTraveler);
  const [selectedTravelerId, setSelectedTravelerId] = useState<string>(ME_TRAVELER.id);
  const [showAddTraveler, setShowAddTraveler] = useState(false);

  const ALL_TRAVELER: Traveler = useMemo(() => ({ id: '__all__', name: 'Все', icon: '👥', sortOrder: -2, createdAt: '' }), []);
  const allTravelers = useMemo(() => travelers.length > 0 ? [ALL_TRAVELER, ME_TRAVELER, ...travelers] : [ME_TRAVELER], [travelers]);

  const handleLongPressTraveler = (t: Traveler) => {
    if (t.id === ME_TRAVELER.id) return;
    Alert.alert(t.name, '', [
      { text: 'Удалить', style: 'destructive', onPress: () => {
        if (selectedTravelerId === t.id) setSelectedTravelerId(ME_TRAVELER.id);
        removeTraveler(t.id);
      }},
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      {/* Traveler selector row */}
      <View style={s.travelerRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}>
          {allTravelers.map((t) => (
            <TouchableOpacity key={t.id}
              style={[s.travelerChip, {
                backgroundColor: selectedTravelerId === t.id ? c.primary : c.card,
                borderColor: selectedTravelerId === t.id ? c.primary : c.border,
              }]}
              onPress={() => setSelectedTravelerId(t.id)}
              onLongPress={() => handleLongPressTraveler(t)}>
              <Text style={{ fontSize: 18 }}>{t.icon}</Text>
              <Text style={{ color: selectedTravelerId === t.id ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{t.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.travelerChip, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={() => setShowAddTraveler(true)}>
            <Text style={{ color: c.textSecondary, fontSize: 16, fontWeight: '700' }}>+</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {showAddTraveler && (
        <AddTravelerForm c={c} onDone={() => setShowAddTraveler(false)} onCancel={() => setShowAddTraveler(false)} />
      )}

      <View style={s.modeRow}>
        {PLANNER_MODES.map((m) => (
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
      {mode === 'flights' ? <FlightsContent travelerId={selectedTravelerId} />
        : mode === 'history' ? <HistoryContent travelerId={selectedTravelerId} />
        : <CalendarContent />}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  modeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeBtnText: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardDate: { fontSize: 12, marginTop: 2 },
  statusBadge: { fontSize: 11, fontWeight: '600', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  cardBody: { paddingHorizontal: 12, paddingBottom: 12 },
  notes: { fontSize: 13 },
  flightImg: { width: '100%', height: 200, borderRadius: 8 },
  imgDelete: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  imgButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  imgBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  formLabel: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  formBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  // Calendar
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  calArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  calMonthTitle: { fontSize: 16, fontWeight: '700' },
  calWeekRow: { flexDirection: 'row', paddingHorizontal: 4 },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', paddingBottom: 4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 },
  calDay: { width: '14.285%', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  calDayText: { fontSize: 14, fontWeight: '500' },
  calDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  calEventsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  calEventsTitle: { fontSize: 15, fontWeight: '700' },
  eventRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, gap: 10 },
  eventColorBar: { width: 3, height: 32, borderRadius: 2 },
  eventTitle: { fontSize: 14, fontWeight: '600' },
  // Traveler
  travelerRow: {},
  travelerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  travelerForm: { marginHorizontal: 12, marginBottom: 4, padding: 12, borderWidth: 1, borderRadius: 10 },
  travelerInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, marginBottom: 8 },
});
