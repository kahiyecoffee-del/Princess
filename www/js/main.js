import { Engine } from './engine.js';
import { getLevel, LEVEL_COUNT, describeGoal } from './levels.js';
import { Renderer, drawGem } from './render.js';
import { load, save } from './storage.js';
import { MAX_LIVES, refresh, loseLife, addLife, msToNext, formatMs } from './lives.js';
import { Capacitor, registerPlugin } from '../vendor/capacitor-core.js';
import { initAds, showInterstitial, showRewarded, AD_CONFIG } from './ads.js';
import { play as sfx, setSoundEnabled } from './audio.js';
import { say, giggle, setTrack, holdMusic, setVoiceEnabled, setMusicEnabled, whenUnlocked } from './voice.js';
import { Princess } from './princess.js';

// How many times per attempt the player can watch an ad for +3 moves.
const MAX_CONTINUES = 2;
const CONTINUE_MOVES = 3;
// A gentle break reminder appears after this much continuous play.
const BREAK_REMINDER_SECONDS = 30 * 60;

const $ = (s) => document.querySelector(s);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const state = load();
setSoundEnabled(state.sound);
setMusicEnabled(state.music !== false);
setVoiceEnabled(state.voice !== false);

let engine = null;
let currentLevel = 1;
let continuesUsed = 0;
let sessionPlaySeconds = 0;
let nextBreakAt = BREAK_REMINDER_SECONDS;

const renderer = new Renderer($('#board'), { onSwap: handleSwap, onSound: (n, k) => sfx(n, k), onHint: princessHint });
const tapLine = () => say(Math.random() < 0.6 ? 'tickles' : pick(['giggle1', 'giggle2', 'giggle3']));
const homePrincess = new Princess($('#princess-home'), { onGiggle: giggle });
const stagePrincess = new Princess($('#princess-stage'), { onTap: tapLine, onGiggle: giggle, framed: false });

// When the player seems stuck, the princess leans toward the board and whispers a hint.
let lastHintTalk = 0;
function princessHint() {
  if (currentScreen !== 'game') return;
  if (Date.now() - lastHintTalk > 45000) {
    lastHintTalk = Date.now();
    cheer('psst', 'Psst! Look here, darling.', 2200, 'lean');
  } else {
    stagePrincess.react('lean');
  }
}

// Short vibration for tactile feedback (Android); silently ignored elsewhere.
function haptic(ms = 12) {
  if (state.haptics !== false && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* not allowed */ }
}

// Ads have their own sound, so the music pauses while one is on screen.
async function withAd(fn) {
  holdMusic(true);
  try { return await fn(); } finally { holdMusic(false); }
}

// ---------- Screens ----------
const screens = ['home', 'map', 'game'];
let currentScreen = 'home';
function show(name) {
  for (const s of screens) {
    const el = $(`#screen-${s}`);
    el.hidden = s !== name;
    if (s === name) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
  }
  currentScreen = name;
  setTrack(name === 'game' ? 'game' : 'menu');
  if (name === 'map') renderMap();
  if (name === 'game') requestAnimationFrame(() => renderer.resize());
}

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

