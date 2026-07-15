// Offline dictation: PCM mic capture -> WAV -> whisper.cpp (whisper.rn).
// Used because every system speech-recognition path is broken on ColorOS
// (no default service, error 5/10, RECOGNIZE_SPEECH not exported).
// The ggml model (~59 MB) is downloaded once into the app documents dir.

// whisper.rn's exports map lacks a "." entry — import via subpath.
import { initWhisper, WhisperContext } from 'whisper.rn/index';
import * as LegacyFS from 'expo-file-system/legacy';

// Package ships only an ambient declaration for a different module name.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LiveAudioStream: {
  init: (options: {
    sampleRate: number; channels: number; bitsPerSample: number;
    audioSource?: number; bufferSize?: number; wavFile: string;
  }) => void;
  start: () => void;
  stop: () => Promise<string>;
  on: (event: 'data', callback: (data: string) => void) => void;
} = require('@fugood/react-native-audio-pcm-stream').default;

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin';
const MODEL_DIR = `${LegacyFS.documentDirectory}whisper`;
const MODEL_PATH = `${MODEL_DIR}/ggml-base-q5_1.bin`;
const MODEL_MIN_BYTES = 50_000_000; // guard against truncated downloads

const SAMPLE_RATE = 16_000;

export async function isModelReady(): Promise<boolean> {
  const info = await LegacyFS.getInfoAsync(MODEL_PATH);
  return info.exists && (info.size ?? 0) >= MODEL_MIN_BYTES;
}

export async function ensureModel(onProgress?: (percent: number) => void): Promise<void> {
  if (await isModelReady()) return;
  await LegacyFS.makeDirectoryAsync(MODEL_DIR, { intermediates: true }).catch(() => {});
  const download = LegacyFS.createDownloadResumable(MODEL_URL, MODEL_PATH, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress?.(Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100));
    }
  });
  const result = await download.downloadAsync();
  if (!result || result.status !== 200 || !(await isModelReady())) {
    await LegacyFS.deleteAsync(MODEL_PATH, { idempotent: true }).catch(() => {});
    throw new Error('Не удалось скачать модель распознавания');
  }
}

let contextPromise: Promise<WhisperContext> | null = null;

function getContext(): Promise<WhisperContext> {
  if (!contextPromise) {
    contextPromise = initWhisper({ filePath: MODEL_PATH.replace('file://', '') }).catch((e: any) => {
      contextPromise = null;
      throw e;
    });
  }
  return contextPromise!;
}

// --- base64 helpers (Hermes has no atob/btoa) ---
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV: Record<string, number> = {};
for (let i = 0; i < B64.length; i += 1) B64_REV[B64[i]] = i;

function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  let i = 0;
  for (; i + 4 <= clean.length; i += 4) {
    const a = B64_REV[clean[i]];
    const b = B64_REV[clean[i + 1]];
    const c = B64_REV[clean[i + 2]];
    const d = B64_REV[clean[i + 3]];
    out[p++] = (a << 2) | (b >> 4);
    out[p++] = ((b & 15) << 4) | (c >> 2);
    out[p++] = ((c & 3) << 6) | d;
  }
  // trailing 2 or 3 chars (padding was stripped above)
  const rem = clean.length - i;
  if (rem >= 2) {
    const a = B64_REV[clean[i]];
    const b = B64_REV[clean[i + 1]];
    out[p++] = (a << 2) | (b >> 4);
    if (rem === 3) {
      const c = B64_REV[clean[i + 2]];
      out[p++] = ((b & 15) << 4) | (c >> 2);
    }
  }
  return out.subarray(0, p);
}

function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : NaN;
    const c = i + 2 < bytes.length ? bytes[i + 2] : NaN;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)];
    out += Number.isNaN(b) ? '=' : B64[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)];
    out += Number.isNaN(c) ? '=' : B64[c & 63];
  }
  return out;
}

function wavFromPcm(pcm: Uint8Array): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate (16-bit mono)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

// --- dictation session ---
let chunks: string[] = [];
let recording = false;
let listenerAttached = false;

export function startDictation(): void {
  if (recording) return;
  // The native module releases its AudioRecord after every stop(), so init()
  // must run before EACH start — otherwise start() is a silent no-op.
  LiveAudioStream.init({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // VOICE_RECOGNITION
    bufferSize: 4096,
    wavFile: '', // unused by the stream API
  });
  if (!listenerAttached) {
    LiveAudioStream.on('data', (data: string) => {
      if (recording) chunks.push(data);
    });
    listenerAttached = true;
  }
  chunks = [];
  recording = true;
  LiveAudioStream.start();
}

export async function stopDictation(): Promise<string> {
  if (!recording) return '';
  recording = false;
  await LiveAudioStream.stop();
  const parts = chunks.map(base64Decode);
  chunks = [];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  console.log(`[whisper] recorded ${total} bytes (${(total / 2 / SAMPLE_RATE).toFixed(1)}s, ${parts.length} chunks)`);
  if (total < SAMPLE_RATE / 2) return ''; // <0.25s of audio — nothing said
  const pcm = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    pcm.set(part, offset);
    offset += part.length;
  }
  const wavPath = `${LegacyFS.cacheDirectory}dictation.wav`;
  await LegacyFS.writeAsStringAsync(wavPath, base64Encode(wavFromPcm(pcm)), {
    encoding: LegacyFS.EncodingType.Base64,
  });
  const started = Date.now();
  const ctx = await getContext();
  const { promise } = ctx.transcribe(wavPath.replace('file://', ''), { language: 'ru' });
  const result = await promise;
  const text = (result?.result || '').trim();
  console.log(`[whisper] transcribed in ${Date.now() - started}ms: "${text}"`);
  return text;
}
