import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { usePersonStore } from '../store/personStore';
import { colors } from '../utils/theme';
import { s } from './health/shared';
import { MetricsContent } from './health/MetricsContent';
import { DoctorsContent } from './health/DoctorsContent';
import { DoctorContactsContent } from './health/DoctorContactsContent';
import { ArchiveContent } from './health/ArchiveContent';
import { AiAdvisorContent } from './health/AiAdvisorContent';

const HEALTH_MODES = [
  { key: 'metrics' as const, label: 'Анализы', icon: '🔬' },
  { key: 'doctors' as const, label: 'Визиты', icon: '🩺' },
  { key: 'archive' as const, label: 'Архив', icon: '📁' },
  { key: 'contacts' as const, label: 'Контакты', icon: '👨‍⚕️' },
  { key: 'ai' as const, label: 'AI', icon: '🤖' },
];

type HealthMode = 'metrics' | 'doctors' | 'archive' | 'contacts' | 'ai';

export function HealthScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const persons = usePersonStore((s) => s.persons);
  const [mode, setMode] = useState<HealthMode>('metrics');
  const [activePerson, setActivePerson] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ minHeight: 36, maxHeight: 36, marginTop: 4 }}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 8, alignItems: 'center' }}>
        <TouchableOpacity
          style={[s.chip, { backgroundColor: !activePerson ? c.primary : c.border, paddingHorizontal: 10, paddingVertical: 5 }]}
          onPress={() => setActivePerson(null)}>
          <Text style={{ color: !activePerson ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Все</Text>
        </TouchableOpacity>
        {persons.map((p) => (
          <TouchableOpacity key={p.id}
            style={[s.chip, { backgroundColor: activePerson === p.id ? c.primary : c.border, paddingHorizontal: 10, paddingVertical: 5 }]}
            onPress={() => setActivePerson(p.id)}>
            <Text style={{ color: activePerson === p.id ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.modeRow}>
        {HEALTH_MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[s.modeBtn, { backgroundColor: mode === m.key ? c.primary : c.card, borderColor: c.border, borderWidth: 1 }]}
            onPress={() => setMode(m.key)}
          >
            <Text style={{ fontSize: 15 }}>{m.icon}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[s.modeBtnText, { color: mode === m.key ? '#FFF' : c.text }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'metrics' && <MetricsContent activePerson={activePerson} persons={persons} />}
      {mode === 'doctors' && <DoctorsContent activePerson={activePerson} persons={persons} />}
      {mode === 'archive' && <ArchiveContent activePerson={activePerson} persons={persons} />}
      {mode === 'contacts' && <DoctorContactsContent />}
      {mode === 'ai' && <AiAdvisorContent activePerson={activePerson} />}
    </View>
  );
}