// ---------- Lives ----------
function updateLivesUI() {
  const now = Date.now();
  refresh(state.lives, now);
  const ms = msToNext(state.lives, now);
  document.querySelectorAll('[data-lives]').forEach((el) => {
    el.querySelector('.lives-count').textContent = state.lives.lives;
    el.querySelector('.lives-timer').textContent = state.lives.lives >= MAX_LIVES ? 'Full' : formatMs(ms);
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
  const tick = () => { p.innerHTML = `Next life in <b>${formatMs(msToNext(state.lives, Date.now()))}</b><br>A new life arrives every 30 minutes.`; };
  tick();
  const iv = setInterval(tick, 1000);
  const choice = await modal({
    title: 'Out of lives 💔',
    body,
    buttons: [
      { label: '🎬 Watch an ad for 1 life', value: 'ad', cls: 'btn-ad' },
      { label: "I'll wait", value: 'wait', cls: 'btn-ghost' },
    ],
  });
  clearInterval(iv);
  if (choice === 'ad') {
    const ok = await withAd(showRewarded);
    if (ok) {
      addLife(state.lives, Date.now(), 1);
      save(state);
      updateLivesUI();
      toast('+1 life ❤');
      return true;
    }
    toast('The ad could not load. Please try again in a moment.');
  }
  return false;
}

// ---------- Home ----------
// ---------- Settings ----------
const SETTINGS = [
  ['music', 'Music', (v) => setMusicEnabled(v)],
  ['sound', 'Sound effects', (v) => setSoundEnabled(v)],
  ['voice', "Princess's voice", (v) => setVoiceEnabled(v)],
  ['haptics', 'Vibration', () => {}],
];
$('#btn-settings').addEventListener('click', () => {
  const body = document.createElement('div');
  body.className = 'settings';
  for (const [key, label, apply] of SETTINGS) {
    const row = document.createElement('label');
    row.className = 'toggle';
    row.innerHTML = `<span>${label}</span><input type="checkbox" id="set-${key}" ${state[key] !== false ? 'checked' : ''}><i></i>`;
    row.querySelector('input').addEventListener('change', (e) => {
      state[key] = e.target.checked;
      apply(state[key]);
      save(state);
      if (key === 'voice' && state[key]) say('hi');
    });
    body.append(row);
  }
  modal({ title: 'Settings', body, buttons: [{ label: 'Done', value: 'ok', cls: 'btn-primary' }] });
});

// ---------- Kingdom map ----------
// A winding golden road climbs from level 1 (bottom) to the castle (top).
const CHAPTERS = ['Starlit Gate', 'Crystal Bridge', 'Moonlit Gardens', 'Sapphire Halls', 'Floating Isles',
  'Tower of Dawn', 'Celestial Library', 'Aurora Court', 'Silver Spires', 'The Sky Throne'];
const NODE_GAP = 92;
function renderMap() {
  const path = $('#level-grid');
  const scroller = $('#map-scroll');
  path.innerHTML = '';
  const w = Math.min(scroller.clientWidth || 360, 520);
  const total = LEVEL_COUNT;
  const height = total * NODE_GAP + 260;
  path.style.height = `${height}px`;
  const pos = (n) => ({
    x: w / 2 + Math.sin(n * 0.85) * w * 0.3,
    y: height - 70 - (n - 1) * NODE_GAP,
  });
  // Golden road; the part already travelled glows
  const road = (upTo) => {
    let d = '';
    for (let n = 1; n <= upTo; n++) {
      const p = pos(n);
      if (n === 1) d += `M${p.x} ${p.y}`;
      else {
        const q = pos(n - 1);
        d += ` C${q.x} ${q.y - NODE_GAP / 2} ${p.x} ${p.y + NODE_GAP / 2} ${p.x} ${p.y}`;
      }
    }
    return d;
  };
  const full = road(total);
  const done = road(Math.min(state.maxLevel, total));
  path.insertAdjacentHTML('beforeend', `<svg class="road" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}">
    <path d="${full}" class="road-base"/>${state.maxLevel > 1 ? `<path d="${done}" class="road-glow"/>` : ''}
    <path d="${full}" class="road-dash"/></svg>`);
  for (let n = 1; n <= total; n++) {
    const p = pos(n);
    if ((n - 1) % 10 === 0) {
      const ch = Math.floor((n - 1) / 10);
      const banner = document.createElement('div');
      banner.className = 'chapter';
      banner.style.top = `${p.y + 26}px`;
      banner.innerHTML = `<small>Chapter ${ch + 1}</small>${CHAPTERS[ch % CHAPTERS.length]}`;
      path.append(banner);
    }
    const L = getLevel(n);
    const locked = n > state.maxLevel;
    const b = document.createElement('button');
    b.className = `node${locked ? ' locked' : ''}${L.hard ? ' hard' : ''}${n === state.maxLevel ? ' current' : ''}`;
    b.style.left = `${p.x}px`;
    b.style.top = `${p.y}px`;
    const st = state.stars[n] || 0;
    b.innerHTML = `<span class="num">${locked ? '' : n}</span>${locked ? '<span class="lock"></span>' : ''}<span class="stars">${[1, 2, 3].map((i) => `<i class="${i <= st ? 'on' : ''}">★</i>`).join('')}</span>`;
    b.setAttribute('aria-label', locked ? `Level ${n}, locked` : `Level ${n}, ${st} stars`);
    if (!locked) b.addEventListener('click', () => startLevel(n));
    path.append(b);
  }
  const castle = document.createElement('div');
  castle.className = 'map-castle';
  castle.style.top = '0px';
  path.append(castle);
  updateLivesUI();
  const cur = pos(Math.min(state.maxLevel, total));
  scroller.scrollTop = cur.y - scroller.clientHeight / 2;
}

// ---------- Game flow ----------
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
  info.innerHTML = `<b>${level.moves}</b> moves${level.hard ? '<br>⚡ <b>Hard level!</b>' : ''}`;
  intro.append(info);
  const choice = await modal({
    title: `Level ${n}`,
    body: intro,
    buttons: [{ label: 'Start ✨', value: 'go', cls: 'btn-primary' }, { label: 'Back', value: 'back', cls: 'btn-ghost' }],
  });
  if (choice !== 'go') return false;

  currentLevel = n;
  continuesUsed = 0;
  engine = new Engine(level);
  show('game');
  renderer.setEngine(engine);
  buildGoalsUI();
  updateHUD();
  hideSpeech();
  setTimeout(() => cheer('lets-shine', "Let's shine together, darling!", 1900, 'hop'), 700);
  return true;
}

// Small gold crown used as the target-score icon.
const CROWN_ICON = `<svg class="goal-icon" viewBox="0 0 24 20" aria-label="Target"><defs><linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".55" stop-color="#e8b64a"/><stop offset="1" stop-color="#a8741c"/></linearGradient></defs>
  <path d="M2 16 L1 5 L7 10 L12 2 L17 10 L23 5 L22 16 Z" fill="url(#crownGold)" stroke="#fff6d8" stroke-width="1" stroke-linejoin="round"/>
  <rect x="2" y="16" width="20" height="3" rx="1" fill="url(#crownGold)" stroke="#fff6d8" stroke-width=".8"/>
  <circle cx="12" cy="11" r="1.8" fill="#e8325a"/><circle cx="6.5" cy="12.5" r="1.2" fill="#3577ff"/><circle cx="17.5" cy="12.5" r="1.2" fill="#3577ff"/></svg>`;

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
    wrap.innerHTML = `<span class="goal">${CROWN_ICON}<b>${L.targetScore.toLocaleString('en-US')}</b></span>`;
  }
  // Star positions on the progress bar
  const max = L.starScores[2];
  document.querySelectorAll('.pstar').forEach((s) => {
    const i = Number(s.dataset.star) - 1;
    s.style.left = `${Math.min(96, (L.starScores[i] / max) * 100)}%`;
  });
}

