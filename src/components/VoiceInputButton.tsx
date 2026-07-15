import React, { useState } from 'react';
import { Alert, TouchableOpacity, Text, PermissionsAndroid, Platform } from 'react-native';
import { ensureModel, isModelReady, startDictation, stopDictation } from '../services/whisperService';

interface Props {
  onText: (text: string) => void; // final recognized phrase
  size?: number;
}

type Phase = 'idle' | 'downloading' | 'recording' | 'transcribing';

/**
 * One-tap offline dictation (whisper.cpp). Tap to start recording, tap again
 * to stop and transcribe. First use downloads the ru-capable model (~59 MB).
 */
export function VoiceInputButton({ onText, size = 22 }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  const ensureMicPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handlePress = async () => {
    if (phase === 'downloading' || phase === 'transcribing') return;

    if (phase === 'recording') {
      setPhase('transcribing');
      try {
        const text = await stopDictation();
        if (text) onText(text);
      } catch (e: any) {
        Alert.alert('Распознавание', String(e?.message || e));
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
      Alert.alert('Голосовой ввод', String(e?.message || e));
    }
  };

  const label =
    phase === 'recording' ? '🔴'
    : phase === 'transcribing' ? '…'
    : phase === 'downloading' ? `${progress}%`
    : '🎤';

  return (
    <TouchableOpacity onPress={handlePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Надиктовать">
      <Text style={{ fontSize: phase === 'downloading' ? 12 : size }}>{label}</Text>
    </TouchableOpacity>
  );
}
