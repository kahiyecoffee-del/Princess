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

// Bell-like chime: a few partials plus a soft echo, for a magical, jewel-box feel.
function bell(freq, { vol = 0.08, dur = 0.6, delay = 0, echo = true } = {}) {
  tone(freq, { dur, vol, delay });
  tone(freq * 2.0, { dur: dur * 0.6, vol: vol * 0.35, delay });
  tone(freq * 3.01, { dur: dur * 0.35, vol: vol * 0.15, delay });
  if (echo) {
    tone(freq, { dur: dur * 0.8, vol: vol * 0.28, delay: delay + 0.14 });
    tone(freq * 2.0, { dur: dur * 0.5, vol: vol * 0.1, delay: delay + 0.28 });
  }
}

function sweep(from, to, { vol = 0.05, dur = 0.4, delay = 0 } = {}) {
  tone(from, { dur, vol, delay, slide: to / from });
}

export function play(name, n = 1) {
  if (!enabled) return;
  switch (name) {
    case 'select': bell(1568, { vol: 0.035, dur: 0.18, echo: false }); break;
    case 'invalid': tone(196, { dur: 0.16, type: 'triangle', vol: 0.07, slide: 0.8 }); break;
    case 'match': {
      const f = SCALE[Math.min(n - 1, SCALE.length - 1)];
      bell(f, { vol: 0.07, dur: 0.5 });
      break;
    }
    case 'combo': [0, 2, 4].forEach((k, i) => bell(SCALE[Math.min(n + k, SCALE.length - 1)], { vol: 0.045, dur: 0.5, delay: 0.06 * i, echo: false })); break;
    case 'special': sweep(880, 2640, { vol: 0.04, dur: 0.35 }); bell(1760, { vol: 0.05, dur: 0.6, delay: 0.25 }); break;
    case 'line': sweep(2400, 600, { vol: 0.035, dur: 0.35 }); break;
    case 'bomb': tone(110, { dur: 0.5, type: 'sine', vol: 0.16, slide: 0.45 }); tone(70, { dur: 0.6, type: 'triangle', vol: 0.08, slide: 0.6 }); break;
    case 'rainbow': [0, 2, 4, 5, 7, 8].forEach((i, k) => bell(SCALE[i % SCALE.length], { vol: 0.045, dur: 0.5, delay: k * 0.06, echo: false })); break;
    case 'ice': bell(2637, { vol: 0.03, dur: 0.2, echo: false }); break;
    case 'win': [0, 2, 4, 7, 8].forEach((i, k) => bell(SCALE[i], { vol: 0.07, dur: 0.8, delay: k * 0.13 })); break;
    case 'lose': [4, 2, 0].forEach((i, k) => tone(SCALE[i] / 2, { dur: 0.5, type: 'triangle', vol: 0.07, delay: k * 0.2 })); break;
    case 'star': bell(1568, { vol: 0.07, dur: 0.7 }); break;
    case 'heart': bell(2093, { vol: 0.03, dur: 0.3, echo: false }); break;
    case 'breath': tone(392, { dur: 1.2, vol: 0.04 }); break;
    default: break;
  }
}
