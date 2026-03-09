import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useSportStore, PullUpEntry } from '../store/sportStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

const QUICK_COUNTS = [1, 2, 3, 5, 10];

export function SportScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const pullUps = useSportStore((s) => s.pullUps);
  const addPullUps = useSportStore((s) => s.addPullUps);
  const removePullUp = useSportStore((s) => s.removePullUp);
  const [tab, setTab] = useState<'pullups'>('pullups');

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayEntries = useMemo(() => pullUps.filter((e) => e.date === today), [pullUps, today]);
  const todayTotal = useMemo(() => todayEntries.reduce((sum, e) => sum + e.count, 0), [todayEntries]);

  // Group by date for history
  const groupedByDate = useMemo(() => {
    const map = new Map<string, PullUpEntry[]>();
    for (const e of pullUps) {
      const arr = map.get(e.date) || [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [pullUps]);

  const handleRemove = (entry: PullUpEntry) => {
    Alert.alert('Удалить?', `${entry.count} подт. в ${entry.time}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removePullUp(entry.id) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'pullups' && { backgroundColor: c.primary }]}
          onPress={() => setTab('pullups')}
        >
          <Text style={[styles.tabText, { color: tab === 'pullups' ? '#FFF' : c.textSecondary }]}>🏋️ Подтягивания</Text>
        </TouchableOpacity>
      </View>

      {tab === 'pullups' && (
        <>
          {/* Today counter */}
          <View style={[styles.todayCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.todayLabel, { color: c.textSecondary }]}>Сегодня</Text>
            <Text style={[styles.todayCount, { color: c.primary }]}>{todayTotal}</Text>
            <Text style={[styles.todayUnit, { color: c.textSecondary }]}>подтягиваний</Text>
          </View>

          {/* Quick add buttons */}
          <View style={styles.quickRow}>
            {QUICK_COUNTS.map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.quickBtn, { backgroundColor: c.primary }]}
                onPress={() => addPullUps(n)}
              >
                <Text style={styles.quickBtnText}>+{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Today's entries */}
          {todayEntries.length > 0 && (
            <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Сегодня по подходам</Text>
          )}
          <FlatList
            data={todayEntries}
            keyExtractor={(e) => e.id}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onLongPress={() => handleRemove(item)}
                style={[styles.entryRow, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
              >
                <Text style={[styles.entryTime, { color: c.textSecondary }]}>{item.time}</Text>
                <Text style={[styles.entryCount, { color: c.text }]}>{item.count} подт.</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListFooterComponent={
              groupedByDate.length > 1 ? (
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>История</Text>
                  {groupedByDate.filter(([date]) => date !== today).map(([date, entries]) => {
                    const total = entries.reduce((s, e) => s + e.count, 0);
                    return (
                      <View key={date} style={[styles.historyRow, { borderColor: c.border }]}>
                        <Text style={[styles.historyDate, { color: c.text }]}>{date}</Text>
                        <Text style={[styles.historyTotal, { color: c.primary }]}>{total}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexDirection: 'row', marginHorizontal: 12, marginTop: 8, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  todayCard: { alignItems: 'center', marginHorizontal: 12, marginTop: 12, paddingVertical: 20, borderRadius: 12, borderWidth: 1 },
  todayLabel: { fontSize: 13, fontWeight: '600' },
  todayCount: { fontSize: 48, fontWeight: '800', marginVertical: 4 },
  todayUnit: { fontSize: 13 },
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16, marginBottom: 16 },
  quickBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingBottom: 4, textTransform: 'uppercase' },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 12 },
  entryTime: { fontSize: 14, fontWeight: '500', width: 50 },
  entryCount: { fontSize: 15, fontWeight: '600' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5 },
  historyDate: { fontSize: 14 },
  historyTotal: { fontSize: 15, fontWeight: '700' },
});
