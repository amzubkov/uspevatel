import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WeekStats } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

interface Props {
  stats: WeekStats[];
}

export function StatsChart({ stats }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const lastWeeks = stats.slice(-8);
  const maxVal = Math.max(...lastWeeks.map((s) => s.totalCompleted), 1);

  return (
    <View style={[styles.container, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.text }]}>Выполнено за неделю</Text>
      <View style={styles.chart}>
        {lastWeeks.map((week, idx) => {
          const totalH = (week.totalCompleted / maxVal) * 120;
          const projH = (week.projectCompleted / maxVal) * 120;
          const date = new Date(week.weekStart);
          const label = `${date.getDate()}/${date.getMonth() + 1}`;
          return (
            <View key={idx} style={styles.barGroup}>
              <View style={styles.barContainer}>
                <View style={[styles.bar, { height: totalH, backgroundColor: c.primary }]}>
                  <View style={[styles.barInner, { height: projH, backgroundColor: c.success }]} />
                </View>
              </View>
              <Text style={[styles.barLabel, { color: c.textSecondary }]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: c.primary }]} />
          <Text style={[styles.legendText, { color: c.textSecondary }]}>Всего</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: c.success }]} />
          <Text style={[styles.legendText, { color: c.textSecondary }]}>По проектам</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, borderRadius: 12, borderWidth: 1, margin: 16 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  chart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 140 },
  barGroup: { alignItems: 'center' },
  barContainer: { height: 120, justifyContent: 'flex-end' },
  bar: { width: 24, borderRadius: 4, justifyContent: 'flex-end' },
  barInner: { width: 24, borderRadius: 4, position: 'absolute', bottom: 0 },
  barLabel: { fontSize: 10, marginTop: 4 },
  legend: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  legendText: { fontSize: 12 },
});
