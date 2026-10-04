// Sound effects are synthesized with WebAudio (no audio files needed).
let ctx = null;
let enabled = true;
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98];

export function setSoundEnabled(v) { enabled = v; }
export function isSoundEnabled() { return enabled; }

export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { dur = 0.15, type = 'sine', vol = 0.12, delay = 0, slide = 0 } = {}) {
  const a = audioContext();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(name, n = 1) {
  if (!enabled) return;
  switch (name) {
    case 'select': tone(880, { dur: 0.06, vol: 0.05 }); break;
    case 'invalid': tone(220, { dur: 0.15, type: 'triangle', vol: 0.08, slide: 0.7 }); break;
    case 'match': {
      const f = SCALE[Math.min(n - 1, SCALE.length - 1)];
      tone(f, { dur: 0.18, type: 'triangle', vol: 0.1 });
      tone(f * 2, { dur: 0.12, vol: 0.04, delay: 0.03 });
      break;
    }
    case 'combo': tone(SCALE[Math.min(n + 2, SCALE.length - 1)], { dur: 0.3, type: 'sine', vol: 0.08, delay: 0.05 }); break;
    case 'special': tone(1318, { dur: 0.25, vol: 0.06, slide: 1.5 }); break;
    case 'line': tone(1800, { dur: 0.3, type: 'sawtooth', vol: 0.03, slide: 0.3 }); break;
    case 'bomb': tone(160, { dur: 0.4, type: 'square', vol: 0.06, slide: 0.4 }); break;
    case 'rainbow': [0, 2, 4, 5, 7].forEach((i, k) => tone(SCALE[i % SCALE.length], { dur: 0.3, vol: 0.06, delay: k * 0.05 })); break;
    case 'ice': tone(2400, { dur: 0.08, type: 'triangle', vol: 0.04 }); break;
    case 'win': [0, 2, 4, 7, 8].forEach((i, k) => tone(SCALE[i], { dur: 0.35, type: 'triangle', vol: 0.09, delay: k * 0.12 })); break;
    case 'lose': [4, 2, 0].forEach((i, k) => tone(SCALE[i] / 2, { dur: 0.4, type: 'triangle', vol: 0.08, delay: k * 0.18 })); break;
    case 'star': tone(1567, { dur: 0.3, vol: 0.08 }); break;
    case 'breath': tone(392, { dur: 1.2, vol: 0.04 }); break;
    default: break;
  }
}
