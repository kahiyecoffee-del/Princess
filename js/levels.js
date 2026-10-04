// Seviye üretici. Seviyeler deterministiktir (aynı numara = aynı seviye)
// ve numara arttıkça zorlaşır: daha az hamle, daha çok renk, daha yüksek
// hedefler, daha çok buz ve tahtada boşluklar.
import { mulberry32 } from './board.js';

export const LEVEL_COUNT = 200;

// Tahtadaki boşluk desenleri (simetrik). Zor seviyelerde kullanılır.
const HOLE_PATTERNS = [
  [],
  [[0, 0], [0, 7], [7, 0], [7, 7]],
  [[3, 0], [4, 0], [3, 7], [4, 7]],
  [[0, 3], [0, 4], [7, 3], [7, 4]],
  [[0, 0], [0, 1], [1, 0], [0, 6], [0, 7], [1, 7], [6, 0], [7, 0], [7, 1], [6, 7], [7, 6], [7, 7]],
  [[3, 3], [3, 4], [4, 3], [4, 4]],
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function getLevel(n) {
  const rng = mulberry32(n * 7919 + 13);
  const colors = n <= 3 ? 4 : n <= 14 ? 5 : 6;

  let kind;
  if (n <= 2) kind = 'score';
  else if (n <= 5) kind = n % 2 ? 'collect' : 'score';
  else kind = ['ice', 'score', 'collect'][n % 3];

  // Her 10 seviyenin son ikisi "zor seviye" olarak işaretlenir.
  const hard = n >= 10 && (n % 10 === 9 || n % 10 === 0);

  let moves = Math.round(clamp(28 - n * 0.18, 16, 28));
  if (hard) moves -= 2;

  let holes = [];
  if (n >= 12) {
    const p = HOLE_PATTERNS[1 + Math.floor(rng() * (HOLE_PATTERNS.length - 1))];
    if (rng() < 0.6) holes = p;
  }
  const holeSet = new Set(holes.map(([r, c]) => r * 8 + c));

  // Zorluk çarpanı: ilk seviyelerde ~0.6, 50. seviyede ~1.2, sonra yavaşça ~1.5'e çıkar.
  let difficulty = 0.6 + 0.9 * (1 - Math.exp(-n / 45));
  if (hard) difficulty *= 1.1;
  // Rastgele oynayan bir oyuncunun hamle başına ortalama kazancı (simülasyonla ölçüldü).
  const SCORE_PER_MOVE = { 4: 800, 5: 290, 6: 150 };
  const COLLECT_PER_MOVE = { 4: 3.6, 5: 1.45, 6: 0.85 };
  const perMove = SCORE_PER_MOVE[colors];

  const level = {
    number: n,
    rows: 8,
    cols: 8,
    colors,
    moves,
    kind,
    hard,
    holes,
    ice: [],
    collect: [],
    targetScore: 0,
    starScores: [0, 0, 0],
  };

  if (kind === 'score') {
    level.targetScore = Math.round((moves * perMove * difficulty) / 50) * 50;
  } else if (kind === 'collect') {
    const picks = n >= 20 ? 3 : 2;
    const pool = [...Array(colors).keys()];
    for (let i = 0; i < picks; i++) {
      const color = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      const perColor = moves * COLLECT_PER_MOVE[colors] * difficulty * (picks === 3 ? 0.85 : 1);
      level.collect.push({ color, count: Math.max(6, Math.round(perColor)) });
    }
    level.targetScore = 0;
  } else {
    // Buz: kenarlardan içe doğru büyüyen bir alan
    // Buz seviyeleri belirli hücreleri hedeflemeyi gerektirir; daha cömert hamle verilir.
    level.moves = Math.round(clamp(31 - n * 0.05, 24, 31)) - (hard ? 2 : 0);
    const iceCount = clamp(Math.round(2 + 9 * difficulty), 8, 16);
    const layers2 = n >= 60 ? clamp(Math.floor((n - 60) / 20), 0, 6) : 0;
    const cells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!holeSet.has(r * 8 + c)) cells.push([r, c]);
    // Alt yarıyı tercih et (orası daha kolay); zorlaştıkça üst satırlar da gelir.
    cells.sort((a, b) => (b[0] + rng() * 3) - (a[0] + rng() * 3));
    const chosen = cells.slice(0, iceCount);
    level.ice = chosen.map(([r, c], i) => [r, c, i < layers2 ? 2 : 1]);
  }

  const base = level.targetScore || Math.round((moves * perMove * 0.6) / 50) * 50;
  level.starScores = [base, Math.round(base * 1.5 / 50) * 50, Math.round(base * 2.1 / 50) * 50];
  if (level.targetScore) level.starScores[0] = level.targetScore;
  return level;
}

export function describeGoal(level) {
  if (level.kind === 'score') return `Reach ${level.targetScore.toLocaleString('en-US')} points`;
  if (level.kind === 'collect') return 'Collect the jewels shown below';
  return 'Break all the crystal ice';
}
