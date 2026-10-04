// Kalıcı kayıt (localStorage). Android WebView'de uygulama verisi olarak saklanır.
import { createLives } from './lives.js';

const KEY = 'gokyuzu-prensesi-save-v1';

function defaults() {
  return {
    maxLevel: 1, // açılmış en yüksek seviye
    stars: {}, // seviye -> yıldız sayısı
    best: {}, // seviye -> en yüksek puan
    lives: createLives(Date.now()),
    levelsSinceAd: 0,
    sound: true,
    recovery: {
      quitDate: null, // kumarı bıraktığı tarih (YYYY-MM-DD)
      dailySpend: 0, // eskiden günlük ortalama harcama (₺)
      urgesBeaten: 0, // atlatılan dürtü sayısı
    },
    playSeconds: 0,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = defaults();
    const s = JSON.parse(raw);
    return { ...d, ...s, recovery: { ...d.recovery, ...(s.recovery || {}) }, lives: { ...d.lives, ...(s.lives || {}) } };
  } catch {
    return defaults();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* depolama dolu veya kapalı: oyun yine de çalışır */
  }
}
