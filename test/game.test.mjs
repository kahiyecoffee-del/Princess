import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, SP, mulberry32 } from '../www/js/board.js';
import { Engine } from '../www/js/engine.js';
import { getLevel, LEVEL_COUNT } from '../www/js/levels.js';
import { createLives, loseLife, refresh, msToNext, addLife, REGEN_MS, MAX_LIVES } from '../www/js/lives.js';

// Tahtayı elle kurmak için yardımcı: harfler renk, '.' boşluk
function boardFrom(rows) {
  const b = new Board({ rows: rows.length, cols: rows[0].length, colors: 6, rng: mulberry32(1) });
  rows.forEach((line, r) => [...line].forEach((ch, c) => {
    b.grid[r][c] = ch === '.' ? null : b.newTile(Number(ch));
  }));
  return b;
}

test('başlangıç tahtasında hazır eşleşme yok ve hamle var', () => {
  for (let seed = 1; seed < 50; seed++) {
    const b = new Board({ colors: 6, rng: mulberry32(seed) });
    assert.equal(b.findGroups().length, 0);
    assert.ok(b.hasPossibleMove());
  }
});

test('3lü eşleşme temizlenir', () => {
  const b = boardFrom(['0001', '1234', '2345', '3450']);
  const step = b.resolveStep();
  assert.equal(step.cleared.length, 3);
  assert.equal(step.created.length, 0);
});

test('4lü yatay eşleşme satır temizleyici oluşturur', () => {
  const b = boardFrom(['00001', '12341', '23452', '34503', '45014']);
  const step = b.resolveStep();
  assert.equal(step.created.length, 1);
  assert.equal(step.created[0].tile.special, SP.ROW);
});

test('5li eşleşme gökkuşağı, L şekli bomba oluşturur', () => {
  const b1 = boardFrom(['00000', '12341', '23452', '34503', '45014']);
  assert.equal(b1.resolveStep().created[0].tile.special, SP.RAINBOW);
  const b2 = boardFrom(['00012', '03452', '04523', '15234', '52345']);
  const step = b2.resolveStep();
  assert.equal(step.created[0].tile.special, SP.BOMB);
  assert.deepEqual([step.created[0].r, step.created[0].c], [0, 0]);
});

test('geçersiz takas geri alınır, geçerli takas kalır', () => {
  const b = boardFrom(['0120', '3453', '0124', '5235']);
  const before = b.grid.map((row) => row.map((t) => t.id));
  assert.equal(b.trySwap({ r: 0, c: 0 }, { r: 1, c: 0 }).valid, false);
  assert.deepEqual(b.grid.map((row) => row.map((t) => t.id)), before);
  // (2,2)'deki 5 ile (2,3)'teki 2 yer değişince 2. sütunda 2-2-2 oluşur
  const c = boardFrom(['0120', '3423', '0152', '5235']);
  assert.equal(c.trySwap({ r: 2, c: 2 }, { r: 2, c: 3 }).valid, true);
  assert.equal(c.grid[2][2].color, 2);
});

test('satır temizleyici patlayınca tüm satır gider', () => {
  const b = boardFrom(['0001', '1234', '2345', '3452']);
  b.grid[0][1].special = SP.ROW;
  b.grid[0][3] = b.newTile(5);
  const step = b.resolveStep();
  assert.equal(step.cleared.length, 4);
});

test('yerçekimi boşlukları doldurur, boşluk hücreleri (delik) atlanır', () => {
  const b = new Board({ rows: 4, cols: 1, colors: 3, holes: [[2, 0]], rng: mulberry32(2) });
  b.grid[3][0] = null;
  const { spawns } = b.applyGravity();
  assert.ok(spawns.length >= 1);
  assert.equal(b.grid[2][0], null);
  for (const r of [0, 1, 3]) assert.ok(b.grid[r][0]);
});

test('motor: hamle sayısı düşer, hedef tamamlanınca biter', () => {
  const e = new Engine(getLevel(1), 42);
  const m = e.board.listMoves(1)[0];
  const r = e.play(m.a, m.b);
  assert.ok(r.valid);
  assert.equal(e.movesLeft, getLevel(1).moves - 1);
  assert.ok(e.score > 0);
  e.addMoves(3);
  assert.equal(e.movesLeft, getLevel(1).moves + 2);
});

test('tüm seviyeler geçerli ve zorluk artıyor', () => {
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const L = getLevel(n);
    assert.ok(L.moves >= 12 && L.moves <= 35, `seviye ${n} hamle ${L.moves}`);
    assert.ok(L.starScores[0] < L.starScores[1] && L.starScores[1] < L.starScores[2]);
    if (L.kind === 'ice') assert.ok(L.ice.length > 0);
    if (L.kind === 'collect') assert.ok(L.collect.length >= 2);
    new Engine(L, n); // kurulum hatasız olmalı
  }
  assert.ok(getLevel(150).moves < getLevel(1).moves);
  assert.ok(getLevel(150).colors > getLevel(1).colors);
});

test('canlar: 5 can, kaybedince 30 dk sonra yenilenir', () => {
  const t0 = 1_000_000;
  const s = createLives(t0);
  assert.equal(s.lives, MAX_LIVES);
  loseLife(s, t0);
  loseLife(s, t0 + 1000);
  assert.equal(s.lives, 3);
  assert.equal(msToNext(s, t0), REGEN_MS);
  refresh(s, t0 + REGEN_MS + 5);
  assert.equal(s.lives, 4);
  refresh(s, t0 + 2 * REGEN_MS + 5);
  assert.equal(s.lives, 5);
  refresh(s, t0 + 10 * REGEN_MS);
  assert.equal(s.lives, 5);
});

test('canlar: hepsi bitince 0, reklamla 1 can eklenir, fazla dolmaz', () => {
  const t0 = 5_000_000;
  const s = createLives(t0);
  for (let i = 0; i < 6; i++) loseLife(s, t0);
  assert.equal(s.lives, 0);
  assert.equal(loseLife(s, t0), false);
  addLife(s, t0, 1);
  assert.equal(s.lives, 1);
  addLife(s, t0, 10);
  assert.equal(s.lives, MAX_LIVES);
});


