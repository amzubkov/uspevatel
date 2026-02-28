import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { StatsChart } from '../components/StatsChart';

function getWeekStart() {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - now.getDay() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function StatsScreen() {
  const weekStats = useTaskStore((s) => s.weekStats);
  const tasks = useTaskStore((s) => s.tasks);
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const weekStart = getWeekStart();
  const completedThisWeek = tasks.filter(
    (t) => t.completed && t.completedAt && new Date(t.completedAt) >= weekStart
  );
  const projectCompleted = completedThisWeek.filter((t) => t.project).length;
  const ratio = completedThisWeek.length > 0 ? projectCompleted / completedThisWeek.length : 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>Статистика</Text>

      <View style={styles.currentWeek}>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNumber, { color: c.primary }]}>{completedThisWeek.length}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>На этой неделе</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNumber, { color: c.success }]}>{projectCompleted}</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>По проектам</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.statNumber, { color: c.warning }]}>{Math.round(ratio * 100)}%</Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>Доля</Text>
        </View>
      </View>

      {weekStats.length > 0 && <StatsChart stats={weekStats} />}

      {weekStats.length > 0 && (
        <View style={styles.diarySection}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Дневник достижений</Text>
          {[...weekStats].reverse().map((week, idx) => (
            <View key={idx} style={[styles.diaryEntry, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.diaryDate, { color: c.textSecondary }]}>
                Неделя с {new Date(week.weekStart).toLocaleDateString('ru-RU')}
              </Text>
              <Text style={[styles.diaryStats, { color: c.textSecondary }]}>
                {week.totalCompleted} задач, {Math.round(week.ratio * 100)}% по проектам
              </Text>
              {week.diaryEntry ? (
                <Text style={[styles.diaryText, { color: c.text }]}>{week.diaryEntry}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {weekStats.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 48 }}>📊</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>
            Пройдите еженедельный регламент для сбора статистики
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', padding: 16, paddingBottom: 8 },
  currentWeek: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  statCard: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statNumber: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  diarySection: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  diaryEntry: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  diaryDate: { fontSize: 12, fontWeight: '600' },
  diaryStats: { fontSize: 12, marginTop: 2 },
  diaryText: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12, paddingHorizontal: 40 },
});
