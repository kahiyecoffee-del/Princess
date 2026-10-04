// Canvas drawing, animations, particle effects and touch input.
import { SP } from './board.js';
import { t } from './i18n.js';

// Royal jewel set: faceted gemstones in gold settings.
export const TILE_COLORS = [
  { name: 'Ruby', main: '#e8325a', light: '#ffb3c4', dark: '#6e0822' },
  { name: 'Topaz', main: '#ffd04d', light: '#fffbe0', dark: '#c27f08' },
  { name: 'Sapphire', main: '#3577ff', light: '#c2d8ff', dark: '#0a2280' },
  { name: 'Amethyst', main: '#a05cff', light: '#e6d0ff', dark: '#45168f' },
  { name: 'Emerald', main: '#1fc488', light: '#bff7df', dark: '#045a39' },
  { name: 'Moonstone', main: '#c9d4ff', light: '#ffffff', dark: '#5a67a8' },
];

const comboWord = (n) => t(`combo${Math.min(n, 7)}`);

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

// --- Shapes (unit coordinates, centre 0,0, radius ~1) ---
function pathStar(ctx, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1;
    const a = (Math.PI * i) / points - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 0.06);
  }
  ctx.closePath();
}

const poly = (n, r, rot = -Math.PI / 2, sx = 1, sy = 1) =>
  Array.from({ length: n }, (_, i) => [Math.cos(rot + (i * 2 * Math.PI) / n) * r * sx, Math.sin(rot + (i * 2 * Math.PI) / n) * r * sy]);

// Polygon outlines for the faceted cuts
const CUTS = {
  1: Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.46 : 0.98;
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r + 0.07];
  }),
  2: [[0, -0.98], [0.56, -0.42], [0.62, 0.12], [0, 0.98], [-0.62, 0.12], [-0.56, -0.42]],
  3: poly(6, 0.9),
  4: [[-0.42, -0.88], [0.42, -0.88], [0.7, -0.6], [0.7, 0.6], [0.42, 0.88], [-0.42, 0.88], [-0.7, 0.6], [-0.7, -0.6]],
};

const LIGHT = [-0.55, -0.83]; // light comes from the top left

function goldRim(ctx, width = 0.11) {
  const g = ctx.createLinearGradient(0, -1, 0, 1);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.35, '#e8b64a');
  g.addColorStop(0.7, '#a8741c');
  g.addColorStop(1, '#f2cf73');
  ctx.lineJoin = 'round';
  ctx.lineWidth = width + 0.06;
  ctx.strokeStyle = 'rgba(40, 20, 0, 0.55)';
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = g;
  ctx.stroke();
}

