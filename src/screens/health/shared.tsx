import React from 'react';
import { Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Person } from '../../store/personStore';

export { todayStr } from '../../utils/date';

export function daysDiff(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

/* ── Person Picker (reusable inline chip row) ── */
export function PersonPicker({ persons, value, onChange, c }: {
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

export const s = StyleSheet.create({
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
  modeRow: { flexDirection: 'row', gap: 5, marginHorizontal: 8, marginTop: 10, marginBottom: 4 },
  modeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 7, borderRadius: 10, height: 52 },
  modeBtnText: { fontSize: 10, fontWeight: '700' },
  // Doctor images
  docImg: { width: 200, height: 260, borderRadius: 8 },
  docImgDelete: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  docImgBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
});
