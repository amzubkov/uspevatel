import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { toAiBase64 } from '../../utils/aiImage';
import { useSettingsStore } from '../../store/settingsStore';
import { useHealthStore } from '../../store/healthStore';
import { colors } from '../../utils/theme';
import { requestHealthAdvice, HealthAdvice, parseLabPhoto, ParsedLab } from '../../services/aiHealthService';
import { s } from './shared';

const URGENCY_COLORS: Record<string, string> = { 'срочно': '#EF4444', 'скоро': '#F59E0B', 'планово': '#22C55E' };

export function AiAdvisorContent({ activePerson }: { activePerson: string | null }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const bulkImport = useHealthStore((st) => st.bulkImport);
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<HealthAdvice | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedLab | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      setAdvice(await requestHealthAdvice(activePerson));
    } catch (e: any) {
      Alert.alert('AI-советчик', String(e?.message || e));
    }
    setLoading(false);
  };

  const pickAndParse = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Нет доступа'); return; }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (!uri) return;
    setParsing(true);
    try {
      const base64 = await toAiBase64(uri, 1600, 0.7);
      if (!base64) throw new Error('Не удалось обработать фото');
      setParsed(await parseLabPhoto(base64));
    } catch (e: any) {
      Alert.alert('Распознавание', String(e?.message || e));
    }
    setParsing(false);
  };

  const importParsed = async () => {
    if (!parsed) return;
    const n = await bulkImport(
      parsed.results.map((r) => ({ name: r.name, value: r.value, unit: r.unit, refMin: r.refMin, refMax: r.refMax })),
      parsed.date,
      activePerson || 'me',
    );
    setParsed(null);
    Alert.alert('Импорт', `Добавлено ${n} результатов на ${parsed.date}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={[s.btn, { flex: 1, backgroundColor: '#8B5CF6', alignItems: 'center', opacity: parsing ? 0.6 : 1 }]}
          onPress={() => pickAndParse(true)}
          disabled={parsing}
        >
          <Text style={s.btnText}>{parsing ? 'Читаю…' : '📷 Снять бланк'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, { flex: 1, backgroundColor: '#8B5CF6', alignItems: 'center', opacity: parsing ? 0.6 : 1 }]}
          onPress={() => pickAndParse(false)}
          disabled={parsing}
        >
          <Text style={s.btnText}>🖼 Из галереи</Text>
        </TouchableOpacity>
      </View>
      {parsed && (
        <View style={[s.card, { backgroundColor: c.card, borderColor: '#8B5CF6' }]}>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>Распознано: {parsed.results.length} показателей, дата {parsed.date}</Text>
          {parsed.results.map((r, i) => (
            <Text key={i} style={{ color: c.textSecondary, fontSize: 12, marginTop: 3 }}>
              {r.name}: <Text style={{ color: c.text, fontWeight: '600' }}>{r.value}</Text> {r.unit || ''}{r.refMin != null || r.refMax != null ? `  (реф ${r.refMin ?? '—'}–${r.refMax ?? '—'})` : ''}
            </Text>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#22C55E', alignItems: 'center' }]} onPress={importParsed}>
              <Text style={s.btnText}>✓ Импортировать</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary }]} onPress={() => setParsed(null)}>
              <Text style={s.btnText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: '#0EA5E9', alignItems: 'center', opacity: loading ? 0.6 : 1 }]}
        onPress={run}
        disabled={loading}
      >
        <Text style={s.btnText}>{loading ? 'Анализирую…' : '🤖 Что сдать из анализов?'}</Text>
      </TouchableOpacity>
      {advice && (
        <>
          <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ color: c.text, fontSize: 13, lineHeight: 19 }}>{advice.summary}</Text>
          </View>
          {advice.items.map((item, i) => (
            <View key={i} style={[s.card, { backgroundColor: c.card, borderColor: URGENCY_COLORS[item.urgency] || c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: URGENCY_COLORS[item.urgency] || c.textSecondary, textTransform: 'uppercase' }}>
                  {item.urgency}
                </Text>
              </View>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{item.tests}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>{item.why}</Text>
            </View>
          ))}
          <Text style={{ color: c.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
            Это не медицинская консультация. Решения об обследовании принимайте с врачом.
          </Text>
        </>
      )}
      {!advice && !loading && (
        <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 24 }}>
          Модель посмотрит все анализы{'\n'}(значения, референсы, даты, динамику),{'\n'}возраст и пол — и предложит, что сдать.{'\n\n'}Возраст задаётся в Настройках → AI (год рождения).
        </Text>
      )}
    </ScrollView>
  );
}
