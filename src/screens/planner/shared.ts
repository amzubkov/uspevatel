import { StyleSheet } from 'react-native';
import { Flight, FlightStatus, FlightKind } from '../../store/flightStore';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function fmtDate(date: string, time?: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const now = new Date();
  const showYear = y !== now.getFullYear();
  let s = `${d} ${MONTHS_SHORT[m - 1]}`;
  if (showYear) s += ` ${y}`;
  if (time) s += ` ${time}`;
  return s;
}

export function fmtFlightDate(f: Flight): string {
  let s = fmtDate(f.departDate);
  if (f.departTime) {
    s += ` ${f.departTime}`;
    if (f.arriveTime) {
      s += ` – ${f.arriveTime}`;
      // calc duration if both dates+times available
      if (f.arriveDate) {
        const d1 = new Date(`${f.departDate}T${f.departTime}`);
        const d2 = new Date(`${f.arriveDate}T${f.arriveTime}`);
        const diffMin = Math.round((d2.getTime() - d1.getTime()) / 60000);
        if (diffMin > 0) {
          const h = Math.floor(diffMin / 60);
          const m = diffMin % 60;
          s += ` (${h}ч${m > 0 ? ` ${m}м` : ''})`;
        }
      }
    }
  }
  return s;
}

export function fmtHotelDate(f: Flight): string {
  let s = fmtDate(f.departDate, f.departTime);
  if (f.arriveDate) {
    s += `  →  ${fmtDate(f.arriveDate, f.arriveTime)}`;
    // calc nights
    const d1 = new Date(f.departDate);
    const d2 = new Date(f.arriveDate);
    const nights = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    if (nights > 0) s += ` (${nights} ноч.)`;
  }
  return s;
}

export function fmtEventDate(f: Flight): string {
  let s = fmtDate(f.departDate);
  if (f.departTime) {
    s += ` ${f.departTime}`;
    if (f.arriveTime) {
      s += ` – ${f.arriveTime}`;
      // calc duration
      const dateStr = f.arriveDate || f.departDate;
      const d1 = new Date(`${f.departDate}T${f.departTime}`);
      const d2 = new Date(`${dateStr}T${f.arriveTime}`);
      const diffMin = Math.round((d2.getTime() - d1.getTime()) / 60000);
      if (diffMin > 0) {
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        s += ` (${h}ч${m > 0 ? ` ${m}м` : ''})`;
      }
    }
  }
  if (f.arriveDate && f.arriveDate !== f.departDate) {
    s += `  →  ${fmtDate(f.arriveDate)}`;
  }
  return s;
}

export const STATUS_LABELS: Record<FlightStatus, string> = {
  not_planned: 'нужно',
  planned: 'plan',
  reserved: 'reserved',
  booked: 'booked',
  completed: 'done',
  cancelled: 'cancel',
};
export const STATUS_COLORS: Record<FlightStatus, string> = {
  not_planned: '#DC2626',
  planned: '#3B82F6',
  reserved: '#F59E0B',
  booked: '#22C55E',
  completed: '#9CA3AF',
  cancelled: '#EF4444',
};
export const STATUSES: FlightStatus[] = ['not_planned', 'planned', 'reserved', 'booked', 'completed', 'cancelled'];
export const KIND_EMOJI: Record<FlightKind, string> = { flight: '✈️', hotel: '🏨', event: '📌' };
export const KIND_LABEL: Record<FlightKind, string> = { flight: 'Перелёт', hotel: 'Отель', event: 'Событие' };
export const KINDS: FlightKind[] = ['flight', 'hotel', 'event'];

export const s = StyleSheet.create({
  container: { flex: 1 },
  modeRow: { flexDirection: 'row', gap: 4, marginHorizontal: 12, marginTop: 6, marginBottom: 2 },
  modeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderRadius: 8 },
  card: { borderWidth: 1, borderRadius: 10, marginBottom: 6, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardDate: { fontSize: 11, marginTop: 1 },
  statusBadge: { fontSize: 11, fontWeight: '600', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  cardBody: { paddingHorizontal: 12, paddingBottom: 12 },
  notes: { fontSize: 13 },
  flightImg: { width: '100%', height: 200, borderRadius: 8 },
  imgDelete: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  imgButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  imgBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  formLabel: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
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
  filterChip: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  dateChipLabel: { fontSize: 11, fontWeight: '700' },
  dateChipDow: { fontSize: 9, fontWeight: '500' },
  travelerChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  travelerForm: { marginHorizontal: 12, marginBottom: 4, padding: 12, borderWidth: 1, borderRadius: 10 },
  travelerInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, marginBottom: 8 },
});
