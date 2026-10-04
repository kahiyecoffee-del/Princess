import { Engine } from './engine.js';
import { getLevel, LEVEL_COUNT, describeGoal } from './levels.js';
import { Renderer, drawGem } from './render.js';
import { load, save } from './storage.js';
import { MAX_LIVES, refresh, loseLife, addLife, msToNext, formatMs } from './lives.js';
import { initAds, showInterstitial, showRewarded, AD_CONFIG } from './ads.js';
import { play as sfx, setSoundEnabled } from './audio.js';
import {
  HELPLINES, MILESTONES, daysSince, moneySaved, dailyMessage, todayStr, milestoneReached,
} from './recovery.js';

// Kaybedince reklam izleyerek kaç kez +3 hamle alınabileceği (seviye denemesi başına).
const MAX_CONTINUES = 2;
const CONTINUE_MOVES = 3;
// Bu kadar kesintisiz oyundan sonra nazik bir mola hatırlatması gösterilir.
const BREAK_REMINDER_SECONDS = 30 * 60;

const $ = (s) => document.querySelector(s);
const state = load();
setSoundEnabled(state.sound);

let engine = null;
let currentLevel = 1;
let continuesUsed = 0;
let sessionPlaySeconds = 0;
let nextBreakAt = BREAK_REMINDER_SECONDS;

const renderer = new Renderer($('#board'), { onSwap: handleSwap, onSound: (n, k) => sfx(n, k) });

// ---------- Ekranlar ----------
const screens = ['home', 'map', 'game', 'recovery'];
let currentScreen = 'home';
function show(name) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
  currentScreen = name;
  if (name === 'home') renderHome();
  if (name === 'map') renderMap();
  if (name === 'recovery') renderRecovery();
  if (name === 'game') requestAnimationFrame(() => renderer.resize());
}
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show('home')));

// ---------- Modal ----------
function modal({ title, body = '', buttons = [] }) {
  return new Promise((resolve) => {
    $('#modal-title').innerHTML = title;
    const bodyEl = $('#modal-body');
    bodyEl.innerHTML = '';
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
    const wrap = $('#modal-buttons');
    wrap.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = `btn ${b.cls || 'btn-secondary'}`;
      el.innerHTML = b.label;
      el.onclick = () => { $('#modal').hidden = true; resolve(b.value); };
      wrap.append(el);
    }
    $('#modal').hidden = false;
  });
}

function toast(text, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

function gemIcon(color, px = 44) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = Math.round(px * dpr);
  drawGem(c.getContext('2d'), color, c.width);
  return c;
}

// ---------- Canlar ----------
function updateLivesUI() {
  const now = Date.now();
  refresh(state.lives, now);
  const ms = msToNext(state.lives, now);
  document.querySelectorAll('[data-lives]').forEach((el) => {
    el.querySelector('.lives-count').textContent = state.lives.lives;
    el.querySelector('.lives-timer').textContent = state.lives.lives >= MAX_LIVES ? 'Dolu' : formatMs(ms);
  });
}
setInterval(() => {
  updateLivesUI();
  if (currentScreen === 'game' && !document.hidden) trackPlayTime();
}, 1000);

async function noLivesFlow() {
  const body = document.createElement('div');
  const p = document.createElement('p');
  body.append(p);
  const tick = () => { p.innerHTML = `Yeni can: <b>${formatMs(msToNext(state.lives, Date.now()))}</b><br>Her can 30 dakikada yenilenir.`; };
  tick();
  const iv = setInterval(tick, 1000);
  const choice = await modal({
    title: 'Canın kalmadı 💔',
    body,
    buttons: [
      { label: '🎬 Reklam izle, 1 can kazan', value: 'ad', cls: 'btn-ad' },
      { label: 'Beklerim', value: 'wait', cls: 'btn-ghost' },
    ],
  });
  clearInterval(iv);
  if (choice === 'ad') {
    const ok = await showRewarded();
    if (ok) {
      addLife(state.lives, Date.now(), 1);
      save(state);
      updateLivesUI();
      toast('+1 can kazandın ❤');
      return true;
    }
    toast('Reklam şu an yüklenemedi, biraz sonra tekrar dene.');
  }
  return false;
}

