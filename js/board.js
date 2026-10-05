// Saf oyun mantığı: tahta, eşleşme bulma, özel taşlar, yerçekimi.
// DOM'a bağımlı değildir; hem tarayıcıda hem Node testlerinde çalışır.

export const SP = { NONE: 0, ROW: 1, COL: 2, BOMB: 3, RAINBOW: 4, CROWN: 5 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextTileId = 1;

export class Board {
  constructor({ rows = 8, cols = 8, colors = 5, holes = [], ice = [], clouds = [], stones = [], chains = [], rng = Math.random }) {
    this.rows = rows;
    this.cols = cols;
    this.colors = colors;
    this.rng = rng;
    this.holes = new Set(holes.map(([r, c]) => r * cols + c));
    this.ice = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (const [r, c, layers = 1] of ice) {
      if (!this.isHole(r, c)) this.ice[r][c] = layers;
    }
    // Engeller: fırtına bulutu (1 vuruş, yayılır) ve ay taşı (2 vuruş). Taş tutmazlar.
    this.block = Array.from({ length: rows }, () => new Array(cols).fill(null));
    for (const [r, c] of clouds) if (!this.isHole(r, c)) this.block[r][c] = { type: 'cloud', hp: 1 };
    for (const [r, c] of stones) if (!this.isHole(r, c)) this.block[r][c] = { type: 'stone', hp: 2 };
    this.chainCells = chains.filter(([r, c]) => !this.isHole(r, c) && !this.block[r][c]);
    this.crownsPending = 0; // engine sets how many crowns may still drop in
    this.maxCrownsOnBoard = 2;
    this.grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
    this.fillInitial();
  }

  isBlock(r, c) { return this.inBounds(r, c) && !!this.block[r][c]; }
  // Taş tutabilen hücre (boşluk veya engel değil)
  holds(r, c) { return this.playable(r, c) && !this.block[r][c]; }
  // Yerinden oynamayan hücre: yerçekimi bunun üzerinden atlar
  fixed(r, c) { return !this.holds(r, c) || !!this.grid[r][c]?.chain; }
  countBlocks(type) {
    let n = 0;
    for (const row of this.block) for (const b of row) if (b && (!type || b.type === type)) n++;
    return n;
  }
  countCrowns() {
    let n = 0;
    for (const row of this.grid) for (const t of row) if (t && t.special === SP.CROWN) n++;
    return n;
  }

  key(r, c) { return r * this.cols + c; }
  rc(k) { return [Math.floor(k / this.cols), k % this.cols]; }
  isHole(r, c) { return this.holes.has(this.key(r, c)); }
  inBounds(r, c) { return r >= 0 && c >= 0 && r < this.rows && c < this.cols; }
  playable(r, c) { return this.inBounds(r, c) && !this.isHole(r, c); }

  newTile(color, special = SP.NONE) {
    return { id: nextTileId++, color, special };
  }

  randColor() { return Math.floor(this.rng() * this.colors); }

  // Gökkuşağı taşı hiçbir renkle eşleşmez.
  colorAt(r, c) {
    if (!this.inBounds(r, c)) return -1;
    const t = this.grid[r][c];
    if (!t || t.special === SP.RAINBOW || t.special === SP.CROWN) return -1;
    return t.color;
  }

  fillInitial() {
    for (let attempt = 0; attempt < 200; attempt++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (!this.holds(r, c)) { this.grid[r][c] = null; continue; }
          let color;
          let guard = 0;
          do {
            color = this.randColor();
            guard++;
          } while (guard < 50 && (
            (this.colorAt(r, c - 1) === color && this.colorAt(r, c - 2) === color) ||
            (this.colorAt(r - 1, c) === color && this.colorAt(r - 2, c) === color)
          ));
          this.grid[r][c] = this.newTile(color);
        }
      }
      for (const [r, c] of this.chainCells) if (this.grid[r][c]) this.grid[r][c].chain = true;
      if (this.findGroups().length === 0 && this.hasPossibleMove()) return;
    }
    // Çok sıkışık tahta: zincirsiz devam et
    for (const [r, c] of this.chainCells) if (this.grid[r][c]) this.grid[r][c].chain = false;
  }

  // Yatay/dikey 3+ dizileri bulur ve ortak hücresi olanları (L/T şekilleri) birleştirir.
  findGroups() {
    const runs = [];
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const color = this.colorAt(r, c);
        if (color < 0) { c++; continue; }
        let e = c + 1;
        while (e < this.cols && this.colorAt(r, e) === color) e++;
        if (e - c >= 3) {
          const cells = [];
          for (let i = c; i < e; i++) cells.push(this.key(r, i));
          runs.push({ dir: 'h', color, cells });
        }
        c = e;
      }
    }
    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const color = this.colorAt(r, c);
        if (color < 0) { r++; continue; }
        let e = r + 1;
        while (e < this.rows && this.colorAt(e, c) === color) e++;
        if (e - r >= 3) {
          const cells = [];
          for (let i = r; i < e; i++) cells.push(this.key(i, c));
          runs.push({ dir: 'v', color, cells });
        }
        r = e;
      }
    }

    // Union-find ile dizileri grupla
    const parent = runs.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map();
    runs.forEach((run, i) => {
      for (const k of run.cells) {
        if (owner.has(k)) parent[find(i)] = find(owner.get(k));
        else owner.set(k, i);
      }
    });
    const byRoot = new Map();
    runs.forEach((run, i) => {
      const root = find(i);
      if (!byRoot.has(root)) byRoot.set(root, { color: run.color, runs: [], cells: new Set() });
      const g = byRoot.get(root);
      g.runs.push(run);
      run.cells.forEach((k) => g.cells.add(k));
    });
    return [...byRoot.values()];
  }

  // Grup için oluşturulacak özel taşı ve yerini belirler.
  specialFor(group, preferred) {
    const longest = group.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const hasH = group.runs.some((r) => r.dir === 'h');
    const hasV = group.runs.some((r) => r.dir === 'v');
    let special = SP.NONE;
    if (longest.cells.length >= 5) special = SP.RAINBOW;
    else if (hasH && hasV) special = SP.BOMB;
    else if (longest.cells.length === 4) special = longest.dir === 'h' ? SP.ROW : SP.COL;
    if (special === SP.NONE) return null;

    let pivot = preferred.find((k) => group.cells.has(k));
    if (pivot === undefined && special === SP.BOMB) {
      // Yatay ve dikey dizilerin kesişimi
      const h = group.runs.filter((r) => r.dir === 'h').flatMap((r) => r.cells);
      const v = new Set(group.runs.filter((r) => r.dir === 'v').flatMap((r) => r.cells));
      pivot = h.find((k) => v.has(k));
    }
    if (pivot === undefined) pivot = longest.cells[Math.floor(longest.cells.length / 2)];
    return { key: pivot, color: group.color, special };
  }

  mostCommonColor() {
    const counts = new Array(this.colors).fill(0);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const col = this.colorAt(r, c);
        if (col >= 0) counts[col]++;
      }
    }
    let best = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
    return best;
  }

  // Temizlenecek kümedeki özel taşları zincirleme etkinleştirir.
  expandSpecials(toClear, activations, skip = new Set(), hits = new Set()) {
    const queue = [...toClear];
    const done = new Set(skip);
    while (queue.length) {
      const k = queue.shift();
      if (done.has(k)) continue;
      done.add(k);
      const [r, c] = this.rc(k);
      const t = this.grid[r][c];
      if (!t || t.special === SP.NONE || t.special === SP.CROWN) continue;
      const add = [];
      if (t.special === SP.ROW) {
        for (let i = 0; i < this.cols; i++) add.push([r, i]);
      } else if (t.special === SP.COL) {
        for (let i = 0; i < this.rows; i++) add.push([i, c]);
      } else if (t.special === SP.BOMB) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add.push([r + dr, c + dc]);
      } else if (t.special === SP.RAINBOW) {
        const target = this.mostCommonColor();
        for (let i = 0; i < this.rows; i++) {
          for (let j = 0; j < this.cols; j++) if (this.colorAt(i, j) === target) add.push([i, j]);
        }
        activations.push({ r, c, special: t.special, color: target });
      }
      if (t.special !== SP.RAINBOW) activations.push({ r, c, special: t.special, color: t.color });
      for (const [ar, ac] of add) {
        if (this.isBlock(ar, ac)) { hits.add(this.key(ar, ac)); continue; }
        if (!this.playable(ar, ac) || !this.grid[ar][ac] || this.grid[ar][ac].special === SP.CROWN) continue;
        const nk = this.key(ar, ac);
        if (!toClear.has(nk)) { toClear.add(nk); queue.push(nk); }
      }
    }
  }

  // Bir çözüm adımı: eşleşmeleri (ve varsa zorunlu temizlemeleri) uygular.
  // Hiçbir şey temizlenmezse null döner.
  resolveStep(preferred = [], forced = null) {
    const groups = this.findGroups();
    if (!groups.length && !forced) return null;

    const toClear = new Set(forced ? forced.cells : []);
    const creates = [];
    for (const g of groups) {
      g.cells.forEach((k) => toClear.add(k));
      const sp = this.specialFor(g, preferred);
      if (sp) creates.push(sp);
    }
    const activations = forced ? [...forced.activations] : [];
    const hits = new Set();
    // Asa vb. ile doğrudan engele vurma
    for (const k of toClear) { const [r, c] = this.rc(k); if (this.isBlock(r, c)) hits.add(k); }
    this.expandSpecials(toClear, activations, forced ? forced.skip : undefined, hits);
    // Eşleşmenin yanındaki engeller hasar alır
    for (const g of groups) {
      for (const k of g.cells) {
        const [r, c] = this.rc(k);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.isBlock(r + dr, c + dc)) hits.add(this.key(r + dr, c + dc));
      }
    }

    const cleared = [];
    const iceBroken = [];
    const unchained = [];
    const blockHits = [];
    for (const k of hits) {
      const [r, c] = this.rc(k);
      const b = this.block[r][c];
      b.hp--;
      blockHits.push({ r, c, type: b.type, hp: b.hp });
      if (b.hp <= 0) this.block[r][c] = null;
    }
    for (const k of toClear) {
      const [r, c] = this.rc(k);
      const t = this.grid[r][c];
      if (!t) continue;
      if (t.chain) { t.chain = false; unchained.push({ r, c, tile: t }); continue; }
      cleared.push({ r, c, tile: t });
      this.grid[r][c] = null;
      if (this.ice[r][c] > 0) {
        this.ice[r][c]--;
        iceBroken.push({ r, c, left: this.ice[r][c] });
      }
    }
    const created = [];
    const usedPivots = new Set();
    for (const cr of creates) {
      if (usedPivots.has(cr.key)) continue;
      usedPivots.add(cr.key);
      const [r, c] = this.rc(cr.key);
      if (this.grid[r][c]) continue; // zincirli taş yerinde kaldı
      const tile = this.newTile(cr.color, cr.special);
      this.grid[r][c] = tile;
      created.push({ r, c, tile });
    }
    if (!cleared.length && !unchained.length && !blockHits.length && !groups.length) return null;
    return { cleared, created, activations, iceBroken, unchained, blockHits, groups: groups.length };
  }

  // Taşları aşağı düşürür (boşluklardan geçebilirler) ve üstten yenilerini ekler.
  applyGravity() {
    const moves = [];
    const spawns = [];
    for (let c = 0; c < this.cols; c++) {
      const cells = [];
      for (let r = this.rows - 1; r >= 0; r--) if (!this.fixed(r, c)) cells.push(r);
      const tiles = [];
      for (const r of cells) {
        const t = this.grid[r][c];
        if (t) tiles.push({ t, from: r });
      }
      cells.forEach((r, i) => {
        if (i < tiles.length) {
          const { t, from } = tiles[i];
          this.grid[r][c] = t;
          if (from !== r) moves.push({ id: t.id, r, c, fromR: from });
        } else {
          let t;
          if (this.crownsPending > 0 && this.countCrowns() < this.maxCrownsOnBoard && this.rng() < 0.35) {
            this.crownsPending--;
            t = this.newTile(-2, SP.CROWN);
          } else t = this.newTile(this.randColor());
          this.grid[r][c] = t;
          spawns.push({ tile: t, r, c, order: i - tiles.length });
        }
      });
    }
    return { moves, spawns };
  }

  // Patlayan özel taş mı (taç değil)
  static blast(t) { return t.special !== SP.NONE && t.special !== SP.CROWN; }

  isAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  swapCells(a, b) {
    const t = this.grid[a.r][a.c];
    this.grid[a.r][a.c] = this.grid[b.r][b.c];
    this.grid[b.r][b.c] = t;
  }

  // Takası dener. Geçerliyse tahtayı değiştirir ve zorunlu temizleme bilgisini döndürür.
  trySwap(a, b) {
    if (!this.playable(a.r, a.c) || !this.playable(b.r, b.c) || !this.isAdjacent(a, b)) return { valid: false };
    const ta = this.grid[a.r][a.c];
    const tb = this.grid[b.r][b.c];
    if (!ta || !tb || ta.chain || tb.chain) return { valid: false };

    this.swapCells(a, b);
    // Takastan sonra: ta artık b'de, tb artık a'da
    const ka = this.key(a.r, a.c);
    const kb = this.key(b.r, b.c);

    const crownSwap = ta.special === SP.CROWN || tb.special === SP.CROWN;
    if (!crownSwap && (ta.special === SP.RAINBOW || tb.special === SP.RAINBOW)) {
      const cells = new Set([ka, kb]);
      const activations = [];
      const skip = new Set();
      if (ta.special === SP.RAINBOW && tb.special === SP.RAINBOW) {
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c]) cells.add(this.key(r, c));
        activations.push({ r: b.r, c: b.c, special: SP.RAINBOW, color: -1 });
        skip.add(ka); skip.add(kb);
      } else {
        const rainbowKey = ta.special === SP.RAINBOW ? kb : ka;
        const other = ta.special === SP.RAINBOW ? tb : ta;
        const [rr, rc] = this.rc(rainbowKey);
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) if (this.colorAt(r, c) === other.color) cells.add(this.key(r, c));
        }
        activations.push({ r: rr, c: rc, special: SP.RAINBOW, color: other.color });
        skip.add(rainbowKey);
      }
      return { valid: true, forced: { cells, activations, skip } };
    }

    if (Board.blast(ta) && Board.blast(tb)) {
      // İki özel taş birleşimi: ikisi birden patlar
      return { valid: true, forced: { cells: new Set([ka, kb]), activations: [], skip: new Set() } };
    }

    if (this.findGroups().length === 0) {
      this.swapCells(a, b);
      return { valid: false };
    }
    return { valid: true, forced: null };
  }

  hasRunAt(r, c) {
    const color = this.colorAt(r, c);
    if (color < 0) return false;
    let n = 1;
    for (let i = c - 1; this.colorAt(r, i) === color; i--) n++;
    for (let i = c + 1; this.colorAt(r, i) === color; i++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let i = r - 1; this.colorAt(i, c) === color; i--) n++;
    for (let i = r + 1; this.colorAt(i, c) === color; i++) n++;
    return n >= 3;
  }

  // Geçerli hamleleri listeler (yapay oyuncu ve ipucu için).
  listMoves(limit = Infinity) {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const a = { r, c };
          const b = { r: r + dr, c: c + dc };
          if (!this.playable(a.r, a.c) || !this.playable(b.r, b.c)) continue;
          const ta = this.grid[a.r][a.c];
          const tb = this.grid[b.r][b.c];
          if (!ta || !tb || ta.chain || tb.chain) continue;
          const crownSwap = ta.special === SP.CROWN || tb.special === SP.CROWN;
          let ok = false;
          if (!crownSwap && (ta.special === SP.RAINBOW || tb.special === SP.RAINBOW)) ok = true;
          else if (Board.blast(ta) && Board.blast(tb)) ok = true;
          else {
            this.swapCells(a, b);
            ok = this.hasRunAt(a.r, a.c) || this.hasRunAt(b.r, b.c);
            this.swapCells(a, b);
          }
          if (ok) {
            out.push({ a, b });
            if (out.length >= limit) return out;
          }
        }
      }
    }
    return out;
  }

  hasPossibleMove() { return this.listMoves(1).length > 0; }

  // Sütunun en alt taş tutan hücresine ulaşan taçlar toplanır.
  collectCrowns() {
    const got = [];
    for (let c = 0; c < this.cols; c++) {
      for (let r = this.rows - 1; r >= 0; r--) {
        if (!this.holds(r, c)) continue;
        const t = this.grid[r][c];
        if (t && t.special === SP.CROWN) { got.push({ r, c, tile: t }); this.grid[r][c] = null; }
        break;
      }
    }
    return got;
  }

  // Fırtına bulutu yanındaki sıradan bir mücevheri yutar.
  spreadCloud() {
    const options = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.block[r][c]?.type !== 'cloud') continue;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr; const nc = c + dc;
          const t = this.holds(nr, nc) ? this.grid[nr][nc] : null;
          if (t && t.special === SP.NONE && !t.chain) options.push([nr, nc]);
        }
      }
    }
    if (!options.length) return null;
    const [r, c] = options[Math.floor(this.rng() * options.length)];
    const tile = this.grid[r][c];
    this.grid[r][c] = null;
    this.block[r][c] = { type: 'cloud', hp: 1 };
    return { r, c, tile };
  }

  // Hamle kalmadığında taşları karıştırır. Taş kimlikleri korunur.
  shuffle() {
    const cells = [];
    const tiles = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] && !this.grid[r][c].chain) { cells.push([r, c]); tiles.push(this.grid[r][c]); }
      }
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }
      cells.forEach(([r, c], i) => { this.grid[r][c] = tiles[i]; });
      if (this.findGroups().length === 0 && this.hasPossibleMove()) {
        return cells.map(([r, c]) => ({ id: this.grid[r][c].id, r, c }));
      }
    }
    // Çok nadir: renkleri baştan üret
    this.fillInitial();
    return null;
  }
}