function facetedPolygon(ctx, pts, col, table = 0.48) {
  const n = pts.length;
  const cx = -0.05; const cy = -0.07; // table slightly offset toward the light
  const inner = pts.map(([x, y]) => [cx + x * table, cy + y * table]);
  const trace = (p) => { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

  // Base colour
  trace(pts);
  const base = ctx.createLinearGradient(-0.8, -0.9, 0.7, 0.9);
  base.addColorStop(0, col.light);
  base.addColorStop(0.35, col.main);
  base.addColorStop(1, col.dark);
  ctx.fillStyle = base;
  ctx.fill();

  // Crown facets: each edge shaded by how much it faces the light
  for (let i = 0; i < n; i++) {
    const a = pts[i]; const b = pts[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
    const len = Math.hypot(mx, my) || 1;
    const dot = (mx / len) * LIGHT[0] + (my / len) * LIGHT[1];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.lineTo(inner[(i + 1) % n][0], inner[(i + 1) % n][1]); ctx.lineTo(inner[i][0], inner[i][1]);
    ctx.closePath();
    ctx.fillStyle = dot > 0 ? `rgba(255,255,255,${0.12 + dot * 0.38})` : `rgba(0,0,30,${0.08 - dot * 0.32})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.02;
    ctx.stroke();
  }

  // Table (flat top face)
  trace(inner);
  const t = ctx.createLinearGradient(-0.4, -0.5, 0.4, 0.5);
  t.addColorStop(0, col.light);
  t.addColorStop(0.6, col.main);
  t.addColorStop(1, col.dark);
  ctx.fillStyle = t;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.025;
  ctx.stroke();

  trace(pts);
  goldRim(ctx);
}

function heartPath(ctx, s = 1, dy = 0) {
  ctx.beginPath();
  ctx.moveTo(0, 0.9 * s + dy);
  ctx.bezierCurveTo(-1.2 * s, 0.05 * s + dy, -0.9 * s, -1.02 * s + dy, 0, -0.42 * s + dy);
  ctx.bezierCurveTo(0.9 * s, -1.02 * s + dy, 1.2 * s, 0.05 * s + dy, 0, 0.9 * s + dy);
  ctx.closePath();
}

function drawRuby(ctx, col) {
  heartPath(ctx);
  const g = ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0.1, 1.15);
  g.addColorStop(0, col.light);
  g.addColorStop(0.4, col.main);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.fill();
  // Facet lines radiating from the centre
  ctx.save();
  heartPath(ctx);
  ctx.clip();
  const spokes = [[-0.95, -0.25], [-0.55, -0.75], [0, -0.42], [0.55, -0.75], [0.95, -0.25], [0.5, 0.45], [0, 0.9], [-0.5, 0.45]];
  spokes.forEach(([x, y], i) => {
    const [x2, y2] = spokes[(i + 1) % spokes.length];
    ctx.beginPath();
    ctx.moveTo(-0.05, -0.08); ctx.lineTo(x, y); ctx.lineTo(x2, y2); ctx.closePath();
    const mx = (x + x2) / 2; const my = (y + y2) / 2; const l = Math.hypot(mx, my) || 1;
    const dot = (mx / l) * LIGHT[0] + (my / l) * LIGHT[1];
    ctx.fillStyle = dot > 0 ? `rgba(255,255,255,${0.08 + dot * 0.3})` : `rgba(40,0,10,${0.06 - dot * 0.28})`;
    ctx.fill();
  });
  ctx.restore();
  heartPath(ctx, 0.45, -0.06);
  ctx.fillStyle = 'rgba(255,190,205,0.35)';
  ctx.fill();
  heartPath(ctx);
  goldRim(ctx);
}

function drawMoonstone(ctx, col) {
  const moon = () => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.92, Math.PI * 0.3, Math.PI * 1.7, false);
    ctx.arc(0.42, -0.08, 0.72, Math.PI * 1.43, Math.PI * 0.6, true);
    ctx.closePath();
  };
  moon();
  const g = ctx.createRadialGradient(-0.45, -0.3, 0.05, -0.2, 0, 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, col.main);
  g.addColorStop(0.8, '#8f9de0');
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.fill();
  // Blue adularescence sheen typical of moonstone
  ctx.save();
  moon();
  ctx.clip();
  const sheen = ctx.createRadialGradient(-0.5, 0.25, 0, -0.5, 0.25, 0.7);
  sheen.addColorStop(0, 'rgba(120,180,255,0.75)');
  sheen.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  moon();
  goldRim(ctx);
}

function drawGem(ctx, color, size) {
  const col = TILE_COLORS[color];
  const s = size * 0.4;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  // Soft glow behind the jewel
  const halo = ctx.createRadialGradient(0, 0, s * 0.3, 0, 0, s * 1.3);
  halo.addColorStop(0, col.main + '50');
  halo.addColorStop(1, col.main + '00');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0, 0, 20, 0.55)';
  ctx.shadowBlur = s * 0.18;
  ctx.shadowOffsetY = s * 0.06;
  if (color === 0) drawRuby(ctx, col);
  else if (color === 5) drawMoonstone(ctx, col);
  else facetedPolygon(ctx, CUTS[color], col, color === 1 ? 0.42 : 0.5);
  ctx.shadowColor = 'transparent';

  // Glint
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.translate(-0.38, -0.42);
  ctx.scale(0.22, 0.22);
  pathStar(ctx, 4, 0.28);
  ctx.fill();
  ctx.restore();
}


// ---------- Premium special jewels ----------
// Drawn around (0,0) in a cell of size S. `time` drives the animation.
function goldGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff6d0');
  g.addColorStop(0.4, '#f0c55a');
  g.addColorStop(0.75, '#a8741c');
  g.addColorStop(1, '#f6d77e');
  return g;
}

function drawCometLance(ctx, color, S, time, vertical) {
  const col = TILE_COLORS[color];
  ctx.save();
  if (vertical) ctx.rotate(Math.PI / 2);
  const L = S * 0.47;
  // Energy band
  const band = ctx.createLinearGradient(0, -S * 0.09, 0, S * 0.09);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.5, col.light);
  band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = band;
  ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time / 180);
  ctx.fillRect(-L, -S * 0.09, L * 2, S * 0.18);
  // Running light streak
  const k = ((time / 700) % 1) * 2 - 1;
  const streak = ctx.createRadialGradient(k * L, 0, 0, k * L, 0, S * 0.22);
  streak.addColorStop(0, 'rgba(255,255,255,0.95)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = streak;
  ctx.fillRect(-L, -S * 0.2, L * 2, S * 0.4);
  ctx.globalCompositeOperation = 'source-over';
  // Gold lance with arrow tips
  ctx.fillStyle = goldGradient(ctx, 0, -S * 0.03, 0, S * 0.03);
  ctx.fillRect(-L * 0.78, -S * 0.022, L * 1.56, S * 0.044);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * L, 0);
    ctx.lineTo(dir * L * 0.72, -S * 0.085);
    ctx.lineTo(dir * L * 0.78, 0);
    ctx.lineTo(dir * L * 0.72, S * 0.085);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,0,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStarFrame(ctx, color, S, time) {
  const col = TILE_COLORS[color];
  const pulse = 1 + 0.05 * Math.sin(time / 160);
  // Glow
  const glow = ctx.createRadialGradient(0, 0, S * 0.1, 0, 0, S * 0.55);
  glow.addColorStop(0, col.main + 'aa');
  glow.addColorStop(1, col.main + '00');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, S * 0.55 * pulse, 0, Math.PI * 2); ctx.fill();
  // Eight-pointed gold star, slowly turning
  ctx.save();
  ctx.rotate(time / 2600);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = (i % 2 ? 0.3 : 0.5) * S * pulse;
    const a = (Math.PI * i) / 8;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = goldGradient(ctx, -S * 0.4, -S * 0.4, S * 0.4, S * 0.4);
  ctx.shadowColor = 'rgba(255,210,120,0.9)';
  ctx.shadowBlur = S * 0.15;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(80,40,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawStarSparks(ctx, S, time) {
  ctx.fillStyle = '#fffbe6';
  for (let i = 0; i < 4; i++) {
    const a = time / 600 + (i * Math.PI) / 2;
    const r = S * 0.47;
    ctx.save();
    ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
    ctx.scale(S * 0.05, S * 0.05);
    pathStar(ctx, 4, 0.3);
    ctx.fill();
    ctx.restore();
  }
}

function drawCelestialOrb(ctx, S, time) {
  const r = S * 0.34;
  // Halo
  const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.6);
  halo.addColorStop(0, 'rgba(200,220,255,0.6)');
  halo.addColorStop(1, 'rgba(160,120,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
  // Back half of the gold rings
  const ring = (tilt, phase, front) => {
    ctx.save();
    ctx.rotate(tilt);
    ctx.beginPath();
    const squash = 0.32 + 0.08 * Math.sin(time / 900 + phase);
    ctx.ellipse(0, 0, r * 1.32, r * 1.32 * squash, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.strokeStyle = goldGradient(ctx, -r, -r, r, r);
    ctx.lineWidth = S * 0.045;
    ctx.stroke();
    ctx.restore();
  };
  ring(-0.5, 0, false);
  ring(0.7, 2, false);
  // Crystal sphere with a turning nebula
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
  const space = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  space.addColorStop(0, '#3a2a8a');
  space.addColorStop(1, '#0a0828');
  ctx.fillStyle = space;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.rotate(time / 1500);
  ctx.globalCompositeOperation = 'lighter';
  TILE_COLORS.forEach((c, i) => {
    const a = (i / TILE_COLORS.length) * Math.PI * 2;
    const g = ctx.createRadialGradient(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 0, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.75);
    g.addColorStop(0, c.main + '88');
    g.addColorStop(1, c.main + '00');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  });
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    const d = r * (0.2 + (i % 3) * 0.25);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time / 300 + i);
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, S * 0.012 + (i % 2) * S * 0.01, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  // Glass highlight and rim
  const gl = ctx.createLinearGradient(0, -r, 0, r);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.ellipse(-r * 0.15, -r * 0.35, r * 0.6, r * 0.38, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  // Front half of the rings
  ring(-0.5, 0, true);
  ring(0.7, 2, true);
}

// Draws a whole jewel (normal or special). `sprites` are cached normal gems.
export function drawJewel(ctx, tile, S, time = 0, sprites = null) {
  const sp = tile.special;
  if (sp === SP.RAINBOW) { drawCelestialOrb(ctx, S, time); return; }
  if (sp === SP.BOMB) drawStarFrame(ctx, tile.color, S, time);
  if (sprites) ctx.drawImage(sprites[tile.color], -S / 2, -S / 2, S, S);
  else {
    ctx.save();
    ctx.translate(-S / 2, -S / 2);
    drawGem(ctx, tile.color, S);
    ctx.restore();
  }
  if (sp === SP.ROW || sp === SP.COL) drawCometLance(ctx, tile.color, S, time, sp === SP.COL);
  if (sp === SP.BOMB) drawStarSparks(ctx, S, time);
}

export class Renderer {
  constructor(canvas, { onSwap, onSound, onHint, onWand }) {
    this.onHint = onHint;
    this.onWand = onWand;
    this.wandMode = false;
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
      if (m) { this.hint = m; this.onHint?.(); }
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
        // Midnight-blue glass tiles with a fine gold edge
        ctx.fillStyle = (r + c) % 2 ? 'rgba(14, 22, 64, 0.72)' : 'rgba(24, 34, 88, 0.72)';
        roundRect(ctx, x + 1.5, y + 1.5, S - 3, S - 3, S * 0.14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(214, 178, 96, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd77a';
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
      g.addColorStop(0.5, `rgba(235,240,255,${a})`);
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
      ctx.font = `900 ${t.size}px Cinzel, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, t.size / 6);
      ctx.strokeStyle = '#1a1446';
      ctx.strokeText(t.text, t.x, t.y);
      const g = ctx.createLinearGradient(0, t.y - t.size / 2, 0, t.y + t.size / 2);
      g.addColorStop(0, '#fffbe6');
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
    drawJewel(ctx, t, S, this.time, this.sprites);
    ctx.restore();
  }


  // Royal Wand strike: a falling star of light onto the chosen cell
  wandStrike(r, c) {
    const [x, y] = this.cellCenter(r, c);
    this.beams.push({ r, c, horizontal: false, life: 300, max: 300 });
    this.rings.push({ x, y, radius: this.cell * 1.6, life: 600, max: 600, rgb: '255,236,170' });
    this.burst(r, c, -1, 26, 1.6);
    this.shake = Math.max(this.shake, 8);
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

  floatText(text, x, y, size, color = '#e8b64a', life = 1100) {
    this.texts.push({ text, x, y, size, color, life, max: life });
  }

  bigText(text) {
    // Aynı anda tek büyük yazı: önceki büyük yazıyı hızla söndür
    for (const t of this.texts) if (t.big) t.life = Math.min(t.life, 150);
    this.floatText(text, this.w / 2, this.h / 2, Math.min(48, this.w / 9), '#e8b64a', 1500);
    this.texts[this.texts.length - 1].big = true;
  }

  // --- Adımları oynatma ---
  async playSteps(steps, onStepDone = () => {}) {
    for (const step of steps) {
      if (step.type === 'swap') await this.animateSwap(step.a, step.b);
      else if (step.type === 'clear') await this.animateClear(step);
      else if (step.type === 'fall') await this.animateFall(step);
      else if (step.type === 'shuffle') await this.animateShuffle(step);
      else if (step.type === 'rebuild') { this.bigText(t('shuffling')); this.rebuild(true); await this.wait(700); }
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
        this.rings.push({ x, y, radius: S * 2.2, life: 500, max: 500, rgb: '255,226,160' });
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
    this.floatText(`+${step.points}`, tx, ty, Math.max(16, S * 0.4), '#ffd77a', 900);
    if (step.cascade >= 2) {
      this.bigText(comboWord(step.cascade));
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
    this.bigText(t('shuffling'));
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
      if (this.wandMode) {
        const cell = this.cellFromEvent(e);
        if (cell) this.onWand?.(cell);
        return;
      }
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
