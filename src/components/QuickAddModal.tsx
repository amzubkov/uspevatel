import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useTaskStore } from '../store/taskStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

export type QuickAddMode = 'voice' | 'text';

interface Props {
  visible: boolean;
  mode: QuickAddMode;
  onClose: () => void;
}

export function QuickAddModal({ visible, mode, onClose }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const addTask = useTaskStore((s) => s.addTask);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const startedRef = useRef(false);
  const visibleRef = useRef(visible);
  const recognitionRequestRef = useRef(0);
  const savingRef = useRef(false);

  visibleRef.current = visible;

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (visible && transcript) setText(transcript);
  });
  useSpeechRecognitionEvent('end', () => {
    if (visible) setListening(false);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!visible || event.error === 'aborted') return;
    setListening(false);
    setError(event.message || event.error || 'Ошибка распознавания');
  });

  useEffect(() => {
    if (!visible) return;
    setText('');
    setError(null);
    savingRef.current = false;
    setSaving(false);

    if (mode === 'voice' && !startedRef.current) {
      startedRef.current = true;
      void startListening();
    }

    return () => {
      recognitionRequestRef.current += 1;
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
      startedRef.current = false;
      setListening(false);
    };
  }, [visible, mode]);

  const startListening = async () => {
    const request = ++recognitionRequestRef.current;
    try {
      setError(null);
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (request !== recognitionRequestRef.current || !visibleRef.current) return;
      if (!permission.granted) throw new Error('Нет разрешения на микрофон и распознавание речи');
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'ru-RU',
        interimResults: true,
        continuous: false,
        // Android may support on-device recognition while the ru-RU model is
        // not installed. Network-backed recognition is the safe default.
        requiresOnDeviceRecognition: false,
      });
    } catch (e: any) {
      if (request !== recognitionRequestRef.current || !visibleRef.current) return;
      setListening(false);
      setError(String(e?.message || e));
    }
  };

  const stopListening = async () => {
    recognitionRequestRef.current += 1;
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setListening(false);
  };

  const handleConfirm = async () => {
    if (savingRef.current) return;
    const t = text.trim();
    if (!t) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    await stopListening();
    try {
      await addTask({
        subject: '',
        action: t,
        category: 'IN',
        priority: 'normal',
        isRecurring: false,
        completed: false,
        notes: '',
      } as any);
    } catch (e: any) {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('Ошибка', String(e?.message || e));
      return;
    }
    setText('');
    onClose();
  };

  const handleCancel = async () => {
    if (savingRef.current) return;
    await stopListening();
    setText('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>
            {mode === 'voice' ? '🎤 Голос' : '✏️ Новая задача'}
          </Text>

          {mode === 'voice' && listening && (
            <Text style={[styles.hint, { color: c.primary }]}>● слушаю…</Text>
          )}

          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
            value={text}
            onChangeText={setText}
            placeholder={mode === 'voice' ? 'Распознанный текст…' : 'Что нужно сделать?'}
            placeholderTextColor={c.textSecondary}
            autoFocus={mode === 'text'}
            multiline
            numberOfLines={3}
          />

          {error && <Text style={[styles.error, { color: c.danger }]}>{error}</Text>}

          <View style={styles.buttons}>
            <TouchableOpacity disabled={saving} style={[styles.btn, styles.btnCancel, { borderColor: c.border, opacity: saving ? 0.5 : 1 }]} onPress={handleCancel}>
              <Text style={[styles.btnText, { color: c.danger }]}>✕</Text>
            </TouchableOpacity>
            {mode === 'voice' && (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: listening ? c.danger : c.card, borderColor: c.border, borderWidth: 1 }]}
                onPress={listening ? stopListening : startListening}>
                <Text style={[styles.btnText, { color: listening ? '#FFF' : c.text }]}>
                  {listening ? '⏹' : '🎤'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity disabled={saving} style={[styles.btn, styles.btnOk, { backgroundColor: c.primary, opacity: saving ? 0.5 : 1 }]} onPress={handleConfirm}>
              <Text style={[styles.btnText, { color: '#FFF' }]}>✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, minHeight: 80, textAlignVertical: 'top' },
  error: { fontSize: 12 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { borderWidth: 1 },
  btnOk: {},
  btnText: { fontSize: 20, fontWeight: '700' },
});