// The score counts up smoothly instead of jumping.
let scoreShown = 0;
let scoreAnim = 0;
function rollScore(target) {
  cancelAnimationFrame(scoreAnim);
  const el = $('#hud-score');
  const from = scoreShown;
  if (target < from) { scoreShown = target; el.textContent = target.toLocaleString('en-US'); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 450);
    scoreShown = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
    el.textContent = scoreShown.toLocaleString('en-US');
    if (k < 1) scoreAnim = requestAnimationFrame(step);
  };
  scoreAnim = requestAnimationFrame(step);
}

function updateHUD(shownScore = engine.score) {
  const L = engine.level;
  $('#hud-level').textContent = L.number;
  $('#hud-moves').textContent = engine.movesLeft;
  $('.hud-moves').classList.toggle('low', engine.movesLeft <= 5);
  rollScore(shownScore);
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
  // The move counter drops at once; the score rises with the animation
  $('#hud-moves').textContent = engine.movesLeft;
  let bestCascade = 0;
  let specials = 0;
  let rainbow = false;
  await renderer.playSteps(result.steps, (step) => {
    if (step.type !== 'clear') return;
    bestCascade = Math.max(bestCascade, step.cascade);
    specials += step.created.length;
    if (step.activations.some((a) => a.special === 4)) rainbow = true;
    if (step.activations.length) haptic(15);
    updateHUD(step.score);
  });
  updateHUD();
  renderer.busy = false;
  if (!engine.finished && !praiseMove(bestCascade, specials, rainbow)) stagePrincess.react('nod');
  if (engine.finished) await endOfMoves();
}

