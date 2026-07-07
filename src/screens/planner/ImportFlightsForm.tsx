import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useFlightStore, Flight, FlightStatus, FlightKind } from '../../store/flightStore';
import { ME_TRAVELER } from '../../store/travelerStore';
import { getDb } from '../../db/database';
import { s, KIND_EMOJI, KIND_LABEL, KINDS } from './shared';

// ─── Import flights form ───
export function ImportFlightsForm({ travelerId, onDone, onCancel, c }: { travelerId: string; onDone: (n: number) => void; onCancel: () => void; c: any }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<FlightKind>('flight');

  const parsed = useMemo(() => {
    // Split on newlines, semicolons, or boundary between end-of-date/time and start-of-title
    // This handles Android pasting where newlines become spaces
    const raw = text
      // insert split marker between "HH:MM" or "YYYY-MM-DD" followed by space+letter (new record)
      .replace(/(\d{2}:\d{2})\s+(?=[A-Za-z\u0400-\u04FF])/g, '$1\n')
      .replace(/(\d{4}-\d{2}-\d{2})\s+(?=[A-Za-z\u0400-\u04FF])/g, '$1\n');
    const lines = raw.split(/\r?\n|;/);
    return lines.map((line) => {
      const t = line.trim();
      if (!t) return null;

      const parseDT = (s: string): { date: string; time?: string } | null => {
        const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?$/);
        if (!m) return null;
        return { date: m[1], time: m[2] };
      };

      // Split by commas
      const parts = t.split(',').map((p) => p.trim());
      if (parts.length < 2) return { raw: t, error: true as const };

      // Find first date-like part to determine where title ends
      let dateStartIdx = -1;
      for (let i = 1; i < parts.length; i++) {
        if (parseDT(parts[i])) { dateStartIdx = i; break; }
      }
      if (dateStartIdx === -1) return { raw: t, error: true as const };

      // For hotels: "city, hotel name, date, date" or "hotel name, date, date"
      // For flights: "route, date [time], date [time]"
      let title: string;
      let city: string | undefined;
      if (kind === 'hotel' && dateStartIdx >= 2) {
        city = parts.slice(0, dateStartIdx - 1).join(', ').trim();
        title = parts[dateStartIdx - 1].trim();
      } else {
        title = parts.slice(0, dateStartIdx).join(', ').trim();
      }
      if (!title) return { raw: t, error: true as const };

      const depart = parseDT(parts[dateStartIdx]);
      if (!depart) return { raw: t, error: true as const };
      const arrive = parts[dateStartIdx + 1] ? parseDT(parts[dateStartIdx + 1]) : undefined;

      return { title, city, depart, arrive: arrive || undefined, error: false as const };
    }).filter(Boolean) as any[];
  }, [text, kind]);

  const valid = parsed.filter((p: any) => !p.error);
  const errors = parsed.filter((p: any) => p.error);

  const handleImport = async () => {
    if (!valid.length) { Alert.alert('Ошибка', 'Нет строк для импорта'); return; }
    try {
      const db = await getDb();
      const tids = (travelerId === ME_TRAVELER.id || travelerId === '__all__') ? [] : [travelerId];
      const flights: Flight[] = valid.map((item: any) => ({
        id: Crypto.randomUUID(),
        kind,
        title: item.title,
        city: item.city || undefined,
        status: 'planned' as FlightStatus,
        departDate: item.depart.date,
        departTime: item.depart.time,
        arriveDate: item.arrive?.date,
        arriveTime: item.arrive?.time,
        notes: '',
        currency: 'EUR',
        travelerIds: tids,
        createdAt: new Date().toISOString(),
      }));
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const f of flights) {
          await tx.runAsync(
            'INSERT INTO flights (id, kind, title, city, status, depart_date, depart_time, arrive_date, arrive_time, notes, image_data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [f.id, f.kind, f.title, f.city || null, f.status, f.departDate, f.departTime || null,
             f.arriveDate || null, f.arriveTime || null, f.notes, null, f.createdAt]
          );
          for (const tid of f.travelerIds) {
            await tx.runAsync('INSERT OR IGNORE INTO flight_travelers (flight_id, traveler_id) VALUES (?,?)', [f.id, tid]);
          }
        }
      });
      useFlightStore.setState((s) => ({ flights: [...flights, ...s.flights] }));
      onDone(flights.length);
    } catch (e: any) {
      Alert.alert('Ошибка импорта', String(e?.message || e));
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
      <Text style={[s.formLabel, { color: c.text, fontSize: 15, fontWeight: '700', textTransform: 'none' }]}>
        Импорт {kind === 'flight' ? 'перелётов' : kind === 'event' ? 'событий' : 'проживания'}
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

      <Text style={[s.formLabel, { color: c.textSecondary }]}>
        {kind === 'hotel' ? 'По строке: город, отель, заезд, выезд' : kind === 'event' ? 'По строке: место, название, дата [время]' : 'По строке: маршрут, дата [время][, прилёт]'}
        {'\n'}Разделитель строк: перенос или ;
      </Text>
      <TextInput
        style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border, height: 140, textAlignVertical: 'top' }]}
        placeholder={kind === 'hotel'
          ? 'Стамбул, Hilton, 2026-04-01, 2026-04-05\nТбилиси, Marriott, 2026-04-05, 2026-04-08'
          : kind === 'event'
          ? 'Стамбул, Экскурсия, 2026-04-02 10:00\nТбилиси, Концерт, 2026-04-06 19:00'
          : 'SVO → IST, 2026-04-01 14:30, 2026-04-01 18:45\nIST → TBS, 2026-04-05 10:00'}
        placeholderTextColor={c.textSecondary}
        value={text} onChangeText={setText} multiline
      />

      {parsed.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: c.primary, fontSize: 12 }}>
            Распознано: {valid.length}{errors.length > 0 ? `, ошибок: ${errors.length}` : ''}
          </Text>
          {errors.map((e: any, i: number) => (
            <Text key={i} style={{ color: '#EF4444', fontSize: 11 }}>? {e.raw}</Text>
          ))}
          {valid.map((v: any, i: number) => (
            <Text key={i} style={{ color: '#22C55E', fontSize: 11 }}>
              {v.city ? `${v.city} — ` : ''}{v.title}, {v.depart.date}{v.depart.time ? ` ${v.depart.time}` : ''}{v.arrive ? ` → ${v.arrive.date}` : ''}
            </Text>
          ))}
        </View>
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
