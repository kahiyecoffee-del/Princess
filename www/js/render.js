// Tuval (canvas) çizimi, animasyonlar, parçacık efektleri ve dokunma girişi.
import { SP } from './board.js';

export const TILE_COLORS = [
  { name: 'Kalp', main: '#ff4f9a', light: '#ffc2dc', dark: '#b3155c' },
  { name: 'Yıldız', main: '#ffcc33', light: '#fff4b8', dark: '#c27c00' },
  { name: 'Hilal', main: '#4cc3ff', light: '#c9efff', dark: '#1170b8' },
  { name: 'Elmas', main: '#b067ff', light: '#e6ccff', dark: '#6a1fc4' },
  { name: 'Gezegen', main: '#3fe0a0', light: '#c8ffe8', dark: '#108a5c' },
  { name: 'Taç', main: '#ff8a4c', light: '#ffd8c2', dark: '#c24a10' },
];

const COMBO_WORDS = ['', '', 'Güzel!', 'Harika!', 'Muhteşem!', 'Yıldız Yağmuru!', 'Gökyüzü Büyüsü!', 'Efsanevi!'];

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutBounce = (t) => {
  const n1 = 7.5625; const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

// --- Şekil çizimleri (birim koordinatlarda, merkez 0,0, yarıçap ~1) ---
function pathHeart(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, 0.85);
  ctx.bezierCurveTo(-1.15, 0.05, -0.85, -1.0, 0, -0.45);
  ctx.bezierCurveTo(0.85, -1.0, 1.15, 0.05, 0, 0.85);
  ctx.closePath();
}
function pathStar(ctx, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1;
    const a = (Math.PI * i) / points - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 0.06);
  }
  ctx.closePath();
}
function pathMoon(ctx) {
  ctx.beginPath();
  ctx.arc(0, 0, 0.9, Math.PI * 0.32, Math.PI * 1.68, false);
  ctx.arc(0.42, -0.1, 0.72, Math.PI * 1.45, Math.PI * 0.62, true);
  ctx.closePath();
}
function pathDiamond(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.85, -0.3);
  ctx.lineTo(-0.45, -0.8);
  ctx.lineTo(0.45, -0.8);
  ctx.lineTo(0.85, -0.3);
  ctx.lineTo(0, 0.9);
  ctx.closePath();
}
function pathPlanet(ctx) {
  ctx.beginPath();
  ctx.arc(0, 0, 0.62, 0, Math.PI * 2);
  ctx.closePath();
}
function pathCrown(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.85, 0.65);
  ctx.lineTo(-0.9, -0.5);
  ctx.lineTo(-0.45, -0.05);
  ctx.lineTo(0, -0.8);
  ctx.lineTo(0.45, -0.05);
  ctx.lineTo(0.9, -0.5);
  ctx.lineTo(0.85, 0.65);
  ctx.closePath();
}
const PATHS = [pathHeart, (c) => pathStar(c), pathMoon, pathDiamond, pathPlanet, pathCrown];

