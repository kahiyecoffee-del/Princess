// The princess's voice and the background music.
//
// Both use HTML <audio> elements instead of Web Audio: on iPhone, Web Audio is muted
// by the silent switch, while media elements play like a video does. iOS also only
// lets a media element play after a tap, so both elements are "unlocked" on the first
// touch and reused afterwards.
//
// Voice lines were generated with the open-source Kokoro TTS model (Apache 2.0,
// voice "af_heart"); the music was composed by tools/compose_music.py.
import { audioContext } from './audio.js';

export const VOICE_LINES = [
  'great', 'amazing', 'fantastic', 'spectacular', 'magnificent', 'wonderful', 'brilliant', 'sweet',
  'congratulations', 'you-did-it', 'well-done', 'keep-going', 'dont-give-up', 'lets-shine',
  'ooh-nice', 'so-good', 'hehe', 'my-hero', 'smile', 'wow', 'welcome', 'tickles', 'hi', 'almost',
  'psst', 'giggle1', 'giggle2', 'giggle3', 'yay',
];

const voice = new Audio();
voice.preload = 'auto';
const music = new Audio();
music.loop = true;
music.preload = 'auto';

let voiceOn = true;
let musicOn = true;
let unlocked = false;
let track = 'menu';
let musicHeld = false; // paused for an ad or while the app is in the background

export function setVoiceEnabled(v) { voiceOn = v; if (!v) voice.pause(); }
export function setMusicEnabled(v) {
  musicOn = v;
  if (v) playMusic(); else music.pause();
}

function playMusic() {
  if (!musicOn || !unlocked || musicHeld) return;
  const src = `audio/music-${track}.mp3`;
  if (!music.src.endsWith(src)) music.src = src;
  music.volume = 0.7; // ignored on iOS, where the file itself is mixed quietly
  music.play().catch(() => {});
}

export function setTrack(name) {
  if (track === name) return;
  track = name;
  if (musicOn && unlocked && !musicHeld) {
    music.pause();
    music.src = `audio/music-${track}.mp3`;
    playMusic();
  }
}

// Pause music while an ad plays or the app is hidden, then resume.
export function holdMusic(hold) {
  musicHeld = hold;
  if (hold) music.pause(); else playMusic();
}

// A short giggle, at most every 20 seconds so it stays charming.
let lastGiggle = 0;
export function giggle() {
  if (Date.now() - lastGiggle < 20000 || !voice.paused) return;
  lastGiggle = Date.now();
  say(['giggle1', 'giggle2', 'giggle3'][Math.floor(Math.random() * 3)]);
}

export function say(key) {
  if (!voiceOn || !unlocked) return;
  voice.pause();
  voice.src = `audio/${key}.mp3`;
  voice.currentTime = 0;
  voice.play().catch(() => {});
}

// First tap anywhere: unlock audio on iOS/Android and start the music.
function unlock() {
  if (unlocked) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* iOS 17+ only */ }
  const ctx = audioContext();
  if (ctx) {
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  }
  voice.src = 'audio/silence.mp3';
  voice.play().then(() => {
    unlocked = true;
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) => removeEventListener(e, unlock, true));
    playMusic();
    onUnlock?.();
  }).catch(() => { /* try again on the next tap */ });
}
['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) => addEventListener(e, unlock, true));

let onUnlock = null;
export function whenUnlocked(fn) { if (unlocked) fn(); else onUnlock = fn; }

document.addEventListener('visibilitychange', () => holdMusic(document.hidden));
