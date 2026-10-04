import { Engine } from './engine.js';
import { getLevel, LEVEL_COUNT, describeGoal } from './levels.js';
import { Renderer, drawGem, drawJewel } from './render.js';
import { SP } from './board.js';
import {
  streakBonus, festivalState, addShards, claimFestival, FESTIVAL_MILESTONES, FESTIVAL_COIN_MULTIPLIER,
  chapterStory, CHAPTER_REWARD,
} from './progression.js';
import {
  ITEMS, ITEM_ORDER, initEconomy, buyItem, useItem, spend, levelReward, dailyStatus, claimDaily, DAILY,
  adCoinsLeft, grantAdCoins, AD_COINS, LIVES_REFILL_PRICE, EXTRA_MOVES_PRICE, EXTRA_MOVES,
  ensurePlayerId, redeemInvite, grantShareReward, INVITE_REWARD, SHARE_REWARD,
} from './economy.js';
import { load, save } from './storage.js';
import { MAX_LIVES, refresh, loseLife, addLife, msToNext, formatMs } from './lives.js';
import { Capacitor, registerPlugin } from '../vendor/capacitor-core.js';
import { initAds, showInterstitial, showRewarded, AD_CONFIG } from './ads.js';
import { play as sfx, setSoundEnabled } from './audio.js';
import { say, giggle, setTrack, holdMusic, setVoiceEnabled, setMusicEnabled, setGreeting, setMouthListener } from './voice.js';
import { Princess } from './princess.js';
import { askPermission, scheduleAll } from './notifications.js';
import { COIN_PACKS, NO_ADS, initStore, priceOf, buy, ownsNoAds, restore, isTestStore } from './purchases.js';

// How many times per attempt the player can watch an ad for +3 moves.
const MAX_CONTINUES = 2;
const CONTINUE_MOVES = 3;
// A gentle break reminder appears after this much continuous play.
const BREAK_REMINDER_SECONDS = 30 * 60;

const $ = (s) => document.querySelector(s);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const state = initEconomy(load());
ensurePlayerId(state);
setSoundEnabled(state.sound);
setMusicEnabled(state.music !== false);
setVoiceEnabled(state.voice !== false);

let engine = null;
let currentLevel = 1;
let continuesUsed = 0;
let sessionPlaySeconds = 0;
let nextBreakAt = BREAK_REMINDER_SECONDS;

const renderer = new Renderer($('#board'), { onSwap: handleSwap, onWand: (c) => handleWand(c), onSound: (n, k) => sfx(n, k), onHint: princessHint });
const tapLine = () => say(Math.random() < 0.6 ? 'tickles' : pick(['giggle1', 'giggle2', 'giggle3']));
const homePrincess = new Princess($('#princess-home'), { onGiggle: giggle });
const stagePrincess = new Princess($('#princess-stage'), { onTap: tapLine, onGiggle: giggle, framed: false });
// Whichever princess is on screen moves her lips with her voice
setMouthListener((lvl) => (storyMode ? storyPrincess : currentScreen === 'game' ? stagePrincess : homePrincess).mouth(lvl));

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
  try { return await fn(); } finally { holdMusic(false); adClock = 0; }
}

// Seconds of play since the last ad. Interstitials only appear at natural breaks
// (level end, leaving a level, starting a level), never in the middle of a move:
// AdMob forbids ads that interrupt gameplay.
let adClock = 0;
async function adBreak() {
  if (state.noAds) return;
  if (adClock < AD_CONFIG.INTERSTITIAL_EVERY_SECONDS && (state.levelsSinceAd || 0) < AD_CONFIG.INTERSTITIAL_EVERY_N_LEVELS) return;
  state.levelsSinceAd = 0;
  save(state);
  await withAd(showInterstitial);
}

