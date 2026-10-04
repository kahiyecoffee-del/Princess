// Bir seviyenin oyun durumu: puan, hamle, hedefler.
// Her hamle, animasyon katmanının oynatacağı "adımlar" listesi üretir.
import { Board, SP, mulberry32 } from './board.js';

export const SPECIAL_BONUS = { [SP.ROW]: 60, [SP.COL]: 60, [SP.BOMB]: 120, [SP.RAINBOW]: 200 };
export const POINTS_PER_TILE = 20;
export const LEFTOVER_MOVE_BONUS = 250;

export class Engine {
  constructor(level, seed = Date.now()) {
    this.level = level;
    this.board = new Board({
      rows: level.rows,
      cols: level.cols,
      colors: level.colors,
      holes: level.holes,
      ice: level.ice,
      rng: mulberry32(seed),
    });
    this.score = 0;
    this.movesLeft = level.moves;
    this.movesUsed = 0;
    this.collected = {};
    for (const g of level.collect) this.collected[g.color] = 0;
    this.iceLeft = this.countIce();
    this.finished = false;
  }

  countIce() {
    let n = 0;
    for (const row of this.board.ice) for (const v of row) n += v;
    return n;
  }

  goalsMet() {
    const L = this.level;
    if (L.kind === 'score') return this.score >= L.targetScore;
    if (L.kind === 'collect') return L.collect.every((g) => this.collected[g.color] >= g.count);
    return this.iceLeft === 0;
  }

  stars() {
    if (!this.goalsMet()) return 0;
    const [, s2, s3] = this.level.starScores;
    return this.score >= s3 ? 3 : this.score >= s2 ? 2 : 1;
  }

  // Hedefe ne kadar yaklaşıldığı (0..1) — ilerleme çubuğu için.
  progress() {
    const L = this.level;
    if (L.kind === 'score') return Math.min(1, this.score / L.targetScore);
    if (L.kind === 'collect') {
      const total = L.collect.reduce((s, g) => s + g.count, 0);
      const got = L.collect.reduce((s, g) => s + Math.min(g.count, this.collected[g.color]), 0);
      return got / total;
    }
    const start = L.ice.reduce((s, [, , l = 1]) => s + l, 0);
    return start ? 1 - this.iceLeft / start : 1;
  }

  addMoves(n) {
    this.movesLeft += n;
    this.finished = false;
  }

  // Oyuncu hamlesi. Geçersizse { valid:false } döner.
  play(a, b) {
    if (this.finished || this.movesLeft <= 0) return { valid: false };
    const res = this.board.trySwap(a, b);
    if (!res.valid) return { valid: false };

    this.movesLeft--;
    this.movesUsed++;
    const steps = [{ type: 'swap', a, b }];
    const preferred = [this.board.key(a.r, a.c), this.board.key(b.r, b.c)];
    const cascade = this.resolveAll(steps, preferred, res.forced);
    return { valid: true, steps, cascade };
  }

  // Zincirleme temizleme döngüsü: eşleşmeler bitene kadar temizle + düşür.
  resolveAll(steps, preferred = [], forced = null) {
    let cascade = 0;
    for (let guard = 0; guard < 60; guard++) {
      const step = this.board.resolveStep(cascade === 0 ? preferred : [], forced);
      forced = null;
      if (!step) break;
      cascade++;
      let points = step.cleared.length * POINTS_PER_TILE * cascade;
      for (const cr of step.created) points += SPECIAL_BONUS[cr.tile.special] || 0;
      for (const { tile } of step.cleared) {
        if (tile.special !== SP.RAINBOW && tile.color in this.collected) this.collected[tile.color]++;
      }
      this.iceLeft -= step.iceBroken.length;
      this.score += points;
      steps.push({ type: 'clear', ...step, points, cascade, score: this.score });
      steps.push({ type: 'fall', ...this.board.applyGravity() });
    }
    if (!this.board.hasPossibleMove()) {
      const positions = this.board.shuffle();
      steps.push(positions ? { type: 'shuffle', positions } : { type: 'rebuild' });
    }
    if (this.goalsMet() || this.movesLeft <= 0) this.finished = true;
    return cascade;
  }

  // Güçlendirici: Kraliyet Asası. Seçilen taşı hamle harcamadan kırar.
  useWand(r, c) {
    if (this.finished || !this.board.playable(r, c) || !this.board.grid[r][c]) return { valid: false };
    const forced = { cells: new Set([this.board.key(r, c)]), activations: [], skip: new Set() };
    const steps = [];
    const cascade = this.resolveAll(steps, [], forced);
    return { valid: true, steps, cascade };
  }

  // Güçlendirici: seviye başında tahtaya özel taşlar yerleştirir.
  // specials: SP değerleri listesi. Yerleştirilen hücreleri döndürür.
  placeSpecials(specials, rng = Math.random) {
    const b = this.board;
    const cells = [];
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const t = b.grid[r][c];
        if (t && t.special === SP.NONE) cells.push([r, c]);
      }
    }
    const placed = [];
    for (const sp of specials) {
      if (!cells.length) break;
      const [r, c] = cells.splice(Math.floor(rng() * cells.length), 1)[0];
      b.grid[r][c].special = sp;
      placed.push({ r, c, tile: b.grid[r][c] });
    }
    return placed;
  }

  // Seviye kazanıldığında kalan hamleler bonus puana dönüşür.
  finishBonus() {
    const bonus = this.movesLeft * LEFTOVER_MOVE_BONUS;
    this.score += bonus;
    return bonus;
  }
}
