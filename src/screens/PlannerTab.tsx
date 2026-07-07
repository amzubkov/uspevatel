import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, Alert, ScrollView, Linking } from 'react-native';
import { ZoomableImage } from '../components/ZoomableImage';
import * as ImagePicker from 'expo-image-picker';
import { useFlightStore, Flight, FlightStatus } from '../store/flightStore';
import { useTravelerStore, Traveler, ME_TRAVELER } from '../store/travelerStore';
import { AttachmentList } from '../components/AttachmentList';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { parseTravelPhoto, ParsedTravelItem } from '../services/aiTravelService';
import { useNoteStore, Note } from '../store/noteStore';
import * as DocumentPicker from 'expo-document-picker';
import { useAttachmentStore } from '../store/attachmentStore';
import { s, fmtFlightDate, fmtHotelDate, fmtEventDate, STATUS_LABELS, STATUS_COLORS, KIND_EMOJI } from './planner/shared';
import { FlightForm } from './planner/FlightForm';
import { ImportFlightsForm } from './planner/ImportFlightsForm';
import { HistoryContent } from './planner/HistoryContent';
import { CalendarContent } from './planner/CalendarContent';

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
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const [showForm, setShowForm] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiItems, setAiItems] = useState<{ items: ParsedTravelItem[]; photoUri: string } | null>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  const openInMaps = (f: Flight) => {
    const q = encodeURIComponent(f.address || `${f.title}${f.city ? ', ' + f.city : ''}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  const handleAiScan = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (r.canceled || !r.assets[0]?.base64) return;
    setAiScanning(true);
    try {
      const items = await parseTravelPhoto(r.assets[0].base64);
      setAiItems({ items, photoUri: r.assets[0].uri });
    } catch (e: any) {
      Alert.alert('AI-скан', String(e?.message || e));
    }
    setAiScanning(false);
  };

  const importAiItems = async () => {
    if (!aiItems) return;
    const effectiveTravelerIds = (travelerId === ME_TRAVELER.id || travelerId === '__all__') ? [] : [travelerId];
    for (const it of aiItems.items) {
      await addFlight({
        kind: it.kind, title: it.title, city: it.city || undefined, address: it.address || undefined,
        flightNumber: it.flightNumber || undefined, status: 'booked',
        departDate: it.departDate, departTime: it.departTime || undefined,
        arriveDate: it.arriveDate || undefined, arriveTime: it.arriveTime || undefined,
        notes: it.notes || '', price: it.price, currency: it.currency || 'EUR',
        travelerIds: effectiveTravelerIds,
      });
    }
    // Attach the source photo to the first created item
    const created = useFlightStore.getState().flights
      .filter((f) => f.departDate === aiItems.items[0].departDate && f.title === aiItems.items[0].title)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (created) await addImage(created.id, aiItems.photoUri);
    const n = aiItems.items.length;
    setAiItems(null);
    Alert.alert('Импорт', `Добавлено: ${n}`);
  };
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Flight | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FlightStatus | null>(null);
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  const dateButtons = useMemo(() => {
    const DAY_NAMES_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const result: { date: string; label: string; dow: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      result.push({ date: dateStr, label: `${d.getDate()}.${m}`, dow: DAY_NAMES_SHORT[d.getDay()] });
    }
    return result;
  }, []);

  const sorted = useMemo(() => {
    const isAll = travelerId === '__all__';
    const isMe = travelerId === ME_TRAVELER.id;
    return flights
      .filter((f) => statusFilter ? f.status === statusFilter : f.status !== 'completed' && f.status !== 'cancelled')
      .filter((f) => isAll ? true : isMe ? f.travelerIds.length === 0 || f.travelerIds.includes(ME_TRAVELER.id) : f.travelerIds.includes(travelerId))
      .filter((f) => dateFilter ? f.departDate === dateFilter : true)
      .sort((a, b) => {
        const cmp = a.departDate.localeCompare(b.departDate);
        if (cmp !== 0) return cmp;
        return (a.departTime || '99:99').localeCompare(b.departTime || '99:99');
      });
  }, [flights, travelerId, statusFilter, dateFilter]);

  const closeForm = () => {
    setShowForm(false); setEditing(null);
  };

  const startEdit = (f: Flight) => {
    setEditing(f); setShowForm(true);
  };

  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);

  const handleStatusChange = (flight: Flight) => {
    setStatusMenuId(statusMenuId === flight.id ? null : flight.id);
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
    const itemTravelers = item.travelerIds.map((tid) => travelers.find((t) => t.id === tid)).filter(Boolean) as Traveler[];
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 14 }}>{KIND_EMOJI[item.kind]}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[s.cardTitle, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {item.title}{item.flightNumber ? ` ${item.flightNumber}` : ''}{itemTravelers.length > 0 ? ` (${itemTravelers.map((t) => t.icon).join('')})` : ''}
              </Text>
              <TouchableOpacity onPress={() => handleStatusChange(item)}>
                <Text style={[s.statusBadge, { color: sc, borderColor: sc }]}>{STATUS_LABELS[item.status]}</Text>
              </TouchableOpacity>
            </View>
            {item.city ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>{item.city}</Text> : null}
            <Text style={[s.cardDate, { color: c.textSecondary }]}>
              {item.kind === 'flight' ? fmtFlightDate(item) : item.kind === 'event' ? fmtEventDate(item) : fmtHotelDate(item)}
              {item.price ? `  ${item.price} ${item.currency === 'EUR' ? '€' : '₽'}` : ''}
            </Text>
          </View>
        </TouchableOpacity>

        {statusMenuId === item.id && (
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}>
            {(['reserved', 'booked'] as FlightStatus[]).map((st) => (
              <TouchableOpacity key={st}
                style={[s.statusChip, { backgroundColor: item.status === st ? STATUS_COLORS[st] : c.card, borderColor: STATUS_COLORS[st] }]}
                onPress={() => { updateFlight(item.id, { status: st }); setStatusMenuId(null); }}>
                <Text style={{ color: item.status === st ? '#FFF' : STATUS_COLORS[st], fontSize: 12, fontWeight: '600' }}>{STATUS_LABELS[st]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isExpanded && (
          <View style={s.cardBody}>
            {item.notes ? <Text style={[s.notes, { color: c.textSecondary }]}>{item.notes}</Text> : null}

            {(item.kind === 'hotel' && (item.address || item.city)) ? (
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }} onPress={() => openInMaps(item)}>
                <Text style={{ fontSize: 14 }}>📍</Text>
                <Text style={{ color: '#0EA5E9', fontSize: 13, textDecorationLine: 'underline', flex: 1 }} numberOfLines={2}>
                  {item.address || item.city} · открыть в картах
                </Text>
              </TouchableOpacity>
            ) : null}
            {item.imageData ? (
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomUri(item.imageData!)}>
                  <Image source={{ uri: item.imageData }} style={s.flightImg} resizeMode="cover" />
                </TouchableOpacity>
                <TouchableOpacity style={s.imgDelete} onPress={() => removeImage(item.id)}>
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <AttachmentList entityType="flight" entityId={item.id} hideAddButton />
            <View style={s.imgButtons}>
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => handlePickImage(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => handleCamera(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Камера</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border, flex: 1 }]} onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
                if (result.canceled || !result.assets?.[0]) return;
                const a = result.assets[0];
                await addAttachment('flight', item.id, a.uri, a.name, a.mimeType, a.size);
              }}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Файл</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Редактировать</Text>
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
          onDone={(n) => { setShowImport(false); setTimeout(() => Alert.alert('Импорт', `Добавлено: ${n}`), 100); }}
          onCancel={() => setShowImport(false)} />
      ) : showForm ? (
        <FlightForm editing={editing} travelerId={travelerId} onDone={closeForm} onCancel={closeForm} />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 6, marginBottom: 2 }}>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary, flex: 1, paddingVertical: 6 }]} onPress={() => setShowForm(true)}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>+ Добавить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, paddingVertical: 6 }]} onPress={() => setShowImport(true)}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 12 }}>Импорт</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: '#0EA5E9', paddingVertical: 6 }]} onPress={handleAiScan} disabled={aiScanning}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>{aiScanning ? '…' : '🤖 Скан'}</Text>
            </TouchableOpacity>
          </View>
          {aiItems && (
            <View style={{ marginHorizontal: 12, marginTop: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#0EA5E9', backgroundColor: c.card }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>Распознано: {aiItems.items.length}</Text>
              {aiItems.items.map((it, i) => (
                <Text key={i} style={{ color: c.textSecondary, fontSize: 12, marginTop: 3 }}>
                  {it.kind === 'flight' ? '✈️' : '🏨'} {it.title} · {it.departDate}{it.departTime ? ` ${it.departTime}` : ''}
                  {it.flightNumber ? ` · ${it.flightNumber}` : ''}{it.price ? ` · ${it.price} ${it.currency || ''}` : ''}
                </Text>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={[s.addBtn, { backgroundColor: '#22C55E', flex: 1, paddingVertical: 6 }]} onPress={importAiItems}>
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>✓ Импортировать</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.addBtn, { backgroundColor: c.border, paddingVertical: 6 }]} onPress={() => setAiItems(null)}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 12 }}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <ZoomableImage uri={zoomUri} onClose={() => setZoomUri(null)} />
          <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: 12, marginVertical: 2, height: 24 }}>
            <TouchableOpacity
              style={[s.filterChip, { backgroundColor: !statusFilter ? c.primary : c.card, borderColor: !statusFilter ? c.primary : c.border }]}
              onPress={() => setStatusFilter(null)}>
              <Text numberOfLines={1} style={{ color: !statusFilter ? '#FFF' : c.text, fontSize: 10, fontWeight: '600' }}>Все</Text>
            </TouchableOpacity>
            {(['not_planned', 'reserved', 'planned', 'booked'] as FlightStatus[]).map((st) => (
              <TouchableOpacity key={st}
                style={[s.filterChip, { backgroundColor: statusFilter === st ? STATUS_COLORS[st] : c.card, borderColor: statusFilter === st ? STATUS_COLORS[st] : c.border }]}
                onPress={() => setStatusFilter(statusFilter === st ? null : st)}>
                <Text numberOfLines={1} style={{ color: statusFilter === st ? '#FFF' : STATUS_COLORS[st], fontSize: 10, fontWeight: '600' }}>{STATUS_LABELS[st]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: 12, marginVertical: 2 }}>
            <TouchableOpacity
              style={[s.filterChip, { backgroundColor: !dateFilter ? c.primary : c.card, borderColor: !dateFilter ? c.primary : c.border }]}
              onPress={() => setDateFilter(null)}>
              <Text style={[s.dateChipLabel, { color: !dateFilter ? '#FFF' : c.text }]}>Все</Text>
            </TouchableOpacity>
            {dateButtons.map((db) => {
              const active = dateFilter === db.date;
              return (
                <TouchableOpacity key={db.date}
                  style={[s.filterChip, { backgroundColor: active ? c.primary : c.card, borderColor: active ? c.primary : c.border }]}
                  onPress={() => setDateFilter(active ? null : db.date)}>
                  <Text style={[s.dateChipLabel, { color: active ? '#FFF' : c.text }]}>{db.label}</Text>
                  <Text style={[s.dateChipDow, { color: active ? 'rgba(255,255,255,0.7)' : c.textSecondary }]}>{db.dow}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <FlatList
            style={{ flex: 1 }}
            data={sorted}
            keyExtractor={(f) => f.id}
            renderItem={renderFlight}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
            ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет записей</Text>}
          />
        </View>
      )}
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

// ─── Notes sub-tab ───
function NotesContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const notes = useNoteStore((s) => s.notes);
  const allTags = useNoteStore((s) => s.allTags);
  const addNote = useNoteStore((s) => s.addNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const removeNote = useNoteStore((s) => s.removeNote);
  const addImage = useNoteStore((s) => s.addImage);
  const removeImage = useNoteStore((s) => s.removeImage);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!filterTag) return notes;
    return notes.filter((n) => n.tags.includes(filterTag));
  }, [notes, filterTag]);

  const resetForm = () => {
    setText(''); setTagInput(''); setTags([]); setShowForm(false); setEditingId(null);
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id); setText(n.text); setTags([...n.tags]); setTagInput(''); setShowForm(true);
  };

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!text.trim()) { Alert.alert('Введите текст'); return; }
    if (editingId) {
      await updateNote(editingId, text.trim(), tags);
    } else {
      await addNote(text.trim(), tags);
    }
    resetForm();
  };

  const handlePickImage = async (noteId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа к галерее'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(noteId, r.assets[0].uri);
  };

  const handleCamera = async (noteId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа к камере'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(noteId, r.assets[0].uri);
  };

  const handleDelete = (n: Note) => {
    Alert.alert('Удалить заметку?', n.text.substring(0, 50), [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeNote(n.id) },
    ]);
  };

  if (showForm) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        <Text style={[s.formLabel, { color: c.text, fontSize: 15, fontWeight: '700', textTransform: 'none' }]}>
          {editingId ? 'Редактировать' : 'Новая заметка'}
        </Text>
        <TextInput
          style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, height: 100, textAlignVertical: 'top', marginTop: 8 }]}
          placeholder="Текст заметки..."
          placeholderTextColor={c.textSecondary}
          value={text} onChangeText={setText} multiline
        />
        <Text style={[s.formLabel, { color: c.textSecondary }]}>Теги</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {tags.map((t) => (
            <TouchableOpacity key={t} onPress={() => setTags(tags.filter((x) => x !== t))}
              style={{ backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>{t} ×</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, flex: 1 }]}
            placeholder="Добавить тег..."
            placeholderTextColor={c.textSecondary}
            value={tagInput} onChangeText={setTagInput}
            onSubmitEditing={handleAddTag}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={handleAddTag}
            style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>+</Text>
          </TouchableOpacity>
        </View>
        {/* Suggest existing tags */}
        {allTags.filter((t) => !tags.includes(t)).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {allTags.filter((t) => !tags.includes(t)).map((t) => (
              <TouchableOpacity key={t} onPress={() => setTags([...tags, t])}
                style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <TouchableOpacity style={[s.formBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.formBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={resetForm}>
            <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Tag filter */}
      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, maxHeight: 30 }}
          contentContainerStyle={{ gap: 4, paddingHorizontal: 12, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setFilterTag(null)}
            style={[s.statusChip, { backgroundColor: !filterTag ? c.primary : c.card, borderColor: c.border }]}>
            <Text style={{ color: !filterTag ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>Все</Text>
          </TouchableOpacity>
          {allTags.map((t) => (
            <TouchableOpacity key={t} onPress={() => setFilterTag(filterTag === t ? null : t)}
              style={[s.statusChip, { backgroundColor: filterTag === t ? c.primary : c.card, borderColor: c.border }]}>
              <Text style={{ color: filterTag === t ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет заметок</Text>}
        renderItem={({ item: n }) => {
          const isExpanded = expanded === n.id;
          return (
            <View style={[s.card, { borderColor: c.border, backgroundColor: c.card }]}>
              <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : n.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={isExpanded ? undefined : 2}>{n.text}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {n.tags.map((t) => (
                      <Text key={t} style={{ color: c.primary, fontSize: 11, fontWeight: '600' }}>#{t}</Text>
                    ))}
                  </View>
                  <Text style={[s.cardDate, { color: c.textSecondary }]}>{n.createdAt.substring(0, 10)}</Text>
                </View>
              </TouchableOpacity>
              {isExpanded && (
                <View style={s.cardBody}>
                  {n.imagePath && (
                    <View style={{ marginBottom: 8 }}>
                      <Image source={{ uri: n.imagePath }} style={s.flightImg} resizeMode="contain" />
                      <TouchableOpacity style={s.imgDelete} onPress={() => removeImage(n.id)}>
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!n.imagePath && (
                    <View style={s.imgButtons}>
                      <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handlePickImage(n.id)}>
                        <Text style={{ color: c.text, fontSize: 13 }}>Галерея</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handleCamera(n.id)}>
                        <Text style={{ color: c.text, fontSize: 13 }}>Камера</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={[s.imgButtons, { marginTop: 8 }]}>
                    <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => startEdit(n)}>
                      <Text style={{ color: c.text, fontSize: 13 }}>Изменить</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.imgBtn, { borderColor: '#EF4444' }]} onPress={() => handleDelete(n)}>
                      <Text style={{ color: '#EF4444', fontSize: 13 }}>Удалить</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />
      <View style={{ padding: 12 }}>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary }]} onPress={() => setShowForm(true)}>
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>+ Заметка</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Planner Tab with 2 modes ───
const PLANNER_MODES = [
  { key: 'calendar' as const, label: 'Календарь', icon: '📅' },
  { key: 'flights' as const, label: 'Перелёты', icon: '✈️' },
  { key: 'notes' as const, label: 'Заметки', icon: '📝' },
  { key: 'history' as const, label: 'История', icon: '📋' },
];

type PlannerMode = 'calendar' | 'flights' | 'notes' | 'history';

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 12, paddingVertical: 4 }}>
          {allTravelers.map((t) => (
            <TouchableOpacity key={t.id}
              style={[s.travelerChip, {
                backgroundColor: selectedTravelerId === t.id ? c.primary : c.card,
                borderColor: selectedTravelerId === t.id ? c.primary : c.border,
              }]}
              onPress={() => setSelectedTravelerId(t.id)}
              onLongPress={() => handleLongPressTraveler(t)}>
              <Text style={{ fontSize: 14 }}>{t.icon}</Text>
              <Text style={{ color: selectedTravelerId === t.id ? '#FFF' : c.text, fontSize: 11, fontWeight: '600' }}>{t.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.travelerChip, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={() => setShowAddTraveler(true)}>
            <Text style={{ color: c.textSecondary, fontSize: 14, fontWeight: '700' }}>+</Text>
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
            <Text style={{ fontSize: 15 }}>{m.icon}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'flights' ? <FlightsContent travelerId={selectedTravelerId} />
        : mode === 'history' ? <HistoryContent travelerId={selectedTravelerId} />
        : mode === 'notes' ? <NotesContent />
        : <CalendarContent />}
    </View>
  );
}