// ---------- Screens ----------
const screens = ['home', 'map', 'game'];
let dailyShown = false;
let currentScreen = 'home';
function show(name) {
  for (const s of screens) {
    const el = $(`#screen-${s}`);
    el.hidden = s !== name;
    if (s === name) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
  }
  currentScreen = name;
  document.body.dataset.screen = name;
  setTrack(name === 'game' ? 'game' : 'menu');
  if (name === 'map') renderMap();
  if (name === 'game') requestAnimationFrame(() => renderer.resize());
  if (name === 'map') { updateCoinsUI(); updateFestivalUI(); if (!dailyShown) { dailyShown = true; setTimeout(() => openDaily(true), 900); } }
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
// ---------- Coins & items ----------
const COIN = '<span class="coin"></span>';
function updateCoinsUI() {
  $('#coin-count').textContent = state.coins.toLocaleString('en-US');
  $('#wand-count').textContent = state.items.wand || '+';
  $('#btn-wand').classList.toggle('empty', !state.items.wand);
  $('#daily-dot').hidden = !dailyStatus(state).available;
}
function addCoins(n) {
  state.coins += n;
  save(state);
  updateCoinsUI();
  const pill = $('#btn-coins');
  pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
}

// Item icons drawn with the same premium jewel art as the board
function drawWand(ctx, S) {
  ctx.save();
  ctx.rotate(-0.7);
  const g = ctx.createLinearGradient(-S * 0.04, 0, S * 0.04, 0);
  g.addColorStop(0, '#fff6d0'); g.addColorStop(0.5, '#e8b64a'); g.addColorStop(1, '#8a5a12');
  ctx.fillStyle = g;
  ctx.fillRect(-S * 0.035, -S * 0.12, S * 0.07, S * 0.55);
  ctx.translate(0, -S * 0.2);
  ctx.shadowColor = '#ffe9a8'; ctx.shadowBlur = S * 0.15;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 0.1 : 0.24) * S;
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  const sg = ctx.createRadialGradient(-S * 0.05, -S * 0.05, 0, 0, 0, S * 0.25);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.5, '#ffd04d'); sg.addColorStop(1, '#c27f08');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.restore();
}
const ICON_TILES = { lance: { color: 2, special: SP.ROW }, bomb: { color: 3, special: SP.BOMB }, orb: { color: 0, special: SP.RAINBOW } };
function itemIcon(id, px = 56) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = `${px}px`;
  paintItem(c, id);
  return c;
}
function paintItem(c, id) {
  const ctx = c.getContext('2d');
  const S = c.width;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  if (id === 'wand') drawWand(ctx, S);
  else drawJewel(ctx, ICON_TILES[id], S * 0.86, 1200);
  ctx.restore();
}
paintItem($('#btn-wand canvas'), 'wand');