// ---------- Ana menü ----------
function renderHome() {
  $('#play-level').textContent = Math.min(state.maxLevel, LEVEL_COUNT);
  const days = daysSince(state.recovery.quitDate);
  $('#recovery-badge').textContent = state.recovery.quitDate ? `${days}. gün` : '';
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';
  updateLivesUI();
}

$('#btn-play').addEventListener('click', () => startLevel(Math.min(state.maxLevel, LEVEL_COUNT)));
$('#btn-map').addEventListener('click', () => show('map'));
$('#btn-recovery').addEventListener('click', () => show('recovery'));
$('#btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  setSoundEnabled(state.sound);
  save(state);
  renderHome();
});

// ---------- Harita ----------
function renderMap() {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const b = document.createElement('button');
    const L = getLevel(n);
    const locked = n > state.maxLevel;
    b.className = `level-btn${locked ? ' locked' : ''}${L.hard ? ' hard' : ''}${n === state.maxLevel ? ' current' : ''}`;
    const st = state.stars[n] || 0;
    b.innerHTML = `${locked ? '🔒' : n}<small>${locked ? '' : '★'.repeat(st)}</small>`;
    if (!locked) b.addEventListener('click', () => startLevel(n));
    grid.append(b);
  }
  updateLivesUI();
  grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
}

// ---------- Oyun akışı ----------
async function startLevel(n) {
  refresh(state.lives, Date.now());
  if (state.lives.lives <= 0) {
    const gotLife = await noLivesFlow();
    if (!gotLife) return false;
  }
  const level = getLevel(n);
  const intro = document.createElement('div');
  const goal = document.createElement('p');
  goal.textContent = describeGoal(level);
  intro.append(goal);
  if (level.kind === 'collect') {
    const row = document.createElement('div');
    row.className = 'goal-intro';
    for (const g of level.collect) {
      const item = document.createElement('div');
      item.append(gemIcon(g.color, 44));
      item.append(document.createTextNode(`× ${g.count}`));
      row.append(item);
    }
    intro.append(row);
  }
  const info = document.createElement('p');
  info.innerHTML = `<b>${level.moves}</b> hamle${level.hard ? '<br>⚡ <b>Zor seviye!</b>' : ''}`;
  intro.append(info);
  const choice = await modal({
    title: `Seviye ${n}`,
    body: intro,
    buttons: [{ label: 'Başla ✨', value: 'go', cls: 'btn-primary' }, { label: 'Geri', value: 'back', cls: 'btn-ghost' }],
  });
  if (choice !== 'go') return false;

  currentLevel = n;
  continuesUsed = 0;
  engine = new Engine(level);
  show('game');
  renderer.setEngine(engine);
  buildGoalsUI();
  updateHUD();
  return true;
}

function buildGoalsUI() {
  const wrap = $('#hud-goals');
  wrap.innerHTML = '';
  const L = engine.level;
  if (L.kind === 'collect') {
    for (const g of L.collect) {
      const el = document.createElement('span');
      el.className = 'goal';
      el.dataset.color = g.color;
      el.append(gemIcon(g.color, 26));
      const t = document.createElement('b');
      el.append(t);
      wrap.append(el);
    }
  } else if (L.kind === 'ice') {
    wrap.innerHTML = '<span class="goal" data-ice>🧊 <b></b></span>';
  } else {
    wrap.innerHTML = `<span class="goal">🎯 <b>${L.targetScore.toLocaleString('tr-TR')}</b></span>`;
  }
  // İlerleme çubuğundaki yıldız konumları
  const max = L.starScores[2];
  document.querySelectorAll('.pstar').forEach((s) => {
    const i = Number(s.dataset.star) - 1;
    s.style.left = `${Math.min(96, (L.starScores[i] / max) * 100)}%`;
  });
}

