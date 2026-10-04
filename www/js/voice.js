// The princess's voice and the background music, built to work on iPhone too.
//
// iOS rules this file works around:
//  * Audio may only start inside a tap, and older iOS only accepts "touchend"/"click",
//    not "pointerdown". So the unlock runs on every tap until audio is really running.
//  * Web Audio is muted by the silent switch unless an HTML <audio> element is playing.
//    The music element therefore always plays: the music track, or a silent loop when
//    the music is turned off. That keeps the princess's voice audible.
//  * Old Safari's decodeAudioData only supports callbacks, not promises.
//
// Voice lines: open-source Kokoro TTS (Apache 2.0, voice "af_heart").
// Music: composed by tools/compose_music.py.
import { audioContext } from './audio.js';

export const VOICE_LINES = [
  'great', 'amazing', 'fantastic', 'spectacular', 'magnificent', 'wonderful', 'brilliant', 'sweet',
  'congratulations', 'you-did-it', 'well-done', 'keep-going', 'dont-give-up', 'lets-shine',
  'ooh-nice', 'so-good', 'hehe', 'my-hero', 'smile', 'wow', 'welcome', 'tickles', 'hi', 'almost',
  'psst', 'giggle1', 'giggle2', 'giggle3', 'yay',
];

const SILENCE = 'audio/silence.mp3';
const music = new Audio();
music.loop = true;
music.preload = 'auto';
music.setAttribute('playsinline', '');
const fallbackVoice = new Audio(); // used only until the voice clips are decoded
fallbackVoice.preload = 'auto';
fallbackVoice.setAttribute('playsinline', '');

let voiceOn = true;
let musicOn = true;
let track = 'menu';
let musicHeld = false; // paused for an ad or while the app is in the background
let mediaUnlocked = false;
let greeted = false;

const buffers = new Map();
let loading = null;
let current = null;

// Lip-sync: report the voice's loudness (0..1) about 30 times a second.
let mouthListener = null;
let analyser = null;
let levelLoop = 0;
export function setMouthListener(fn) { mouthListener = fn; }
function trackLevel(ctx, until) {
  cancelAnimationFrame(levelLoop);
  const data = new Uint8Array(analyser.fftSize);
  const tick = () => {
    if (ctx.currentTime > until) { mouthListener?.(0); return; }
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    mouthListener?.(Math.min(1, Math.sqrt(sum / data.length) * 4.2));
    levelLoop = requestAnimationFrame(tick);
  };
  levelLoop = requestAnimationFrame(tick);
}
// For the <audio> fallback there is no level data, so the lips flap with the syllable rhythm.
function flapWhilePlaying(el) {
  cancelAnimationFrame(levelLoop);
  const t0 = performance.now();
  const tick = (t) => {
    if (el.paused || el.ended) { mouthListener?.(0); return; }
    const k = (t - t0) / 1000;
    mouthListener?.(Math.max(0, Math.sin(k * 21) * 0.5 + Math.sin(k * 7.3) * 0.35 + 0.15));
    levelLoop = requestAnimationFrame(tick);
  };
  levelLoop = requestAnimationFrame(tick);
}

function decode(ctx, data) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

export function preloadVoices() {
  const ctx = audioContext();
  if (!ctx || loading) return loading;
  loading = Promise.all(VOICE_LINES.map(async (key) => {
    try {
      const res = await fetch(`audio/${key}.mp3`);
      buffers.set(key, await decode(ctx, await res.arrayBuffer()));
    } catch { /* that line falls back to the <audio> element */ }
  }));
  return loading;
}

function musicSrc() {
  return musicOn ? `audio/music-${track}.mp3` : SILENCE;
}

function playMusic() {
  if (musicHeld || !mediaUnlocked) return;
  const src = musicSrc();
  if (!music.src.endsWith(src)) music.src = src;
  music.volume = 0.7; // ignored on iOS, where the file itself is mixed quietly
  music.play().catch(() => {});
}

export function setVoiceEnabled(v) {
  voiceOn = v;
  if (!v) { try { current?.stop(); } catch { /* already stopped */ } fallbackVoice.pause(); }
}
export function setMusicEnabled(v) { musicOn = v; playMusic(); }
export function setTrack(name) { if (track !== name) { track = name; playMusic(); } }
export function holdMusic(hold) { musicHeld = hold; if (hold) music.pause(); else playMusic(); }

export function say(key) {
  if (!voiceOn) return;
  const ctx = audioContext();
  const buf = buffers.get(key);
  if (ctx && ctx.state === 'running' && buf) {
    try { current?.stop(); } catch { /* already stopped */ }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.connect(ctx.destination); }
    src.connect(analyser);
    src.start(0);
    current = src;
    trackLevel(ctx, ctx.currentTime + buf.duration);
    return;
  }
  // Fallback while clips are still loading, or if Web Audio is unavailable
  fallbackVoice.pause();
  fallbackVoice.src = `audio/${key}.mp3`;
  fallbackVoice.play().then(() => flapWhilePlaying(fallbackVoice)).catch(() => {});
  preloadVoices();
}

// A short giggle, at most every 20 seconds so it stays charming.
let lastGiggle = 0;
export function giggle() {
  if (Date.now() - lastGiggle < 20000) return;
  lastGiggle = Date.now();
  say(['giggle1', 'giggle2', 'giggle3'][Math.floor(Math.random() * 3)]);
}

// The greeting is started inside the first tap itself, which old iOS requires.
let greetingKey = null;
export function setGreeting(fn) { greetingKey = fn; }

// Runs synchronously inside every tap until all audio is unlocked.
const EVENTS = ['touchend', 'click', 'pointerup', 'keydown'];
function unlock() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* iOS 17+ only */ }
  const ctx = audioContext();
  if (ctx && ctx.state !== 'running') {
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  }
  if (ctx) preloadVoices();
  if (!mediaUnlocked && music.paused) {
    // Both media elements must be started inside the tap itself
    music.src = musicHeld ? SILENCE : musicSrc();
    music.play().then(() => {
      mediaUnlocked = true;
      if (musicHeld) music.pause();
      else playMusic();
    }).catch(() => {});
    const greet = !greeted && voiceOn ? greetingKey?.() : null;
    greeted = true;
    if (fallbackVoice.paused) {
      fallbackVoice.src = greet ? `audio/${greet}.mp3` : SILENCE;
      fallbackVoice.play().catch(() => {});
    }
  }
  if (mediaUnlocked && ctx && ctx.state === 'running') EVENTS.forEach((e) => removeEventListener(e, unlock, true));
}
EVENTS.forEach((e) => addEventListener(e, unlock, true));

document.addEventListener('visibilitychange', () => holdMusic(document.hidden));
