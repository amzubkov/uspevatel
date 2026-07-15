import React, { useState } from 'react';
import { Alert, TouchableOpacity, Text, PermissionsAndroid, Platform } from 'react-native';
import { ensureModel, isModelReady, startDictation, stopDictation } from '../services/whisperService';
import { runVoiceCommand } from '../services/voiceCommandService';

type Phase = 'idle' | 'downloading' | 'recording' | 'working';

/**
 * Global voice command: tap, say "съел гречку 200 грамм" / "добавь задачу…",
 * tap again — whisper transcribes offline, the LLM routes the intent, the
 * matching store action runs. Unrecognized commands become inbox tasks.
 */
export function VoiceCommandButton({ size = 17 }: { size?: number }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  const ensureMicPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handlePress = async () => {
    if (phase === 'downloading' || phase === 'working') return;

    if (phase === 'recording') {
      setPhase('working');
      try {
        const phrase = await stopDictation();
        if (phrase) {
          const summary = await runVoiceCommand(phrase);
          if (summary) Alert.alert('Готово', summary);
        }
      } catch (e: any) {
        Alert.alert('Команда', String(e?.message || e));
      } finally {
        setPhase('idle');
      }
      return;
    }

    if (!(await ensureMicPermission())) {
      Alert.alert('Нет доступа', 'Разрешите доступ к микрофону');
      return;
    }
    try {
      if (!(await isModelReady())) {
        setPhase('downloading');
        setProgress(0);
        await ensureModel(setProgress);
      }
      startDictation();
      setPhase('recording');
    } catch (e: any) {
      setPhase('idle');
      Alert.alert('Голосовая команда', String(e?.message || e));
    }
  };

  const label =
    phase === 'recording' ? '🔴'
    : phase === 'working' ? '…'
    : phase === 'downloading' ? `${progress}%`
    : '🎙';

  return (
    <TouchableOpacity onPress={handlePress} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} accessibilityLabel="Голосовая команда">
      <Text style={{ fontSize: phase === 'downloading' ? 10 : size }}>{label}</Text>
    </TouchableOpacity>
  );
}