function updateHUD(shownScore = engine.score) {
  const L = engine.level;
  $('#hud-level').textContent = L.number;
  $('#hud-moves').textContent = engine.movesLeft;
  $('.hud-moves').classList.toggle('low', engine.movesLeft <= 5);
  $('#hud-score').textContent = shownScore.toLocaleString('tr-TR');
  if (L.kind === 'collect') {
    document.querySelectorAll('#hud-goals .goal').forEach((el) => {
      const g = L.collect.find((x) => x.color === Number(el.dataset.color));
      const left = Math.max(0, g.count - engine.collected[g.color]);
      el.querySelector('b').textContent = left === 0 ? '✓' : left;
      el.classList.toggle('done', left === 0);
    });
  } else if (L.kind === 'ice') {
    const el = $('#hud-goals [data-ice]');
    el.querySelector('b').textContent = engine.iceLeft === 0 ? '✓' : engine.iceLeft;
    el.classList.toggle('done', engine.iceLeft === 0);
  }
  const max = L.starScores[2];
  $('#hud-progress').style.width = `${Math.min(100, (shownScore / max) * 100)}%`;
  document.querySelectorAll('.pstar').forEach((s) => {
    const i = Number(s.dataset.star) - 1;
    s.classList.toggle('on', shownScore >= L.starScores[i] && (i > 0 || engine.goalsMet() || L.kind === 'score'));
  });
}

async function handleSwap(a, b) {
  if (!engine || renderer.busy || engine.finished) return;
  const result = engine.play(a, b);
  renderer.busy = true;
  if (!result.valid) {
    if (engine.board.playable(b.r, b.c)) await renderer.animateSwap(a, b, true);
    renderer.busy = false;
    return;
  }
  // Hamle sayacı hemen düşsün, puanlar animasyonla birlikte artsın
  $('#hud-moves').textContent = engine.movesLeft;
  await renderer.playSteps(result.steps, (step) => {
    if (step.type !== 'clear') return;
    if (step.cascade >= 3 || step.activations.length) castPrincess();
    updateHUD(step.score);
  });
  updateHUD();
  renderer.busy = false;
  if (engine.finished) await endOfMoves();
}

function castPrincess() {
  const el = $('#princess-small');
  el.classList.remove('cast');
  void el.getBBox();
  el.classList.add('cast');
}

async function endOfMoves() {
  if (engine.goalsMet()) return winFlow();

  if (continuesUsed < MAX_CONTINUES) {
    sfx('lose');
    const pct = Math.round(engine.progress() * 100);
    const choice = await modal({
      title: 'Hamlen bitti!',
      body: `<p>Hedefin <b>%${pct}</b> kadarını tamamladın.${pct >= 75 ? ' Çok yaklaştın!' : ''}</p>`,
      buttons: [
        { label: `🎬 Reklam izle, +${CONTINUE_MOVES} hamle kazan`, value: 'ad', cls: 'btn-ad' },
        { label: 'Vazgeç', value: 'quit', cls: 'btn-ghost' },
      ],
    });
    if (choice === 'ad') {
      const ok = await showRewarded();
      if (ok) {
        continuesUsed++;
        engine.addMoves(CONTINUE_MOVES);
        updateHUD();
        renderer.bigText(`+${CONTINUE_MOVES} Hamle!`);
        sfx('special');
        return;
      }
      toast('Reklam şu an yüklenemedi.');
    }
  }
  return failFlow();
}

async function failFlow() {
  loseLife(state.lives, Date.now());
  save(state);
  updateLivesUI();
  sfx('lose');
  const lives = state.lives.lives;
  const choice = await modal({
    title: 'Seviye geçilemedi',
    body: `<p>Bir can kaybettin. Kalan can: <b>${lives}</b> ❤</p><p class="small">${dailyMessage()}</p>`,
    buttons: [
      { label: 'Tekrar dene', value: 'retry', cls: 'btn-primary' },
      { label: 'Ana menü', value: 'home', cls: 'btn-ghost' },
    ],
  });
  if (choice !== 'retry' || !(await startLevel(currentLevel))) show('home');
}

