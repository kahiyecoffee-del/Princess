// Can sistemi: en fazla 5 can, her can 30 dakikada bir yenilenir.
// Saf mantık: zaman dışarıdan verilir, böylece test edilebilir.

export const MAX_LIVES = 5;
export const REGEN_MS = 30 * 60 * 1000;

export function createLives(now) {
  return { lives: MAX_LIVES, lastRegen: now };
}

// Geçen süreye göre kazanılan canları ekler.
export function refresh(state, now) {
  if (state.lives >= MAX_LIVES) {
    state.lives = MAX_LIVES;
    state.lastRegen = now;
    return state;
  }
  // Saat geri alındıysa sayacı sıfırla (hile/saat hatası koruması)
  if (now < state.lastRegen) state.lastRegen = now;
  const gained = Math.floor((now - state.lastRegen) / REGEN_MS);
  if (gained > 0) {
    state.lives = Math.min(MAX_LIVES, state.lives + gained);
    state.lastRegen = state.lives >= MAX_LIVES ? now : state.lastRegen + gained * REGEN_MS;
  }
  return state;
}

export function loseLife(state, now) {
  refresh(state, now);
  if (state.lives <= 0) return false;
  if (state.lives === MAX_LIVES) state.lastRegen = now;
  state.lives--;
  return true;
}

export function addLife(state, now, n = 1) {
  refresh(state, now);
  state.lives = Math.min(MAX_LIVES, state.lives + n);
  if (state.lives === MAX_LIVES) state.lastRegen = now;
  return state;
}

// Bir sonraki cana kalan süre (ms). Canlar doluysa 0.
export function msToNext(state, now) {
  refresh(state, now);
  if (state.lives >= MAX_LIVES) return 0;
  return Math.max(0, state.lastRegen + REGEN_MS - now);
}

export function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