function drawGem(ctx, color, size) {
  const col = TILE_COLORS[color];
  const s = size * 0.42;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  // Parıltılı hale
  const halo = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.25);
  halo.addColorStop(0, col.main + '55');
  halo.addColorStop(1, col.main + '00');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(s, s);
  if (color === 4) {
    // gezegen halkası (arkada)
    ctx.save();
    ctx.rotate(-0.35);
    ctx.lineWidth = 0.14;
    ctx.strokeStyle = col.dark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.0, 0.32, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  PATHS[color](ctx);
  const g = ctx.createRadialGradient(-0.3, -0.4, 0.05, 0, 0, 1.1);
  g.addColorStop(0, col.light);
  g.addColorStop(0.45, col.main);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.shadowColor = col.dark;
  ctx.shadowBlur = 0.25 * s;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
  if (color === 4) {
    ctx.save();
    ctx.rotate(-0.35);
    ctx.lineWidth = 0.14;
    ctx.strokeStyle = col.light;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.0, 0.32, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }
  if (color === 5) {
    // taç mücevherleri
    ctx.fillStyle = '#fff';
    for (const x of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.arc(x, 0.32, 0.11, 0, Math.PI * 2); ctx.fill(); }
  }
  // Parlama
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-0.3, -0.35, 0.22, 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export class Renderer {
  constructor(canvas, { onSwap, onSound }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSwap = onSwap;
    this.onSound = onSound || (() => {});
    this.visuals = new Map(); // tile id -> görsel durum
    this.tweens = [];
    this.particles = [];
    this.beams = [];
    this.rings = [];
    this.texts = [];
    this.sprites = [];
    this.shake = 0;
    this.busy = false;
    this.selected = null;
    this.hint = null;
    this.lastInput = performance.now();
    this.time = 0;
    this.engine = null;
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const frame = (t) => { this.update(t); this.draw(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }

  setEngine(engine) {
    this.engine = engine;
    this.tweens = [];
    this.particles = [];
    this.beams = [];
    this.rings = [];
    this.texts = [];
    this.selected = null;
    this.hint = null;
    this.busy = false;
    this.rebuild(true);
    this.resize();
  }

  rebuild(intro = false) {
    this.visuals.clear();
    const b = this.engine.board;
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const t = b.grid[r][c];
        if (!t) continue;
        const v = { tile: t, x: c, y: intro ? r - b.rows - 1 : r, scale: 1, alpha: 1 };
        this.visuals.set(t.id, v);
        if (intro) this.tween(v, { y: r }, 500 + r * 30 + c * 15, easeOutBounce);
      }
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(100, rect.width);
    const h = Math.max(100, rect.height);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    const rows = this.engine?.board.rows || 8;
    const cols = this.engine?.board.cols || 8;
    this.cell = Math.floor(Math.min(w / cols, h / rows));
    this.ox = (w - this.cell * cols) / 2;
    this.oy = (h - this.cell * rows) / 2;
    this.buildSprites();
  }

  buildSprites() {
    const size = Math.ceil(this.cell * this.dpr);
    this.sprites = TILE_COLORS.map((_, i) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      drawGem(c.getContext('2d'), i, size);
      return c;
    });
  }

  // --- Tween motoru ---
  tween(obj, to, dur, ease = easeOutCubic, delay = 0) {
    return new Promise((resolve) => {
      const from = {};
      for (const k in to) from[k] = obj[k];
      this.tweens.push({ obj, from, to, dur, ease, start: performance.now() + delay, resolve });
    });
  }

  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  update(now) {
    const dt = Math.min(50, now - (this.time || now));
    this.time = now;
    const alive = [];
    for (const tw of this.tweens) {
      const t = Math.min(1, Math.max(0, (now - tw.start) / tw.dur));
      const e = tw.ease(t);
      for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (t >= 1) tw.resolve(); else alive.push(tw);
    }
    this.tweens = alive;

    const g = dt / 16.67;
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * g; p.y += p.vy * g; p.vy += p.grav * g; p.vx *= 0.98;
      p.life -= dt; p.rot += p.vr * g;
      return p.life > 0;
    });
    this.beams = this.beams.filter((b) => (b.life -= dt) > 0);
    this.rings = this.rings.filter((r) => (r.life -= dt) > 0);
    this.texts = this.texts.filter((t) => { t.y -= 0.6 * g; return (t.life -= dt) > 0; });
    this.shake *= 0.88;

    // 6 saniye hareketsizlikte ipucu göster
    if (this.engine && !this.busy && !this.hint && now - this.lastInput > 6000 && !this.engine.finished) {
      const m = this.engine.board.listMoves(1)[0];
      if (m) this.hint = m;
    }
  }

  cellCenter(r, c) {
    return [this.ox + (c + 0.5) * this.cell, this.oy + (r + 0.5) * this.cell];
  }

  draw() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.engine) return;
    const b = this.engine.board;
    const S = this.cell;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(sx, sy);

    // Hücre zemini
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        if (b.isHole(r, c)) continue;
        const x = this.ox + c * S;
        const y = this.oy + r * S;
        ctx.fillStyle = (r + c) % 2 ? 'rgba(60, 20, 110, 0.55)' : 'rgba(85, 35, 140, 0.55)';
        roundRect(ctx, x + 1, y + 1, S - 2, S - 2, S * 0.16);
        ctx.fill();
        const ice = b.ice[r][c];
        if (ice > 0) {
          const g = ctx.createLinearGradient(x, y, x + S, y + S);
          g.addColorStop(0, ice > 1 ? 'rgba(170,230,255,0.85)' : 'rgba(170,230,255,0.55)');
          g.addColorStop(1, ice > 1 ? 'rgba(90,170,255,0.75)' : 'rgba(90,170,255,0.4)');
          ctx.fillStyle = g;
          roundRect(ctx, x + 3, y + 3, S - 6, S - 6, S * 0.14);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = ice > 1 ? 2.5 : 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + S * 0.2, y + S * 0.3); ctx.lineTo(x + S * 0.35, y + S * 0.18);
          ctx.moveTo(x + S * 0.7, y + S * 0.85); ctx.lineTo(x + S * 0.85, y + S * 0.7);
          ctx.stroke();
        }
      }
    }

    // Seçim ve ipucu
    if (this.selected) {
      const [cx, cy] = this.cellCenter(this.selected.r, this.selected.c);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff9de2';
      ctx.shadowBlur = 12;
      roundRect(ctx, cx - S / 2 + 3, cy - S / 2 + 3, S - 6, S - 6, S * 0.18);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const hintPulse = this.hint ? (Math.sin(this.time / 180) + 1) / 2 : 0;

    // Taşlar (kırpma: tahtanın üstünden düşenler görünmesin)
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox, this.oy - 2, b.cols * S, b.rows * S + 4);
    ctx.clip();
    for (const v of this.visuals.values()) {
      let scale = v.scale;
      if (this.hint && ((this.hint.a.r === Math.round(v.y) && this.hint.a.c === Math.round(v.x)) ||
        (this.hint.b.r === Math.round(v.y) && this.hint.b.c === Math.round(v.x)))) scale *= 1 + hintPulse * 0.12;
      this.drawTile(v, scale);
    }
    ctx.restore();

    // Işınlar (çizgi temizleme)
    ctx.globalCompositeOperation = 'lighter';
    for (const bm of this.beams) {
      const a = bm.life / bm.max;
      const [cx, cy] = this.cellCenter(bm.r, bm.c);
      const thick = S * 0.7 * a;
      const g = bm.horizontal
        ? ctx.createLinearGradient(0, cy - thick, 0, cy + thick)
        : ctx.createLinearGradient(cx - thick, 0, cx + thick, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,240,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      if (bm.horizontal) ctx.fillRect(this.ox, cy - thick, b.cols * S, thick * 2);
      else ctx.fillRect(cx - thick, this.oy, thick * 2, b.rows * S);
    }
    for (const rg of this.rings) {
      const t = 1 - rg.life / rg.max;
      ctx.strokeStyle = `rgba(${rg.rgb},${1 - t})`;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.radius * easeOutCubic(t), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      const a = Math.min(1, p.life / p.max * 1.5);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.star) {
        ctx.scale(p.size, p.size);
        pathStar(ctx, 4, 0.35);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Uçan yazılar
    for (const t of this.texts) {
      const a = Math.min(1, t.life / 400);
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, t.size / 6);
      ctx.strokeStyle = '#5a0f6e';
      ctx.strokeText(t.text, t.x, t.y);
      const g = ctx.createLinearGradient(0, t.y - t.size / 2, 0, t.y + t.size / 2);
      g.addColorStop(0, '#fff7c2');
      g.addColorStop(1, t.color);
      ctx.fillStyle = g;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawTile(v, scale) {
    const { ctx } = this;
    const S = this.cell;
    const t = v.tile;
    const x = this.ox + v.x * S;
    const y = this.oy + v.y * S;
    if (v.alpha <= 0.01 || scale <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = v.alpha;
    ctx.translate(x + S / 2, y + S / 2);
    ctx.scale(scale, scale);
    if (t.special === SP.RAINBOW) {
      this.drawRainbow(S);
    } else {
      ctx.drawImage(this.sprites[t.color], -S / 2, -S / 2, S, S);
      if (t.special === SP.ROW || t.special === SP.COL) {
        const shimmer = (this.time / 600) % 1;
        ctx.save();
        if (t.special === SP.COL) ctx.rotate(Math.PI / 2);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin((shimmer + i * 0.3) * Math.PI * 2)})`;
          ctx.fillRect(-S * 0.36, i * S * 0.16 - S * 0.035, S * 0.72, S * 0.07);
        }
        ctx.restore();
      } else if (t.special === SP.BOMB) {
        const pulse = 1 + 0.08 * Math.sin(this.time / 150);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = TILE_COLORS[t.color].main;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, S * 0.44 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 4; i++) {
          const a = this.time / 500 + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * S * 0.44 * pulse, Math.sin(a) * S * 0.44 * pulse, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawRainbow(S) {
    const { ctx } = this;
    const r = S * 0.38;
    const rot = this.time / 700;
    ctx.save();
    ctx.rotate(rot);
    const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.4);
    halo.addColorStop(0, 'rgba(255,255,255,0.7)');
    halo.addColorStop(1, 'rgba(255,200,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2); ctx.fill();
    TILE_COLORS.forEach((col, i) => {
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = '#fff';
    ctx.scale(r * 0.55, r * 0.55);
    pathStar(ctx, 5, 0.45);
    ctx.fill();
    ctx.restore();
  }

  // --- Efektler ---
  burst(r, c, color, n = 10, power = 1) {
    const [x, y] = this.cellCenter(r, c);
    const col = color >= 0 ? TILE_COLORS[color] : { main: '#ffffff', light: '#ffffff' };
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3.5) * power;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, grav: 0.12,
        size: this.cell * (0.05 + Math.random() * 0.1) * (Math.random() < 0.5 ? 2 : 1),
        star: Math.random() < 0.55, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        color: Math.random() < 0.3 ? '#ffffff' : Math.random() < 0.5 ? col.light : col.main,
        life: 500 + Math.random() * 500, max: 1000,
      });
    }
  }

  floatText(text, x, y, size, color = '#ff7ad9', life = 1100) {
    this.texts.push({ text, x, y, size, color, life, max: life });
  }

  bigText(text) {
    // Aynı anda tek büyük yazı: önceki büyük yazıyı hızla söndür
    for (const t of this.texts) if (t.big) t.life = Math.min(t.life, 150);
    this.floatText(text, this.w / 2, this.h / 2, Math.min(56, this.w / 8), '#ff5fc8', 1500);
    this.texts[this.texts.length - 1].big = true;
  }

  // --- Adımları oynatma ---
  async playSteps(steps, onStepDone = () => {}) {
    for (const step of steps) {
      if (step.type === 'swap') await this.animateSwap(step.a, step.b);
      else if (step.type === 'clear') await this.animateClear(step);
      else if (step.type === 'fall') await this.animateFall(step);
      else if (step.type === 'shuffle') await this.animateShuffle(step);
      else if (step.type === 'rebuild') { this.bigText('Karıştırılıyor...'); this.rebuild(true); await this.wait(700); }
      onStepDone(step);
    }
  }

  visualAt(r, c) {
    for (const v of this.visuals.values()) if (Math.round(v.x) === c && Math.round(v.y) === r && v.alpha > 0.5) return v;
    return null;
  }

  async animateSwap(a, b, back = false) {
    const va = this.visualAt(a.r, a.c);
    const vb = this.visualAt(b.r, b.c);
    const p = [];
    if (va) p.push(this.tween(va, { x: b.c, y: b.r }, 170, easeInOut));
    if (vb) p.push(this.tween(vb, { x: a.c, y: a.r }, 170, easeInOut));
    await Promise.all(p);
    if (back) {
      this.onSound('invalid');
      const q = [];
      if (va) q.push(this.tween(va, { x: a.c, y: a.r }, 170, easeInOut));
      if (vb) q.push(this.tween(vb, { x: b.c, y: b.r }, 170, easeInOut));
      await Promise.all(q);
    }
  }

  async animateClear(step) {
    const S = this.cell;
    this.onSound('match', step.cascade);
    for (const act of step.activations) {
      const [x, y] = this.cellCenter(act.r, act.c);
      if (act.special === SP.ROW) { this.beams.push({ r: act.r, c: act.c, horizontal: true, life: 450, max: 450 }); this.onSound('line'); }
      if (act.special === SP.COL) { this.beams.push({ r: act.r, c: act.c, horizontal: false, life: 450, max: 450 }); this.onSound('line'); }
      if (act.special === SP.BOMB) {
        this.rings.push({ x, y, radius: S * 2.2, life: 500, max: 500, rgb: '255,220,255' });
        this.shake = Math.max(this.shake, 10);
        this.onSound('bomb');
      }
      if (act.special === SP.RAINBOW) {
        this.rings.push({ x, y, radius: S * 6, life: 800, max: 800, rgb: '255,240,180' });
        this.shake = Math.max(this.shake, 14);
        this.onSound('rainbow');
      }
    }
    let sx = 0; let sy = 0;
    const p = [];
    for (const { r, c, tile } of step.cleared) {
      const v = this.visuals.get(tile.id);
      if (!v) continue;
      sx += r; sy += c;
      this.burst(r, c, tile.special === SP.RAINBOW ? -1 : tile.color, tile.special ? 20 : 8, tile.special ? 1.6 : 1);
      p.push(this.tween(v, { scale: 1.25 }, 80).then(() => this.tween(v, { scale: 0, alpha: 0 }, 160)).then(() => this.visuals.delete(tile.id)));
    }
    for (const { r, c } of step.iceBroken) {
      const [x, y] = this.cellCenter(r, c);
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.8) * 5, grav: 0.25, size: S * 0.06,
          star: false, rot: 0, vr: 0, color: '#d6f3ff', life: 600, max: 600,
        });
      }
      this.onSound('ice');
    }
    const n = step.cleared.length || 1;
    const [tx, ty] = this.cellCenter(sx / n, sy / n);
    this.floatText(`+${step.points}`, tx, ty, Math.max(18, S * 0.45), '#ffd34d', 900);
    if (step.cascade >= 2) {
      this.bigText(COMBO_WORDS[Math.min(step.cascade, COMBO_WORDS.length - 1)]);
      this.onSound('combo', step.cascade);
    }
    await this.wait(90);
    for (const { r, c, tile } of step.created) {
      const v = { tile, x: c, y: r, scale: 0, alpha: 1 };
      this.visuals.set(tile.id, v);
      this.burst(r, c, tile.special === SP.RAINBOW ? -1 : tile.color, 16, 1.2);
      p.push(this.tween(v, { scale: 1 }, 320, easeOutBack));
      this.onSound('special');
    }
    await Promise.all(p);
  }

  async animateFall(step) {
    const p = [];
    for (const m of step.moves) {
      const v = this.visuals.get(m.id);
      if (!v) continue;
      const d = Math.abs(m.r - v.y);
      p.push(this.tween(v, { y: m.r, x: m.c }, 140 + d * 55, easeOutBounce));
    }
    for (const s of step.spawns) {
      const v = { tile: s.tile, x: s.c, y: -1 - s.order, scale: 1, alpha: 1 };
      this.visuals.set(s.tile.id, v);
      const d = s.r - v.y;
      p.push(this.tween(v, { y: s.r }, 160 + d * 55, easeOutBounce));
    }
    await Promise.all(p);
  }

  async animateShuffle(step) {
    this.bigText('Karıştırılıyor...');
    const p = [];
    for (const pos of step.positions) {
      const v = this.visuals.get(pos.id);
      if (v) p.push(this.tween(v, { x: pos.c, y: pos.r }, 500, easeInOut));
    }
    await Promise.all(p);
  }

  // Seviye sonu "yıldız yağmuru": kalan her hamle için tahtada parıltı
  async celebrate(count) {
    const b = this.engine.board;
    for (let i = 0; i < Math.min(count, 15); i++) {
      const r = Math.floor(Math.random() * b.rows);
      const c = Math.floor(Math.random() * b.cols);
      this.burst(r, c, Math.floor(Math.random() * TILE_COLORS.length), 18, 1.4);
      this.onSound('special');
      await this.wait(110);
    }
  }

  // --- Giriş ---
  cellFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.ox;
    const y = e.clientY - rect.top - this.oy;
    const c = Math.floor(x / this.cell);
    const r = Math.floor(y / this.cell);
    if (!this.engine || !this.engine.board.playable(r, c)) return null;
    return { r, c, x: e.clientX, y: e.clientY };
  }

  bindInput() {
    let start = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      this.lastInput = performance.now();
      this.hint = null;
      if (this.busy) return;
      start = this.cellFromEvent(e);
      if (start) this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!start || this.busy) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const th = this.cell * 0.35;
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      const target = Math.abs(dx) > Math.abs(dy)
        ? { r: start.r, c: start.c + Math.sign(dx) }
        : { r: start.r + Math.sign(dy), c: start.c };
      const from = { r: start.r, c: start.c };
      start = null;
      this.selected = null;
      this.onSwap(from, target);
    });
    this.canvas.addEventListener('pointerup', () => {
      if (!start || this.busy) { start = null; return; }
      const cell = { r: start.r, c: start.c };
      start = null;
      if (this.selected) {
        const s = this.selected;
        this.selected = null;
        if (Math.abs(s.r - cell.r) + Math.abs(s.c - cell.c) === 1) { this.onSwap(s, cell); return; }
        if (s.r === cell.r && s.c === cell.c) return;
      }
      this.selected = cell;
      this.onSound('select');
    });
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { drawGem };