// ---------- Shop ----------
async function openShop() {
  const body = document.createElement('div');
  body.className = 'shop';
  const render = () => {
    body.innerHTML = `<div class="shop-balance">${COIN}<b>${state.coins.toLocaleString('en-US')}</b></div>`;
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    for (const id of ITEM_ORDER) {
      const it = ITEMS[id];
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.append(itemIcon(id, 58));
      card.insertAdjacentHTML('beforeend', `<h4>${it.name}</h4><p>${it.desc}</p><small>Owned: <b>${state.items[id] || 0}</b></small>`);
      const buy = document.createElement('button');
      buy.className = 'btn btn-primary btn-buy';
      buy.innerHTML = `${COIN}${it.price}`;
      buy.disabled = state.coins < it.price;
      buy.addEventListener('click', () => {
        if (buyItem(state, id)) { save(state); sfx('star'); haptic(15); updateCoinsUI(); render(); }
      });
      card.append(buy);
      grid.append(card);
    }
    body.append(grid);
    const extra = document.createElement('div');
    extra.className = 'shop-extra';
    const refill = document.createElement('button');
    refill.className = 'btn btn-secondary';
    const full = state.lives.lives >= MAX_LIVES;
    refill.innerHTML = full ? '❤ Lives are full' : `❤ Refill all lives · ${COIN}${LIVES_REFILL_PRICE}`;
    refill.disabled = full || state.coins < LIVES_REFILL_PRICE;
    refill.addEventListener('click', () => {
      if (spend(state, LIVES_REFILL_PRICE)) { addLife(state.lives, Date.now(), MAX_LIVES); save(state); updateLivesUI(); updateCoinsUI(); sfx('win'); render(); }
    });
    const left = adCoinsLeft(state);
    const ad = document.createElement('button');
    ad.className = 'btn btn-ad';
    ad.innerHTML = left ? `🎬 Watch an ad · +${AD_COINS} ${COIN} <small>(${left} left today)</small>` : 'Come back tomorrow for more free coins';
    ad.disabled = !left;
    ad.addEventListener('click', async () => {
      if (await withAd(showRewarded)) { grantAdCoins(state); save(state); updateCoinsUI(); sfx('star'); render(); } else toast('The ad could not load right now.');
    });
    extra.append(refill, ad);
    body.append(extra);

    // Real-money section
    const testBuy = () => { toast('Test mode: no real payment was made.'); return true; };
    const gold = document.createElement('div');
    gold.className = 'shop-section';
    gold.innerHTML = `<h3>Treasure Chests</h3>${isTestStore ? '<p class="small">Web demo: purchases are simulated.</p>' : ''}`;
    const packs = document.createElement('div');
    packs.className = 'pack-grid';
    COIN_PACKS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = `pack${p.tag === 'Best value' ? ' best' : ''}`;
      b.innerHTML = `${p.tag ? `<em>${p.tag}</em>` : ''}<span class="pack-chest size${i}"></span><b>${COIN}${p.coins.toLocaleString('en-US')}</b><span class="pack-price">${priceOf(p)}</span>`;
      b.addEventListener('click', async () => {
        if (await buy(p.id, { consumable: true }, testBuy)) {
          addCoins(p.coins); sfx('win'); say('yay'); render();
        }
      });
      packs.append(b);
    });
    gold.append(packs);
    const noAds = document.createElement('button');
    noAds.className = 'btn no-ads';
    noAds.innerHTML = state.noAds ? '✓ No ads: thank you, darling! 💖' : `🚫 Remove ads forever · ${priceOf(NO_ADS)}<small>Rewarded ads stay optional</small>`;
    noAds.disabled = !!state.noAds;
    noAds.addEventListener('click', async () => {
      if (await buy(NO_ADS.id, { consumable: false }, testBuy)) { state.noAds = true; save(state); sfx('win'); say('my-hero'); render(); }
    });
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'link-btn';
    restoreBtn.textContent = 'Restore purchases';
    restoreBtn.addEventListener('click', async () => {
      if (await restore()) { state.noAds = true; save(state); toast('No-ads restored ✓'); render(); } else toast('Nothing to restore.');
    });
    gold.append(noAds, restoreBtn);
    body.append(gold);
  };
  render();
  await modal({ title: 'Royal Shop', body, buttons: [{ label: 'Close', value: 'ok', cls: 'btn-ghost' }] });
  updateCoinsUI();
}
$('#btn-shop').addEventListener('click', openShop);
$('#btn-coins').addEventListener('click', openShop);

