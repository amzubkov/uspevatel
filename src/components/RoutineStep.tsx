import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

interface Props {
  stepNumber: number;
  totalSteps: number;
  title: string;
  description: string;
  children: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
}

export function RoutineStep({ stepNumber, totalSteps, title, description, children, onNext, onBack, nextLabel = 'Далее' }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <Text style={[styles.step, { color: c.textSecondary }]}>Шаг {stepNumber} из {totalSteps}</Text>
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
        <Text style={[styles.description, { color: c.textSecondary }]}>{description}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progress, { width: `${(stepNumber / totalSteps) * 100}%`, backgroundColor: c.primary }]} />
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      <View style={styles.footer}>
        {onBack && (
          <TouchableOpacity style={[styles.btn, { borderColor: c.border, borderWidth: 1 }]} onPress={onBack}>
            <Text style={[styles.btnText, { color: c.text }]}>Назад</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, styles.btnPrimary, { backgroundColor: c.primary }]} onPress={onNext}>
          <Text style={[styles.btnText, { color: '#FFF' }]}>{nextLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingTop: 8 },
  step: { fontSize: 13, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 14, lineHeight: 20 },
  progressBar: { height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, marginTop: 12 },
  progress: { height: 4, borderRadius: 2 },
  content: { flex: 1 },
  footer: { flexDirection: 'row', padding: 16, gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnPrimary: {},
  btnText: { fontSize: 16, fontWeight: '600' },
});
