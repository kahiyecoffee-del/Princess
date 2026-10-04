// The princess's voice: short pre-recorded lines (www/audio/*.mp3).
// The lines were generated with the open-source Kokoro TTS model (Apache 2.0, voice "af_heart").
import { audioContext, isSoundEnabled } from './audio.js';

export const VOICE_LINES = [
  'great', 'amazing', 'fantastic', 'spectacular', 'magnificent', 'wonderful', 'brilliant', 'sweet',
  'congratulations', 'you-did-it', 'well-done', 'keep-going', 'dont-give-up', 'lets-shine', 'breathe',
];

const buffers = new Map();
let current = null;
let loading = null;

export function preloadVoices() {
  if (loading) return loading;
  const ctx = audioContext();
  if (!ctx) return Promise.resolve();
  loading = Promise.all(VOICE_LINES.map(async (key) => {
    try {
      const res = await fetch(`audio/${key}.mp3`);
      buffers.set(key, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch { /* a missing clip only means silence */ }
  }));
  return loading;
}

// Plays a line. A new line cuts off the previous one so they never overlap.
export async function say(key, volume = 0.9) {
  if (!isSoundEnabled()) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (!buffers.has(key)) await preloadVoices();
  const buf = buffers.get(key);
  if (!buf) return;
  try { current?.stop(); } catch { /* already stopped */ }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
  current = src;
}
