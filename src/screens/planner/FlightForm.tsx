import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFlightStore, Flight, FlightStatus, FlightKind } from '../../store/flightStore';
import { useTravelerStore, ME_TRAVELER } from '../../store/travelerStore';
import { DatePickerField } from '../../components/DatePickerField';
import { TimePickerField } from '../../components/TimePickerField';
import { useSettingsStore } from '../../store/settingsStore';
import { colors } from '../../utils/theme';
import { s, STATUS_LABELS, STATUS_COLORS, STATUSES, KIND_EMOJI, KIND_LABEL, KINDS } from './shared';

// ─── Add/edit flight form ───
export function FlightForm({ editing, travelerId, onDone, onCancel }: {
  editing?: Flight | null; travelerId: string; onDone: () => void; onCancel: () => void;
}) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const addFlight = useFlightStore((s) => s.addFlight);
  const updateFlight = useFlightStore((s) => s.updateFlight);
  const allTravelers = useTravelerStore((s) => s.travelers);

  const editingId = editing?.id ?? null;

  // Form state
  const [kind, setKind] = useState<FlightKind>(editing ? editing.kind : 'flight');
  const [title, setTitle] = useState(editing ? editing.title : '');
  const [city, setCity] = useState(editing ? editing.city || '' : '');
  const [address, setAddress] = useState(editing ? editing.address || '' : '');
  const [flightNumber, setFlightNumber] = useState(editing ? editing.flightNumber || '' : '');
  const [status, setStatus] = useState<FlightStatus>(editing ? editing.status : 'planned');
  const [departDate, setDepartDate] = useState(editing ? editing.departDate : '');
  const [departTime, setDepartTime] = useState(editing ? editing.departTime || '' : '');
  const [arriveDate, setArriveDate] = useState(editing ? editing.arriveDate || '' : '');
  const [arriveTime, setArriveTime] = useState(editing ? editing.arriveTime || '' : '');
  const [notes, setNotes] = useState(editing ? editing.notes : '');
  const [price, setPrice] = useState(editing && editing.price ? String(editing.price) : '');
  const [currency, setCurrency] = useState(editing ? editing.currency || 'EUR' : 'EUR');
  const [formTravelerIds, setFormTravelerIds] = useState<string[]>(editing ? [...editing.travelerIds] : []);

  const handleSave = async () => {
    if (!title.trim() || !departDate.trim()) {
      Alert.alert('Ошибка', 'Введите название и дату');
      return;
    }
    const effectiveTravelerIds = editingId ? formTravelerIds : (travelerId === ME_TRAVELER.id || travelerId === '__all__') ? [] : [travelerId];
    const priceNum = parseFloat(price.replace(',', '.')) || undefined;
    if (editingId) {
      await updateFlight(editingId, {
        kind, title: title.trim(), city: city.trim() || undefined, address: address.trim() || undefined, flightNumber: flightNumber.trim() || undefined, status, departDate: departDate.trim(),
        departTime: departTime.trim() || undefined,
        arriveDate: arriveDate.trim() || undefined,
        arriveTime: arriveTime.trim() || undefined,
        notes: notes.trim(), price: priceNum, currency,
        travelerIds: formTravelerIds,
      });
    } else {
      await addFlight({
        kind, title: title.trim(), city: city.trim() || undefined, address: address.trim() || undefined, flightNumber: flightNumber.trim() || undefined, status, departDate: departDate.trim(),
        departTime: departTime.trim() || undefined,
        arriveDate: arriveDate.trim() || undefined,
        arriveTime: arriveTime.trim() || undefined,
        notes: notes.trim(), price: priceNum, currency,
        travelerIds: effectiveTravelerIds,
      });
    }
    onDone();
  };

  return (
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

      <Text style={[s.formLabel, { color: c.textSecondary }]}>{kind === 'flight' ? 'Рейс / маршрут' : kind === 'event' ? 'Название' : 'Название отеля'}</Text>
      <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
        value={title} onChangeText={setTitle}
        placeholder={kind === 'flight' ? 'SVO → IST' : kind === 'event' ? 'Экскурсия, концерт...' : 'Hilton Istanbul'}
        placeholderTextColor={c.textSecondary} />

      {kind === 'flight' && (
        <>
          <Text style={[s.formLabel, { color: c.textSecondary }]}>Номер рейса</Text>
          <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={flightNumber} onChangeText={setFlightNumber}
            placeholder="SU1234"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="characters" />
        </>
      )}

      {(kind === 'hotel' || kind === 'event') && (
        <>
          <Text style={[s.formLabel, { color: c.textSecondary }]}>{kind === 'event' ? 'Место' : 'Город'}</Text>
          <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            value={city} onChangeText={setCity}
            placeholder={kind === 'event' ? 'Город, адрес...' : 'Стамбул'}
            placeholderTextColor={c.textSecondary} />
          {kind === 'hotel' && (
            <>
              <Text style={[s.formLabel, { color: c.textSecondary }]}>Адрес (для карт)</Text>
              <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
                value={address} onChangeText={setAddress}
                placeholder="Улица, дом, город или lat,lng"
                placeholderTextColor={c.textSecondary} />
            </>
          )}
        </>
      )}

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

      {allTravelers.length > 0 && (
        <>
          <Text style={[s.formLabel, { color: c.textSecondary }]}>Для кого (можно несколько)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {[ME_TRAVELER, ...allTravelers].map((t) => {
              const sel = formTravelerIds.includes(t.id);
              return (
                <TouchableOpacity key={t.id}
                  style={[s.statusChip, { backgroundColor: sel ? c.primary : c.card, borderColor: c.border, marginRight: 6 }]}
                  onPress={() => setFormTravelerIds(sel ? formTravelerIds.filter((x) => x !== t.id) : [...formTravelerIds, t.id])}>
                  <Text style={{ color: sel ? '#FFF' : c.text, fontSize: 13 }}>{t.icon} {t.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}

      <DatePickerField value={departDate} onChange={setDepartDate}
        label={kind === 'flight' ? 'Дата вылета *' : kind === 'event' ? 'Дата *' : 'Дата заезда *'}
        textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} backgroundColor={c.card} />

      <TimePickerField value={departTime} onChange={setDepartTime}
        label={kind === 'flight' ? 'Время вылета' : kind === 'event' ? 'Время начала' : 'Время заезда'}
        textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} backgroundColor={c.card} />

      {kind !== 'event' && (
        <DatePickerField value={arriveDate} onChange={setArriveDate}
          label={kind === 'flight' ? 'Дата прилёта' : 'Дата выезда'}
          textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} backgroundColor={c.card} />
      )}

      <TimePickerField value={arriveTime} onChange={setArriveTime}
        label={kind === 'flight' ? 'Время прилёта' : kind === 'event' ? 'Время окончания' : 'Время выезда'}
        textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} backgroundColor={c.card} />

      <Text style={[s.formLabel, { color: c.textSecondary }]}>Заметки</Text>
      <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, height: 60 }]}
        value={notes} onChangeText={setNotes} placeholder="Бронь, терминал..." placeholderTextColor={c.textSecondary}
        multiline numberOfLines={3} />

      <Text style={[s.formLabel, { color: c.textSecondary }]}>Цена</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, flex: 1 }]}
          value={price} onChangeText={setPrice} placeholder="0" placeholderTextColor={c.textSecondary}
          keyboardType="decimal-pad" />
        {['EUR', 'RUB'].map((cur) => (
          <TouchableOpacity key={cur}
            style={[s.statusChip, { backgroundColor: currency === cur ? c.primary : c.card, borderColor: c.border }]}
            onPress={() => setCurrency(cur)}>
            <Text style={{ color: currency === cur ? '#FFF' : c.text, fontSize: 13, fontWeight: '600' }}>{cur === 'EUR' ? '€' : '₽'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <TouchableOpacity style={[s.formBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.formBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1 }]} onPress={onCancel}>
          <Text style={{ color: c.text, fontWeight: '600' }}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
