import React, { useState } from 'react';
import { Alert, TouchableOpacity, Text } from 'react-native';
import { ollamaChatJson, VISION_MODEL } from '../services/ollamaClient';

interface Props {
  text: string;               // current field value
  onText: (text: string) => void; // replaces the field with the corrected text
  size?: number;
}

const PROMPT = `Ты корректор. Текст ниже надиктован голосом и распознан автоматически.
Исправь ошибки распознавания, орфографию и пунктуацию. Сохрани смысл и формулировки,
ничего не добавляй и не сокращай. Ответ — только JSON: {"text":"исправленный текст"}

Текст: `;

/** ✨ on-demand cleanup of dictated text via the configured Ollama model. */
export function PolishTextButton({ text, onText, size = 20 }: Props) {
  const [busy, setBusy] = useState(false);
  const trimmed = text.trim();

  const polish = async () => {
    if (busy || !trimmed) return;
    setBusy(true);
    try {
      const parsed = await ollamaChatJson({
        // Proofreading is trivial — the small/fast model responds in ~1s,
        // no need for the big default text model here.
        model: VISION_MODEL,
        user: PROMPT + trimmed,
        format: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        timeoutMs: 30_000,
      });
      const fixed = String(parsed?.text || '').trim();
      if (fixed) onText(fixed);
    } catch (e: any) {
      Alert.alert('Корректор', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={polish}
      disabled={busy || !trimmed}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel="Исправить текст"
      style={{ opacity: trimmed ? 1 : 0.35 }}
    >
      <Text style={{ fontSize: size }}>{busy ? '…' : '✨'}</Text>
    </TouchableOpacity>
  );
}