// The princess praises good moves out loud (not every move, so it stays special).
const PRAISE = {
  2: [['great', 'Ooh, great!'], ['sweet', 'Aww, so sweet!'], ['ooh-nice', 'Ooh, nice one!'], ['yay', 'Yay! Hehe!']],
  3: [['amazing', 'Amazing! Hehe!'], ['wonderful', 'Mmm, wonderful!'], ['hehe', 'Hehe! Amazing!']],
  4: [['fantastic', 'Fantastic, darling!'], ['so-good', "You're so good at this!"], ['wow', "Wow! I'm impressed!"]],
  5: [['spectacular', "Spectacular! You're dazzling!"], ['my-hero', 'My hero! Hehe!']],
  6: [['magnificent', 'Magnificent!']],
};
function praiseMove(cascade, specials, rainbow) {
  if (rainbow) { cheer('magnificent', "Magnificent! I'm impressed!", 2200, 'dance'); return true; }
  if (cascade >= 2) {
    const [key, text] = pick(PRAISE[Math.min(cascade, 6)]);
    cheer(key, text, 1800, cascade >= 4 ? 'dance' : 'cheer');
    return true;
  }
  if (specials > 0) {
    cheer(...pick([['wonderful', 'Mmm, wonderful!'], ['brilliant', 'Brilliant! Hehe!'], ['smile', 'You make me smile!']]), 1800, 'kiss');
    return true;
  }
  return false;
}

let speechTimer = 0;
function cheer(key, text, ms = 1800, reaction = 'cheer') {
  const bubble = $('#speech');
  $('#speech-text').textContent = text;
  bubble.hidden = false;
  bubble.classList.remove('pop');
  void bubble.offsetWidth;
  bubble.classList.add('pop');
  stagePrincess.react(reaction);
  haptic(reaction === 'dance' ? 30 : 12);
  say(key);
  clearTimeout(speechTimer);
  speechTimer = setTimeout(hideSpeech, ms);
}
function hideSpeech() { $('#speech').hidden = true; }


async function endOfMoves() {
  if (engine.goalsMet()) return winFlow();

  if (continuesUsed < MAX_CONTINUES) {
    sfx('lose');
    const pct = Math.round(engine.progress() * 100);
    if (pct >= 75) say('almost');
    const choice = await modal({
      title: 'Out of moves!',
      body: `<p>You reached <b>${pct}%</b> of your goal.${pct >= 75 ? ' So close!' : ''}</p>`,
      buttons: [
        { label: `🎬 Watch an ad for +${CONTINUE_MOVES} moves`, value: 'ad', cls: 'btn-ad' },
        { label: 'Give up', value: 'quit', cls: 'btn-ghost' },
      ],
    });
    if (choice === 'ad') {
      const ok = await withAd(showRewarded);
      if (ok) {
        continuesUsed++;
        engine.addMoves(CONTINUE_MOVES);
        updateHUD();
        renderer.bigText(`+${CONTINUE_MOVES} Moves!`);
        sfx('special');
        cheer('keep-going', "Let's keep going, together!", 1800, 'hop');
        return;
      }
      toast('The ad could not load right now.');
    }
  }
  return failFlow();
}

async function failFlow() {
  loseLife(state.lives, Date.now());
  save(state);
  updateLivesUI();
  sfx('lose');
  say('dont-give-up');
  stagePrincess.react('sad');
  const lives = state.lives.lives;
  const choice = await modal({
    title: 'Level failed',
    body: `<p>You lost a life. Lives left: <b>${lives}</b> ❤</p><p class="small">Every try makes you better. You can do this!</p>`,
    buttons: [
      { label: 'Try again', value: 'retry', cls: 'btn-primary' },
      { label: 'Kingdom Map', value: 'map', cls: 'btn-ghost' },
    ],
  });
  if (choice !== 'retry' || !(await startLevel(currentLevel))) show('map');
}

async function winFlow() {
  renderer.busy = true;
  renderer.bigText('Level Complete!');
  sfx('win');
  cheer('congratulations', 'Congratulations, darling!', 2400, 'dance');
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
  setTimeout(() => say(stars === 3 ? 'you-did-it' : 'well-done'), 900);
  const choice = await modal({
    title: `Level ${n} complete!`,
    body: `<img class="modal-portrait breathe" src="img/prenses-yuz.jpg" alt=""><div class="big-stars">${starsHtml}</div><p>Score: <b>${engine.score.toLocaleString('en-US')}</b>${bonus ? `<br><small>Moves-left bonus: +${bonus.toLocaleString('en-US')}</small>` : ''}</p>`,
    buttons: [
      ...(n < LEVEL_COUNT ? [{ label: 'Next level ➜', value: 'next', cls: 'btn-primary' }] : []),
      { label: 'Kingdom Map', value: 'map', cls: 'btn-ghost' },
    ],
  });

  // Automatic interstitial ad every 5 levels
  if (state.levelsSinceAd >= AD_CONFIG.INTERSTITIAL_EVERY_N_LEVELS) {
    state.levelsSinceAd = 0;
    save(state);
    await withAd(showInterstitial);
  }
  if (choice !== 'next' || !(await startLevel(n + 1))) show('map');
}