// ---------- Daily gift ----------
async function openDaily(auto = false) {
  const st = dailyStatus(state);
  if (auto && !st.available) return;
  const body = document.createElement('div');
  body.className = 'daily';
  const cal = DAILY.map((d, i) => {
    const day = i + 1;
    const cls = day < st.day || (!st.available && day === st.day) ? 'got' : day === st.day ? 'today' : '';
    return `<div class="daily-day ${cls}"><small>Day ${day}</small>${COIN}<b>${d.coins}</b>${d.item ? `<em>+ ${ITEMS[d.item].name}</em>` : ''}</div>`;
  }).join('');
  body.innerHTML = `<p>${st.available ? 'Come back every day for bigger gifts!' : 'You already opened today\'s gift. See you tomorrow, darling!'}</p><div class="daily-grid">${cal}</div>`;
  const choice = await modal({
    title: 'Daily Gift',
    body,
    buttons: st.available ? [{ label: `Claim day ${st.day} gift`, value: 'claim', cls: 'btn-primary' }, { label: 'Later', value: 'later', cls: 'btn-ghost' }]
      : [{ label: 'OK', value: 'ok', cls: 'btn-ghost' }],
  });
  if (choice === 'claim') {
    const got = claimDaily(state);
    save(state);
    updateCoinsUI();
    sfx('win');
    say(pick(['yay', 'hehe']));
    toast(`+${got.reward.coins} coins${got.reward.item ? ` and a ${ITEMS[got.reward.item].name}` : ''}!`);
  }
}
$('#btn-daily').addEventListener('click', () => openDaily(false));

setInterval(() => {
  updateLivesUI();
  if (currentScreen === 'game' && !document.hidden) trackPlayTime();
  if (currentScreen !== 'home' && !document.hidden && $('#mock-ad').hidden) adClock++;
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
      ...(state.coins >= LIVES_REFILL_PRICE ? [{ label: `Refill all lives · ${COIN}${LIVES_REFILL_PRICE}`, value: 'buy', cls: 'btn-primary' }] : []),
      { label: "I'll wait", value: 'wait', cls: 'btn-ghost' },
    ],
  });
  clearInterval(iv);
  if (choice === 'buy' && spend(state, LIVES_REFILL_PRICE)) {
    addLife(state.lives, Date.now(), MAX_LIVES);
    save(state);
    updateLivesUI();
    updateCoinsUI();
    return true;
  }
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
updateCoinsUI();

const SETTINGS = [
  ['music', 'Music', (v) => setMusicEnabled(v)],
  ['sound', 'Sound effects', (v) => setSoundEnabled(v)],
  ['voice', "Princess's voice", (v) => setVoiceEnabled(v)],
  ['haptics', 'Vibration', () => {}],
  ['notify', 'Reminders from the princess', (v) => { if (v) askPermission(); scheduleAll(state); }],
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
  const invite = document.createElement('div');
  invite.className = 'invite-box';
  invite.innerHTML = `<small>Your invite code</small><b class="invite-code">${state.playerId}</b>`;
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn btn-secondary';
  shareBtn.innerHTML = `💌 Invite friends <small>(+${SHARE_REWARD} ${COIN} a day)</small>`;
  shareBtn.addEventListener('click', () => shareInvite());
  const codeBtn = document.createElement('button');
  codeBtn.className = 'btn btn-ghost';
  codeBtn.textContent = state.inviteRedeemed ? `Invite code used: ${state.inviteRedeemed}` : `Enter a friend's code (+${INVITE_REWARD} coins)`;
  codeBtn.disabled = !!state.inviteRedeemed;
  codeBtn.addEventListener('click', () => { $('#modal').hidden = true; enterInviteCode(); });
  invite.append(shareBtn, codeBtn);
  body.append(invite);
  const test = document.createElement('button');
  test.className = 'btn btn-ghost test-voice';
  test.textContent = '▶ Test her voice';
  test.addEventListener('click', () => say(pick(['hi', 'tickles', 'amazing'])));
  body.append(test);
  modal({ title: 'Settings', body, buttons: [{ label: 'Done', value: 'ok', cls: 'btn-primary' }] });
});

