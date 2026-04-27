import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert, Platform } from 'react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
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
  const startedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setText('');
    setError(null);

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) setText(e.value[0]);
    };
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) setText(e.value[0]);
    };
    Voice.onSpeechEnd = () => setListening(false);
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setListening(false);
      setError(e.error?.message || 'Ошибка распознавания');
    };

    if (mode === 'voice' && !startedRef.current) {
      startedRef.current = true;
      startListening();
    }

    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => {});
      startedRef.current = false;
    };
  }, [visible, mode]);

  const startListening = async () => {
    try {
      setError(null);
      setListening(true);
      // Offline preference passed via options (Android only)
      await Voice.start('ru-RU', Platform.OS === 'android' ? {
        EXTRA_PREFER_OFFLINE: true,
        RECOGNIZER_ENGINE: 'GOOGLE',
      } as any : undefined);
    } catch (e: any) {
      setListening(false);
      setError(String(e?.message || e));
    }
  };

  const stopListening = async () => {
    try { await Voice.stop(); } catch {}
    setListening(false);
  };

  const handleConfirm = async () => {
    const t = text.trim();
    if (!t) {
      onClose();
      return;
    }
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
      Alert.alert('Ошибка', String(e?.message || e));
      return;
    }
    setText('');
    onClose();
  };

  const handleCancel = async () => {
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
            <TouchableOpacity style={[styles.btn, styles.btnCancel, { borderColor: c.border }]} onPress={handleCancel}>
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
            <TouchableOpacity style={[styles.btn, styles.btnOk, { backgroundColor: c.primary }]} onPress={handleConfirm}>
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