$('#btn-quit').addEventListener('click', async () => {
  if (renderer.busy) return;
  if (!engine || engine.movesUsed === 0) { show('map'); return; }
  const choice = await modal({
    title: 'Leave this level?',
    body: '<p>If you leave now, you lose <b>1 life</b>.</p>',
    buttons: [
      { label: 'Keep playing', value: 'stay', cls: 'btn-primary' },
      { label: 'Leave (−1 life)', value: 'quit', cls: 'btn-ghost' },
    ],
  });
  if (choice === 'quit') {
    loseLife(state.lives, Date.now());
    save(state);
    engine = null;
    show('map');
  }
});

// ---------- Healthy play: break reminder ----------
function trackPlayTime() {
  sessionPlaySeconds++;
  state.playSeconds = (state.playSeconds || 0) + 1;
  if (sessionPlaySeconds % 30 === 0) save(state);
  if (sessionPlaySeconds >= nextBreakAt && !renderer.busy && $('#modal').hidden) {
    nextBreakAt = sessionPlaySeconds + BREAK_REMINDER_SECONDS;
    modal({
      title: 'Time for a short break? ☕',
      body: '<p>You have been playing for half an hour. Drink some water, rest your eyes and stretch a little.</p><p class="small">Your game will be right here when you come back.</p>',
      buttons: [{ label: 'OK', value: 'ok', cls: 'btn-primary' }],
    });
  }
}

// ---------- Background stars ----------
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
    }));    // Golden dust drifting slowly upward
    motes = Array.from({ length: Math.round((innerWidth * innerHeight) / 18000) }, () => newMote(true));
  }
  let motes = [];
  function newMote(anywhere) {
    return {
      x: Math.random() * innerWidth, y: anywhere ? Math.random() * innerHeight : innerHeight + 10,
      r: 0.8 + Math.random() * 1.8, vy: 0.15 + Math.random() * 0.35, ph: Math.random() * 6.28, a: 0.25 + Math.random() * 0.5,
    };
  }
  resize();
  addEventListener('resize', resize);
  function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.p + (t / 1000) * s.s));
      ctx.fillStyle = `rgba(230,236,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.vy;
      m.x += Math.sin(t / 1400 + m.ph) * 0.25;
      if (m.y < -10) motes[i] = newMote(false);
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 3);
      g.addColorStop(0, `rgba(255,226,150,${m.a})`);
      g.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!shooting && Math.random() < 0.004) {
      shooting = { x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.4, life: 1 };
    }
    if (shooting) {
      const { x, y, life } = shooting;
      const g = ctx.createLinearGradient(x, y, x - 120, y - 50);
      g.addColorStop(0, `rgba(255,255,255,${life})`);
      g.addColorStop(1, 'rgba(150,170,255,0)');
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

// Android back button (@capacitor/app)
const AppPlugin = Capacitor.isNativePlatform() ? registerPlugin('App') : null;
AppPlugin?.addListener('backButton', () => {
  if (!$('#modal').hidden || !$('#mock-ad').hidden) return;
  if (currentScreen === 'game') $('#btn-quit').click();
  else AppPlugin.minimizeApp();
});

document.addEventListener('visibilitychange', () => { if (document.hidden) save(state); });

show('home');
initAds();
// Greet the player on the first tap (browsers only allow sound after a tap)
whenUnlocked(() => { if (currentScreen === 'home') say(state.maxLevel > 1 ? 'welcome' : 'hi'); });

// Welcome screen: one tap anywhere and the princess winks, then the map opens.
let leavingWelcome = false;
$('#screen-home').addEventListener('click', () => {
  if (leavingWelcome) return;
  leavingWelcome = true;
  homePrincess.react('cheer');
  $('#screen-home').classList.add('leaving');
  setTimeout(() => { show('map'); leavingWelcome = false; $('#screen-home').classList.remove('leaving'); }, 950);
});

// For tests and debugging
window.__game = { state, get engine() { return engine; }, renderer, startLevel };