async function winFlow() {
  renderer.busy = true;
  renderer.bigText('Seviye Tamam!');
  sfx('win');
  const leftover = engine.movesLeft;
  await renderer.celebrate(leftover);
  const bonus = engine.finishBonus();
  updateHUD();
  renderer.busy = false;

  const n = currentLevel;
  const stars = engine.stars();
  state.stars[n] = Math.max(state.stars[n] || 0, stars);
  state.best[n] = Math.max(state.best[n] || 0, engine.score);
  if (n === state.maxLevel && n < LEVEL_COUNT) state.maxLevel = n + 1;
  state.levelsSinceAd = (state.levelsSinceAd || 0) + 1;
  save(state);

  const starsHtml = [1, 2, 3].map((i) => `<span class="s ${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('');
  setTimeout(() => { for (let i = 0; i < stars; i++) setTimeout(() => sfx('star'), i * 250); }, 100);
  const choice = await modal({
    title: `Seviye ${n} geçildi!`,
    body: `<div class="big-stars">${starsHtml}</div><p>Puan: <b>${engine.score.toLocaleString('tr-TR')}</b>${bonus ? `<br><small>Kalan hamle bonusu: +${bonus.toLocaleString('tr-TR')}</small>` : ''}</p>`,
    buttons: [
      ...(n < LEVEL_COUNT ? [{ label: 'Sonraki seviye ➜', value: 'next', cls: 'btn-primary' }] : []),
      { label: 'Ana menü', value: 'home', cls: 'btn-ghost' },
    ],
  });

  // Her 5 seviyede bir otomatik geçiş reklamı
  if (state.levelsSinceAd >= AD_CONFIG.INTERSTITIAL_EVERY_N_LEVELS) {
    state.levelsSinceAd = 0;
    save(state);
    await showInterstitial();
  }
  if (choice !== 'next' || !(await startLevel(n + 1))) show('home');
}

$('#btn-quit').addEventListener('click', async () => {
  if (renderer.busy) return;
  if (!engine || engine.movesUsed === 0) { show('home'); return; }
  const choice = await modal({
    title: 'Çıkmak istiyor musun?',
    body: '<p>Seviyeden çıkarsan <b>1 can</b> kaybedersin.</p>',
    buttons: [
      { label: 'Oyuna devam', value: 'stay', cls: 'btn-primary' },
      { label: 'Çık (−1 can)', value: 'quit', cls: 'btn-ghost' },
    ],
  });
  if (choice === 'quit') {
    loseLife(state.lives, Date.now());
    save(state);
    engine = null;
    show('home');
  }
});

// ---------- Sağlıklı oyun: mola hatırlatması ----------
function trackPlayTime() {
  sessionPlaySeconds++;
  state.playSeconds = (state.playSeconds || 0) + 1;
  if (sessionPlaySeconds % 30 === 0) save(state);
  if (sessionPlaySeconds >= nextBreakAt && !renderer.busy && $('#modal').hidden) {
    nextBreakAt = sessionPlaySeconds + BREAK_REMINDER_SECONDS;
    modal({
      title: 'Küçük bir mola? ☕',
      body: '<p>Yarım saattir oynuyorsun. Bir bardak su iç, gözlerini dinlendir, biraz esne.</p><p class="small">Oyun kaldığın yerde seni bekleyecek.</p>',
      buttons: [{ label: 'Tamam', value: 'ok', cls: 'btn-primary' }],
    });
  }
}

// ---------- Kurtuluş Yolum ----------
function renderRecovery() {
  const rec = state.recovery;
  const days = daysSince(rec.quitDate);
  $('#rec-days').textContent = rec.quitDate ? days : '—';
  $('#rec-money').textContent = `${moneySaved(rec).toLocaleString('tr-TR')} ₺`;
  $('#rec-message').textContent = rec.quitDate ? dailyMessage() : 'Bahsi bıraktığın günü aşağıdan gir; her temiz günü birlikte sayalım. 🌱';
  $('#rec-urges').textContent = rec.urgesBeaten || 0;
  const reached = new Set(rec.quitDate ? milestoneReached(days) : []);
  $('#rec-milestones').innerHTML = MILESTONES.map((m) => `<span class="milestone ${reached.has(m) ? 'on' : ''}">${m} gün</span>`).join('');
  $('#rec-date').value = rec.quitDate || '';
  $('#rec-date').max = todayStr();
  $('#rec-spend').value = rec.dailySpend || '';
  $('#rec-helplines').innerHTML = HELPLINES.map((h) => `
    <div class="helpline"><div><b>${h.name}</b><br><span class="small">${h.note}</span></div><a href="tel:${h.phone}">📞 ${h.phone}</a></div>`).join('');
}

$('#rec-save').addEventListener('click', () => {
  const d = $('#rec-date').value;
  state.recovery.quitDate = d && d <= todayStr() ? d : state.recovery.quitDate;
  state.recovery.dailySpend = Math.max(0, Number($('#rec-spend').value) || 0);
  save(state);
  renderRecovery();
  toast('Kaydedildi 🌱');
});

$('#rec-reset').addEventListener('click', async () => {
  const choice = await modal({
    title: 'Sorun değil 💜',
    body: '<p>Kayma, iyileşmenin bir parçası olabilir. Önemli olan yeniden başlamak.</p><p>Sayacı bugünden başlatalım mı?</p>',
    buttons: [
      { label: 'Evet, bugün yeniden başlıyorum', value: 'yes', cls: 'btn-recovery' },
      { label: 'Vazgeç', value: 'no', cls: 'btn-ghost' },
    ],
  });
  if (choice === 'yes') {
    state.recovery.quitDate = todayStr();
    save(state);
    renderRecovery();
  }
});

// Dürtü anı: nefes egzersizi (4 sn al, 4 sn tut, 6 sn ver) x 4 tur
$('#btn-urge').addEventListener('click', async () => {
  const body = document.createElement('div');
  body.innerHTML = '<p>Dürtü bir dalga gibidir, geçecek. Benimle nefes al.</p><div class="breath-circle">Hazır</div><p class="small" data-round></p>';
  const circle = body.querySelector('.breath-circle');
  const roundEl = body.querySelector('[data-round]');
  let cancelled = false;
  const done = modal({
    title: 'Birlikte nefes alalım',
    body,
    buttons: [{ label: 'Kapat', value: 'close', cls: 'btn-ghost' }],
  }).then(() => { cancelled = true; });

  const phase = (text, scale, ms) => new Promise((r) => {
    if (cancelled) return r();
    circle.textContent = text;
    circle.style.transitionDuration = `${ms}ms`;
    circle.style.transform = `scale(${scale})`;
    if (text === 'Nefes al') sfx('breath');
    setTimeout(r, ms);
  });
  await new Promise((r) => setTimeout(r, 300));
  for (let i = 1; i <= 4 && !cancelled; i++) {
    roundEl.textContent = `Tur ${i} / 4`;
    await phase('Nefes al', 1, 4000);
    await phase('Tut', 1, 4000);
    await phase('Ver', 0.6, 6000);
  }
  if (!cancelled) {
    state.recovery.urgesBeaten = (state.recovery.urgesBeaten || 0) + 1;
    save(state);
    $('#modal').hidden = true;
    cancelled = true;
    await modal({
      title: 'Başardın! 💪',
      body: `<p>Bir dürtüyü daha atlattın. Şimdi zihnini meşgul etmek için bir seviye oynamaya ne dersin?</p><p class="small">Hâlâ zorlanıyorsan 115'i (YEDAM) arayabilirsin; ücretsiz ve gizlidir.</p>`,
      buttons: [{ label: 'Tamam', value: 'ok', cls: 'btn-recovery' }],
    });
    renderRecovery();
  }
  await done;
});

