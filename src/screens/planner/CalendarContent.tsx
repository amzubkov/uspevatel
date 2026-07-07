import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import * as Calendar from 'expo-calendar';
import { toDateStr, WEEKDAYS_MON } from '../../utils/date';
import { useSettingsStore } from '../../store/settingsStore';
import { colors } from '../../utils/theme';
import { s } from './shared';

// ─── Calendar helpers ───
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

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
export function CalendarContent() {
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
        {WEEKDAYS_MON.map((wd) => (
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
