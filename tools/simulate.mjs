// Zorluk eğrisini ölçmek için açgözlü (greedy) yapay oyuncu.
// Kullanım: node tools/simulate.mjs [denemeSayısı] [seviyeler: 1,5,10,...]
import { Board, SP } from '../www/js/board.js';
import { Engine } from '../www/js/engine.js';
import { getLevel } from '../www/js/levels.js';

function cloneBoard(b) {
  const nb = Object.create(Board.prototype);
  Object.assign(nb, b);
  nb.grid = b.grid.map((row) => row.map((t) => t && { ...t }));
  nb.block = b.block.map((row) => row.map((x) => x && { ...x }));
  nb.ice = b.ice.map((row) => row.slice());
  nb.rng = Math.random;
  return nb;
}

function evaluate(engine, move) {
  const b = cloneBoard(engine.board);
  const res = b.trySwap(move.a, move.b);
  if (!res.valid) return -1;
  const step = b.resolveStep([b.key(move.a.r, move.a.c), b.key(move.b.r, move.b.c)], res.forced);
  if (!step) return 0;
  let v = step.cleared.length + step.created.length * 4;
  const L = engine.level;
  if (L.kind === 'ice') v += step.iceBroken.length * 3;
  v += step.blockHits.length * (L.kind === 'cloud' ? 4 : 1) + step.unchained.length;
  if (L.kind === 'crown') {
    // Bir tacın altındaki taşları temizlemek onu aşağı indirir
    for (const { r, c } of step.cleared) {
      for (let rr = r - 1; rr >= 0; rr--) if (engine.board.grid[rr][c]?.special === SP.CROWN) { v += 3; break; }
    }
  }
  if (L.kind === 'collect') {
    for (const { tile } of step.cleared) {
      const g = L.collect.find((x) => x.color === tile.color);
      if (g && engine.collected[g.color] < g.count) v += 2;
    }
  }
  return v + Math.random() * 0.5;
}

function playLevel(n, continues = 0) {
  const engine = new Engine(getLevel(n), Math.floor(Math.random() * 1e9));
  let used = 0;
  for (;;) {
    while (!engine.finished) {
      const moves = engine.board.listMoves();
      let best = moves[0];
      let bestV = -Infinity;
      for (const m of moves) {
        const v = evaluate(engine, m);
        if (v > bestV) { bestV = v; best = m; }
      }
      const r = engine.play(best.a, best.b);
      if (!r.valid) throw new Error('bot geçersiz hamle yaptı');
    }
    if (engine.goalsMet()) return { win: true, stars: engine.stars() };
    if (used < continues) { used++; engine.addMoves(3); continue; }
    return { win: false };
  }
}

const trials = Number(process.argv[2] || 20);
const levels = process.argv[3]
  ? process.argv[3].split(',').map(Number)
  : [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 130, 160, 200];

console.log('Seviye  tür      renk hamle  kazanma%  (+1 devam)%');
for (const n of levels) {
  const L = getLevel(n);
  let w = 0; let w1 = 0;
  for (let i = 0; i < trials; i++) {
    if (playLevel(n).win) w++;
    if (playLevel(n, 1).win) w1++;
  }
  console.log(
    String(n).padStart(6), ' ', L.kind.padEnd(8), String(L.colors).padStart(4), String(L.moves).padStart(5),
    `${Math.round((w / trials) * 100)}%`.padStart(9), `${Math.round((w1 / trials) * 100)}%`.padStart(12),
    L.hard ? ' (zor)' : '',
  );
}