// ---------- Arka plan yıldızları ----------
(function sky() {
  const c = $('#sky');
  const ctx = c.getContext('2d');
  let stars = [];
  let shooting = null;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((innerWidth * innerHeight) / 4000) }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.6 + 0.3,
      p: Math.random() * Math.PI * 2, s: 0.5 + Math.random() * 2,
    }));
  }
  resize();
  addEventListener('resize', resize);
  function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.p + (t / 1000) * s.s));
      ctx.fillStyle = `rgba(255,240,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!shooting && Math.random() < 0.004) {
      shooting = { x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.4, life: 1 };
    }
    if (shooting) {
      const { x, y, life } = shooting;
      const g = ctx.createLinearGradient(x, y, x - 120, y - 50);
      g.addColorStop(0, `rgba(255,255,255,${life})`);
      g.addColorStop(1, 'rgba(255,180,240,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 120, y - 50);
      ctx.stroke();
      shooting.x += 9; shooting.y += 3.75; shooting.life -= 0.02;
      if (shooting.life <= 0) shooting = null;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}());

// Android geri tuşu (@capacitor/app)
window.Capacitor?.Plugins?.App?.addListener('backButton', () => {
  if (!$('#modal').hidden || !$('#mock-ad').hidden) return;
  if (currentScreen === 'game') $('#btn-quit').click();
  else if (currentScreen !== 'home') show('home');
  else window.Capacitor.Plugins.App.minimizeApp();
});

document.addEventListener('visibilitychange', () => { if (document.hidden) save(state); });

show('home');
initAds();

// Test/hata ayıklama için
window.__game = { state, get engine() { return engine; }, renderer, startLevel };