// ---------- Invites ----------
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.gokyuzuprensesi.oyun';
const SharePlugin = Capacitor.isNativePlatform() ? registerPlugin('Share') : null;
async function shareInvite() {
  const text = `Come play The Sky Princess with me! 👑 Enter my invite code ${state.playerId} in Settings and get ${INVITE_REWARD} free coins.`;
  let shared = false;
  try {
    if (SharePlugin) { await SharePlugin.share({ title: 'The Sky Princess', text, url: PLAY_URL, dialogTitle: 'Invite a friend' }); shared = true; }
    else if (navigator.share) { await navigator.share({ title: 'The Sky Princess', text, url: PLAY_URL }); shared = true; }
    else { await navigator.clipboard.writeText(`${text} ${PLAY_URL}`); toast('Invite copied! Paste it to a friend.'); shared = true; }
  } catch { /* cancelled */ }
  if (shared && grantShareReward(state)) { save(state); updateCoinsUI(); toast(`+${SHARE_REWARD} coins for sharing! 💌`); }
}
async function enterInviteCode() {
  const body = document.createElement('div');
  body.innerHTML = `<p>Enter your friend's 6-letter code to get <b>${INVITE_REWARD}</b> ${COIN}</p><input id="invite-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" class="invite-input">`;
  const choice = await modal({ title: 'Invite code', body, buttons: [{ label: 'Redeem', value: 'ok', cls: 'btn-primary' }, { label: 'Cancel', value: 'no', cls: 'btn-ghost' }] });
  if (choice !== 'ok') return;
  const res = redeemInvite(state, $('#invite-input').value);
  const msg = { ok: `Welcome! +${INVITE_REWARD} coins 💖`, own: "That's your own code, darling!", invalid: 'That code does not look right.', already: 'You already used an invite code.' }[res];
  if (res === 'ok') { save(state); updateCoinsUI(); sfx('win'); say('yay'); }
  toast(msg);
}

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
  const height = total * NODE_GAP + 330;
  path.style.height = `${height}px`;
  const pos = (n) => ({
    x: w / 2 + Math.sin(n * 0.85) * w * 0.3,
    y: height - 140 - (n - 1) * NODE_GAP,
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
  mapParallax();
}

// Depth: the castle backdrop drifts slowly as the map scrolls (climbing reveals the tower top).
function mapParallax() {
  const sc = $('#map-scroll');
  const max = sc.scrollHeight - sc.clientHeight || 1;
  const k = sc.scrollTop / max; // 0 = top (castle), 1 = bottom (level 1)
  document.documentElement.style.setProperty('--par', `${(k - 0.5) * -7}%`);
}
$('#map-scroll').addEventListener('scroll', mapParallax, { passive: true });

// Warm lights twinkling in the castle windows of the map backdrop
(function windowLights() {
  const wrap = $('#map-windows');
  const spots = [[44, 33], [52, 30], [61, 36], [47, 48], [58, 45], [30, 60], [70, 58], [38, 64], [64, 66], [50, 62], [22, 66], [80, 64], [56, 72], [44, 74]];
  for (const [x, y] of spots) {
    const i = document.createElement('i');
    i.style.left = `${x}%`;
    i.style.top = `${y}%`;
    i.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
    i.style.animationDuration = `${(2.5 + Math.random() * 3).toFixed(2)}s`;
    wrap.append(i);
  }
}());

// ---------- Chapter story ----------
const storyPrincess = new Princess($('#princess-story'), { onTap: tapLine });
async function showStory(story) {
  const el = $('#story');
  $('#story-chapter').textContent = `Chapter ${story.chapter} complete`;
  const textEl = $('#story-text');
  textEl.textContent = '';
  $('#story-reward').innerHTML = `+${CHAPTER_REWARD} ${COIN}`;
  $('#story-reward').classList.remove('show');
  el.hidden = false;
  storyMode = true;
  storyPrincess.react('cheer');
  setTimeout(() => say(story.voice), 500);
  // Type the words in as she speaks
  const words = story.text.split(' ');
  for (let i = 0; i < words.length; i++) {
    textEl.textContent += (i ? ' ' : '') + words[i];
    await new Promise((r) => setTimeout(r, 190));
  }
  state.coins += CHAPTER_REWARD;
  save(state);
  updateCoinsUI();
  $('#story-reward').classList.add('show');
  sfx('win');
  await new Promise((r) => { $('#story-next').onclick = r; });
  el.hidden = true;
  storyMode = false;
}
let storyMode = false;

// ---------- Star Festival ----------
function fmtLeft(ms) {
  const h = Math.max(0, Math.floor(ms / 3600000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
function updateFestivalUI() {
  const f = festivalState(state);
  const banner = $('#festival-banner');
  banner.hidden = false;
  banner.classList.toggle('live', f.active);
  const goal = FESTIVAL_MILESTONES[FESTIVAL_MILESTONES.length - 1].shards;
  if (f.active) {
    $('#fest-title').textContent = 'Star Festival · 2× coins';
    $('#fest-sub').textContent = `${f.shards}/${goal} star shards · ends in ${fmtLeft(f.endsAt - Date.now())}`;
  } else {
    $('#fest-title').textContent = 'Star Festival';
    $('#fest-sub').textContent = `Starts in ${fmtLeft(f.startsAt - Date.now())} · every weekend`;
  }
  $('#fest-fill').style.width = `${Math.min(100, (f.shards / goal) * 100)}%`;
  // Announce the festival once per weekend
  if (f.active && state.festivalAnnounced !== f.key) {
    state.festivalAnnounced = f.key;
    save(state);
    setTimeout(() => { say('festival'); toast("✦ The Star Festival is live! Double coins all weekend."); }, 1200);
  }
  const claimable = FESTIVAL_MILESTONES.some((m, i) => f.shards >= m.shards && !f.claimed.includes(i));
  banner.classList.toggle('claim', claimable);
}
$('#festival-banner').addEventListener('click', async () => {
  const f = festivalState(state);
  const body = document.createElement('div');
  body.className = 'festival';
  const render = () => {
    const st = festivalState(state);
    body.innerHTML = `<p>${st.active ? 'Every star you earn this weekend becomes a <b>star shard</b>, and all level coins are doubled!' : 'Every weekend the kingdom celebrates. Earn star shards for royal prizes and double coins!'}</p>`;
    FESTIVAL_MILESTONES.forEach((m, i) => {
      const row = document.createElement('div');
      const done = st.claimed.includes(i);
      const ready = st.shards >= m.shards && !done;
      row.className = `fest-row${done ? ' done' : ''}${ready ? ' ready' : ''}`;
      row.innerHTML = `<span class="shard">✦</span><b>${m.shards}</b><span class="fest-prize">${m.coins} ${COIN}${m.item ? ` + ${ITEMS[m.item].name}` : ''}</span>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = done ? '✓' : 'Claim';
      btn.disabled = !ready;
      btn.addEventListener('click', () => { if (claimFestival(state, i)) { save(state); updateCoinsUI(); sfx('win'); render(); } });
      row.append(btn);
      body.append(row);
    });
  };
  render();
  await modal({ title: f.active ? 'Star Festival' : 'Star Festival', body, buttons: [{ label: 'Close', value: 'ok', cls: 'btn-ghost' }] });
  updateFestivalUI();
});

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
  const bonus = streakBonus(state.streak);
  if (bonus) {
    const sb = document.createElement('p');
    sb.className = 'streak-info';
    sb.innerHTML = `🔥 <b>Win streak ×${state.streak}</b><br><small>+${bonus.moves} moves${bonus.specials.length ? ` and ${bonus.specials.length} free special jewel${bonus.specials.length > 1 ? 's' : ''}` : ''}</small>`;
    intro.append(sb);
  }
  // Booster picker: tap to take one into the level, or buy one on the spot
  const chosen = new Set();
  const picker = document.createElement('div');
  picker.className = 'booster-pick';
  const renderPicker = () => {
    picker.innerHTML = '<small>Boosters</small>';
    const row = document.createElement('div');
    row.className = 'booster-row';
    for (const id of ['lance', 'bomb', 'orb']) {
      const owned = state.items[id] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `booster-opt${chosen.has(id) ? ' on' : ''}${owned ? '' : ' empty'}`;
      b.setAttribute('aria-label', `${ITEMS[id].name}, ${owned} owned`);
      b.append(itemIcon(id, 46));
      b.insertAdjacentHTML('beforeend', owned ? `<b class="count">${owned}</b>` : `<b class="price">${COIN}${ITEMS[id].price}</b>`);
      b.addEventListener('click', () => {
        if (!owned) {
          if (buyItem(state, id)) { save(state); updateCoinsUI(); sfx('star'); chosen.add(id); } else toast('Not enough coins. Visit the shop!');
        } else if (chosen.has(id)) chosen.delete(id);
        else chosen.add(id);
        renderPicker();
      });
      row.append(b);
    }
    picker.append(row);
  };
  renderPicker();
  intro.append(picker);
  const choice = await modal({
    title: `Level ${n}`,
    body: intro,
    buttons: [{ label: 'Start ✨', value: 'go', cls: 'btn-primary' }, { label: 'Back', value: 'back', cls: 'btn-ghost' }],
  });
  if (choice !== 'go') return false;
  await adBreak();

  currentLevel = n;
  continuesUsed = 0;
  engine = new Engine(level);
  show('game');
  renderer.setEngine(engine);
  // Place the chosen boosters on the board
  const specials = [];
  for (const id of chosen) if (useItem(state, id)) specials.push(...ITEMS[id].specials);
  if (bonus) {
    engine.addMoves(bonus.moves);
    specials.push(...bonus.specials);
  }
  save(state);
  updateCoinsUI();
  if (specials.length) {
    setTimeout(() => {
      for (const p of engine.placeSpecials(specials)) renderer.burst(p.r, p.c, p.tile.special === SP.RAINBOW ? -1 : p.tile.color, 22, 1.4);
      sfx('special');
    }, 650);
  }
  setWandMode(false);
  buildGoalsUI();
  updateHUD();
  hideSpeech();
  if (bonus && state.streak >= 2) setTimeout(() => cheer('streak', "You're on fire! Let's keep our streak going!", 2400, 'hop'), 700);
  else setTimeout(() => cheer('lets-shine', "Let's shine together, darling!", 1900, 'hop'), 700);
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

// ---------- Royal Wand ----------
function setWandMode(on) {
  renderer.wandMode = on;
  if (on) {
    clearTimeout(speechTimer);
    $('#speech-text').textContent = 'Tap a jewel to smash it ✨';
    $('#speech').hidden = false;
  } else if ($('#speech-text').textContent.startsWith('Tap a jewel')) hideSpeech();
  $('#btn-wand').classList.toggle('active', on);
  $('.board-frame').classList.toggle('wand-on', on);
}
$('#btn-wand').addEventListener('click', async () => {
  if (!engine || renderer.busy || engine.finished) return;
  if (renderer.wandMode) { setWandMode(false); return; }
  if (!state.items.wand) {
    const choice = await modal({
      title: 'Royal Wand',
      body: `<p>${ITEMS.wand.desc}</p>`,
      buttons: [
        { label: `Buy one · ${COIN}${ITEMS.wand.price}`, value: 'buy', cls: 'btn-primary' },
        { label: 'Not now', value: 'no', cls: 'btn-ghost' },
      ],
    });
    if (choice !== 'buy') return;
    if (!buyItem(state, 'wand')) { toast('Not enough coins. Visit the shop!'); return; }
    save(state);
    updateCoinsUI();
  }
  setWandMode(true);
  say('psst');
});
async function handleWand(cell) {
  if (!engine || renderer.busy || !useItem(state, 'wand')) return;
  setWandMode(false);
  save(state);
  updateCoinsUI();
  const result = engine.useWand(cell.r, cell.c);
  if (!result.valid) return;
  renderer.busy = true;
  renderer.wandStrike(cell.r, cell.c);
  sfx('bomb');
  haptic(30);
  await renderer.wait(250);
  await renderer.playSteps(result.steps, (step) => { if (step.type === 'clear') updateHUD(step.score); });
  updateHUD();
  renderer.busy = false;
  cheer('my-hero', 'My hero! Hehe!', 1800, 'kiss');
  if (engine.finished) await endOfMoves();
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
        ...(state.coins >= EXTRA_MOVES_PRICE ? [{ label: `+${EXTRA_MOVES} moves · ${COIN}${EXTRA_MOVES_PRICE}`, value: 'buy', cls: 'btn-primary' }] : []),
        { label: 'Give up', value: 'quit', cls: 'btn-ghost' },
      ],
    });
    if (choice === 'buy' && spend(state, EXTRA_MOVES_PRICE)) {
      save(state);
      updateCoinsUI();
      continuesUsed++;
      engine.addMoves(EXTRA_MOVES);
      updateHUD();
      renderer.bigText(`+${EXTRA_MOVES} Moves!`);
      sfx('special');
      cheer('keep-going', "Let's keep going, together!", 1800, 'hop');
      return;
    }
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
  state.streak = 0;
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
  await adBreak();
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
  const firstClear = !state.stars[n];
  const fest = festivalState(state);
  const reward = levelReward(stars, firstClear) * (fest.active ? FESTIVAL_COIN_MULTIPLIER : 1);
  const shards = addShards(state, stars);
  state.coins += reward;
  state.streak = (state.streak || 0) + 1;
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
    body: `<img class="modal-portrait breathe" src="img/prenses-yuz.jpg" alt=""><div class="big-stars">${starsHtml}</div><p>Score: <b>${engine.score.toLocaleString('en-US')}</b>${bonus ? `<br><small>Moves-left bonus: +${bonus.toLocaleString('en-US')}</small>` : ''}</p><div class="reward">+${reward} ${COIN}${fest.active ? ' <small>×2 festival</small>' : ''}</div>${shards ? `<div class="reward shards">+${shards} <span class="shard">✦</span></div>` : ''}<p class="small">🔥 Win streak ×${state.streak}</p>`,
    buttons: [
      ...(n < LEVEL_COUNT ? [{ label: 'Next level ➜', value: 'next', cls: 'btn-primary' }] : []),
      { label: 'Kingdom Map', value: 'map', cls: 'btn-ghost' },
    ],
  });

  // Ask for notification permission at a happy moment: right after the first win
  if (n === 1 && firstClear) askPermission();
  // Chapter finished for the first time: the princess tells the story
  const story = firstClear ? chapterStory(n) : null;
  if (story) await showStory(story);
  // Interstitial every 90 seconds of play (or every 5 levels), at this natural break
  await adBreak();
  if (choice !== 'next' || !(await startLevel(n + 1))) show('map');
}

$('#btn-quit').addEventListener('click', async () => {
  if (renderer.busy) return;
  if (!engine || engine.movesUsed === 0) { show('map'); return; }
  const choice = await modal({
    title: 'Leave this level?',
    body: `<p>If you leave now, you lose <b>1 life</b>${state.streak ? ` and your 🔥 win streak ×${state.streak}` : ''}.</p>`,
    buttons: [
      { label: 'Keep playing', value: 'stay', cls: 'btn-primary' },
      { label: 'Leave (−1 life)', value: 'quit', cls: 'btn-ghost' },
    ],
  });
  if (choice === 'quit') {
    state.streak = 0;
    loseLife(state.lives, Date.now());
    save(state);
    engine = null;
    show('map');
    await adBreak();
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

document.addEventListener('visibilitychange', () => { if (document.hidden) { save(state); scheduleAll(state); } });

show('home');
initAds();
initStore();
ownsNoAds().then((v) => { if (v && !state.noAds) { state.noAds = true; save(state); } });
// Greet the player on the first tap (browsers only allow sound after a tap)
setGreeting(() => (currentScreen === 'home' ? (state.maxLevel > 1 ? 'welcome' : 'hi') : null));

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
window.__game = { state, get engine() { return engine; }, renderer, startLevel, get adClock() { return adClock; }, set adClock(v) { adClock = v; } };
