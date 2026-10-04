import { Engine } from './engine.js';
import { getLevel, LEVEL_COUNT } from './levels.js';
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
import {
  track, trackSteps, questList, claimQuest, bonusReady, claimBonus, achievementList, claimAchievement,
  rewardsWaiting, ensureQuests, ALL_DONE_BONUS,
} from './quests.js';
import { load, save } from './storage.js';
import { MAX_LIVES, refresh, loseLife, addLife, msToNext, formatMs } from './lives.js';
import { Capacitor, registerPlugin } from '../vendor/capacitor-core.js';
import { initAds, showInterstitial, showRewarded, AD_CONFIG } from './ads.js';
import { play as sfx, setSoundEnabled } from './audio.js';
import { say, giggle, setTrack, holdMusic, setVoiceEnabled, setMusicEnabled, setGreeting, setMouthListener } from './voice.js';
import { Princess } from './princess.js';
import { askPermission, scheduleAll } from './notifications.js';
import { COIN_PACKS, NO_ADS, initStore, priceOf, buy, ownsNoAds, restore, isTestStore } from './purchases.js';
import { t, fmt, setLang, getLang, detectLang, applyStatic, LANG_NAMES } from './i18n.js';

// How many times per attempt the player can watch an ad for +3 moves.
const MAX_CONTINUES = 2;
const CONTINUE_MOVES = 3;
// A gentle break reminder appears after this much continuous play.
const BREAK_REMINDER_SECONDS = 30 * 60;

const $ = (s) => document.querySelector(s);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const state = initEconomy(load());
ensurePlayerId(state);
setLang(state.lang || detectLang());
applyStatic();
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
    cheer('psst', t('psst'), 2200, 'lean');
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
    el.querySelector('.lives-timer').textContent = state.lives.lives >= MAX_LIVES ? t('full') : formatMs(ms);
  });
}
// ---------- Coins & items ----------
const COIN = '<span class="coin"></span>';
function updateCoinsUI() {
  $('#coin-count').textContent = fmt(state.coins);
  $('#wand-count').textContent = state.items.wand || '+';
  $('#btn-wand').classList.toggle('empty', !state.items.wand);
  $('#daily-dot').hidden = !dailyStatus(state).available;
  $('#quests-dot').hidden = !rewardsWaiting(state);
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
    body.innerHTML = `<div class="shop-balance">${COIN}<b>${fmt(state.coins)}</b></div>`;
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    for (const id of ITEM_ORDER) {
      const it = ITEMS[id];
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.append(itemIcon(id, 58));
      card.insertAdjacentHTML('beforeend', `<h4>${t(`item_${id}`)}</h4><p>${t(`item_${id}_d`)}</p><small>${t('owned', { n: `<b>${state.items[id] || 0}</b>` })}</small>`);
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
    refill.innerHTML = full ? t('livesFull') : t('refillLives', { price: `${COIN}${LIVES_REFILL_PRICE}` });
    refill.disabled = full || state.coins < LIVES_REFILL_PRICE;
    refill.addEventListener('click', () => {
      if (spend(state, LIVES_REFILL_PRICE)) { addLife(state.lives, Date.now(), MAX_LIVES); save(state); updateLivesUI(); updateCoinsUI(); sfx('win'); render(); }
    });
    const left = adCoinsLeft(state);
    const ad = document.createElement('button');
    ad.className = 'btn btn-ad';
    ad.innerHTML = left ? t('watchAdCoins', { n: AD_COINS, coin: COIN, left }) : t('adTomorrow');
    ad.disabled = !left;
    ad.addEventListener('click', async () => {
      if (await withAd(showRewarded)) { grantAdCoins(state); save(state); updateCoinsUI(); sfx('star'); render(); } else toast(t('adNow'));
    });
    extra.append(refill, ad);
    body.append(extra);

    // Real-money section
    const testBuy = () => { toast(t('testMode')); return true; };
    const gold = document.createElement('div');
    gold.className = 'shop-section';
    gold.innerHTML = `<h3>${t('chests')}</h3>${isTestStore ? `<p class="small">${t('webDemo')}</p>` : ''}`;
    const packs = document.createElement('div');
    packs.className = 'pack-grid';
    COIN_PACKS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = `pack${p.tag === 'Best value' ? ' best' : ''}`;
      b.innerHTML = `${p.tag ? `<em>${p.tag === 'Best value' ? t('bestValue') : p.tag}</em>` : ''}<span class="pack-chest size${i}"></span><b>${COIN}${fmt(p.coins)}</b><span class="pack-price">${priceOf(p)}</span>`;
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
    noAds.innerHTML = state.noAds ? t('noAdsOwned') : `${t('removeAds', { price: priceOf(NO_ADS) })}<small>${t('rewardedOptional')}</small>`;
    noAds.disabled = !!state.noAds;
    noAds.addEventListener('click', async () => {
      if (await buy(NO_ADS.id, { consumable: false }, testBuy)) { state.noAds = true; save(state); sfx('win'); say('my-hero'); render(); }
    });
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'link-btn';
    restoreBtn.textContent = t('restore');
    restoreBtn.addEventListener('click', async () => {
      if (await restore()) { state.noAds = true; save(state); toast(t('restored')); render(); } else toast(t('nothingRestore'));
    });
    gold.append(noAds, restoreBtn);
    body.append(gold);
  };
  render();
  await modal({ title: t('shopTitle'), body, buttons: [{ label: t('close'), value: 'ok', cls: 'btn-ghost' }] });
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
    return `<div class="daily-day ${cls}"><small>${t('day', { n: day })}</small>${COIN}<b>${d.coins}</b>${d.item ? `<em>+ ${t(`item_${d.item}`)}</em>` : ''}</div>`;
  }).join('');
  body.innerHTML = `<p>${st.available ? t('dailyComeBack') : t('dailyAlready')}</p><div class="daily-grid">${cal}</div>`;
  const choice = await modal({
    title: t('dailyTitle'),
    body,
    buttons: st.available ? [{ label: t('claimDay', { n: st.day }), value: 'claim', cls: 'btn-primary' }, { label: t('later'), value: 'later', cls: 'btn-ghost' }]
      : [{ label: t('ok'), value: 'ok', cls: 'btn-ghost' }],
  });
  if (choice === 'claim') {
    const got = claimDaily(state);
    save(state);
    updateCoinsUI();
    sfx('win');
    say(pick(['yay', 'hehe']));
    toast(got.reward.item ? t('dailyGotItem', { n: got.reward.coins, item: t(`item_${got.reward.item}`) }) : t('dailyGot', { n: got.reward.coins }));
  }
}
$('#btn-daily').addEventListener('click', () => openDaily(false));

// ---------- Daily quests & achievements ----------
function openQuests(tab = 'quests') {
  const body = document.createElement('div');
  body.className = 'quests';
  const bar = (v, n) => `<div class="q-bar"><i style="width:${Math.min(100, (v / n) * 100)}%"></i></div>`;
  const render = () => {
    const tabs = `<div class="q-tabs"><button data-tab="quests" class="${tab === 'quests' ? 'on' : ''}">${t('questsTab')}</button><button data-tab="ach" class="${tab === 'ach' ? 'on' : ''}">${t('achTab')}</button></div>`;
    let list = '';
    if (tab === 'quests') {
      const qs = questList(state);
      list = qs.map((q) => `<div class="q-row ${q.claimed ? 'claimed' : ''}"><div class="q-info"><b>${t(`q_${q.id}`, { n: q.n })}</b>${bar(q.prog, q.n)}<small>${fmt(q.prog)} / ${fmt(q.n)}</small></div>`
        + (q.claimed ? '<span class="q-check">✓</span>' : `<button class="btn btn-primary q-claim" data-q="${q.id}" ${q.done ? '' : 'disabled'}>${COIN}${q.coins}</button>`) + '</div>').join('');
      const done = state.quests.claimed.length;
      list += `<div class="q-row q-bonus ${state.quests.bonus ? 'claimed' : ''}"><div class="q-info"><b>👑 ${t('q_bonus')}</b>${bar(done, qs.length)}<small>${done} / ${qs.length}</small></div>`
        + (state.quests.bonus ? '<span class="q-check">✓</span>' : `<button class="btn btn-primary q-claim" data-bonus="1" ${bonusReady(state) ? '' : 'disabled'}>${COIN}${ALL_DONE_BONUS}</button>`) + '</div>';
      list += `<p class="small">${t('questsReset')}</p>`;
    } else {
      list = achievementList(state).map((a) => {
        const crowns = [0, 1, 2].map((i) => `<span class="${i < a.tier ? 'on' : ''}">♛</span>`).join('');
        return `<div class="q-row ${a.maxed ? 'claimed' : ''}"><div class="q-info"><b>${t(`a_${a.id}`)} <span class="a-tier">${crowns}</span></b><small class="a-desc">${t(`ad_${a.stat}`, { n: fmt(a.target) })}</small>${bar(a.value, a.target)}<small>${fmt(Math.min(a.value, a.target))} / ${fmt(a.target)}</small></div>`
          + (a.maxed ? '<span class="q-check">✓</span>' : `<button class="btn btn-primary q-claim" data-a="${a.id}" ${a.ready ? '' : 'disabled'}>${COIN}${a.coinsNext}</button>`) + '</div>';
      }).join('');
    }
    body.innerHTML = tabs + `<div class="q-list">${list}</div>`;
  };
  body.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) { tab = tb.dataset.tab; sfx('select'); render(); return; }
    const btn = e.target.closest('.q-claim');
    if (!btn || btn.disabled) return;
    const got = btn.dataset.q ? claimQuest(state, btn.dataset.q) : btn.dataset.a ? claimAchievement(state, btn.dataset.a) : claimBonus(state);
    if (!got) return;
    save(state);
    updateCoinsUI();
    sfx('win');
    say(pick(['yay', 'hehe', 'giggle1']));
    toast(t('dailyGot', { n: got }));
    render();
  });
  render();
  return modal({ title: t('questsTitle'), body, buttons: [{ label: t('ok'), value: 'ok', cls: 'btn-ghost' }] });
}
$('#btn-quests').addEventListener('click', () => openQuests());

setInterval(() => {
  updateLivesUI();
  if (currentScreen === 'game' && !document.hidden) trackPlayTime();
  if (currentScreen !== 'home' && !document.hidden && $('#mock-ad').hidden) adClock++;
}, 1000);

async function noLivesFlow() {
  const body = document.createElement('div');
  const p = document.createElement('p');
  body.append(p);
  const tick = () => { p.innerHTML = t('nextLife', { t: formatMs(msToNext(state.lives, Date.now())) }); };
  tick();
  const iv = setInterval(tick, 1000);
  const choice = await modal({
    title: t('outOfLives'),
    body,
    buttons: [
      { label: t('adForLife'), value: 'ad', cls: 'btn-ad' },
      ...(state.coins >= LIVES_REFILL_PRICE ? [{ label: t('refillLives', { price: `${COIN}${LIVES_REFILL_PRICE}` }), value: 'buy', cls: 'btn-primary' }] : []),
      { label: t('wait'), value: 'wait', cls: 'btn-ghost' },
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
      toast(t('plusLife'));
      return true;
    }
    toast(t('adLater'));
  }
  return false;
}

// ---------- Home ----------
// ---------- Settings ----------
updateCoinsUI();

const SETTINGS = [
  ['music', (v) => setMusicEnabled(v)],
  ['sound', (v) => setSoundEnabled(v)],
  ['voice', (v) => setVoiceEnabled(v)],
  ['haptics', () => {}],
  ['notify', (v) => { if (v) askPermission(); scheduleAll(state); }],
];
$('#btn-settings').addEventListener('click', () => {
  const body = document.createElement('div');
  body.className = 'settings';
  // Language picker
  const langRow = document.createElement('label');
  langRow.className = 'toggle lang-row';
  langRow.innerHTML = `<span>${t('language')}</span><select id="set-lang">${Object.entries(LANG_NAMES).map(([c, n]) => `<option value="${c}" ${c === getLang() ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  langRow.querySelector('select').addEventListener('change', (e) => {
    state.lang = e.target.value;
    save(state);
    setLang(state.lang);
    applyStatic();
    renderMap();
    updateFestivalUI();
    updateLivesUI();
    $('#modal').hidden = true;
    $('#btn-settings').click();
  });
  body.append(langRow);
  for (const [key, apply] of SETTINGS) {
    const row = document.createElement('label');
    row.className = 'toggle';
    row.innerHTML = `<span>${t(`set_${key}`)}</span><input type="checkbox" id="set-${key}" ${state[key] !== false ? 'checked' : ''}><i></i>`;
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
  invite.innerHTML = `<small>${t('inviteCode')}</small><b class="invite-code">${state.playerId}</b>`;
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn btn-secondary';
  shareBtn.innerHTML = t('inviteFriends', { n: SHARE_REWARD, coin: COIN });
  shareBtn.addEventListener('click', () => shareInvite());
  const codeBtn = document.createElement('button');
  codeBtn.className = 'btn btn-ghost';
  codeBtn.textContent = state.inviteRedeemed ? t('codeUsed', { code: state.inviteRedeemed }) : t('enterCode', { n: INVITE_REWARD });
  codeBtn.disabled = !!state.inviteRedeemed;
  codeBtn.addEventListener('click', () => { $('#modal').hidden = true; enterInviteCode(); });
  invite.append(shareBtn, codeBtn);
  body.append(invite);
  const test = document.createElement('button');
  test.className = 'btn btn-ghost test-voice';
  test.textContent = t('testVoice');
  test.addEventListener('click', () => say(pick(['hi', 'tickles', 'amazing'])));
  body.append(test);
  modal({ title: t('settings'), body, buttons: [{ label: t('done'), value: 'ok', cls: 'btn-primary' }] });
});

// ---------- Invites ----------
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.gokyuzuprensesi.oyun';
const SharePlugin = Capacitor.isNativePlatform() ? registerPlugin('Share') : null;
async function shareInvite() {
  const text = t('shareText', { code: state.playerId, n: INVITE_REWARD });
  let shared = false;
  try {
    if (SharePlugin) { await SharePlugin.share({ title: 'The Sky Princess', text, url: PLAY_URL, dialogTitle: t('inviteDialog') }); shared = true; }
    else if (navigator.share) { await navigator.share({ title: 'The Sky Princess', text, url: PLAY_URL }); shared = true; }
    else { await navigator.clipboard.writeText(`${text} ${PLAY_URL}`); toast(t('copied')); shared = true; }
  } catch { /* cancelled */ }
  if (shared && grantShareReward(state)) { save(state); updateCoinsUI(); toast(t('shareReward', { n: SHARE_REWARD })); }
}
async function enterInviteCode() {
  const body = document.createElement('div');
  body.innerHTML = `<p>${t('enterCodeBody', { n: INVITE_REWARD, coin: COIN })}</p><input id="invite-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" class="invite-input">`;
  const choice = await modal({ title: t('inviteTitle'), body, buttons: [{ label: t('redeem'), value: 'ok', cls: 'btn-primary' }, { label: t('cancel'), value: 'no', cls: 'btn-ghost' }] });
  if (choice !== 'ok') return;
  const res = redeemInvite(state, $('#invite-input').value);
  const msg = t(`inv_${res}`, { n: INVITE_REWARD });
  if (res === 'ok') { save(state); updateCoinsUI(); sfx('win'); say('yay'); }
  toast(msg);
}

// ---------- Kingdom map ----------
// A winding golden road climbs from level 1 (bottom) to the castle (top).
const chapterName = (ch) => t(`ch${(ch % 10) + 1}`);
const NODE_GAP = 92;
function renderMap() {
  const path = $('#level-grid');
  const scroller = $('#map-scroll');
  path.innerHTML = '';
  const w = Math.min(scroller.clientWidth || 360, 520);
  const total = LEVEL_COUNT;
  const height = total * NODE_GAP + 420;
  path.style.height = `${height}px`;
  const pos = (n) => ({
    x: w / 2 + Math.sin(n * 0.85) * w * 0.3,
    y: height - 230 - (n - 1) * NODE_GAP,
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
      banner.innerHTML = `<small>${t('chapter', { n: ch + 1 })}</small>${chapterName(ch)}`;
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
    b.setAttribute('aria-label', locked ? t('locked', { n }) : t('starsAria', { n, s: st }));
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
  $('#story-chapter').textContent = t('chapterComplete', { n: story.chapter });
  const textEl = $('#story-text');
  textEl.textContent = '';
  $('#story-reward').innerHTML = `+${CHAPTER_REWARD} ${COIN}`;
  $('#story-reward').classList.remove('show');
  el.hidden = false;
  storyMode = true;
  storyPrincess.react('cheer');
  setTimeout(() => say(story.voice), 500);
  // Type the words in as she speaks
  const words = t(story.voice).split(' ');
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
  return h >= 24 ? t('dh', { d: Math.floor(h / 24), h: h % 24 }) : t('hm', { h, m: Math.floor((ms % 3600000) / 60000) });
}
function updateFestivalUI() {
  const f = festivalState(state);
  const banner = $('#festival-banner');
  banner.hidden = false;
  banner.classList.toggle('live', f.active);
  const goal = FESTIVAL_MILESTONES[FESTIVAL_MILESTONES.length - 1].shards;
  if (f.active) {
    $('#fest-title').textContent = t('festLive');
    $('#fest-sub').textContent = t('festSubLive', { s: f.shards, g: goal, t: fmtLeft(f.endsAt - Date.now()) });
  } else {
    $('#fest-title').textContent = t('festival');
    $('#fest-sub').textContent = t('festSubSoon', { t: fmtLeft(f.startsAt - Date.now()) });
  }
  $('#fest-fill').style.width = `${Math.min(100, (f.shards / goal) * 100)}%`;
  // Announce the festival once per weekend
  if (f.active && state.festivalAnnounced !== f.key) {
    state.festivalAnnounced = f.key;
    save(state);
    setTimeout(() => { say('festival'); toast(t('festToast')); }, 1200);
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
    body.innerHTML = `<p>${st.active ? t('festBodyLive') : t('festBodySoon')}</p>`;
    FESTIVAL_MILESTONES.forEach((m, i) => {
      const row = document.createElement('div');
      const done = st.claimed.includes(i);
      const ready = st.shards >= m.shards && !done;
      row.className = `fest-row${done ? ' done' : ''}${ready ? ' ready' : ''}`;
      row.innerHTML = `<span class="shard">✦</span><b>${m.shards}</b><span class="fest-prize">${m.coins} ${COIN}${m.item ? ` + ${t(`item_${m.item}`)}` : ''}</span>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = done ? '✓' : t('claim');
      btn.disabled = !ready;
      btn.addEventListener('click', () => { if (claimFestival(state, i)) { save(state); updateCoinsUI(); sfx('win'); render(); } });
      row.append(btn);
      body.append(row);
    });
  };
  render();
  await modal({ title: t('festival'), body, buttons: [{ label: t('close'), value: 'ok', cls: 'btn-ghost' }] });
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
  goal.textContent = level.kind === 'score' ? t('goal_score', { n: fmt(level.targetScore) }) : t(`goal_${level.kind}`);
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
  info.innerHTML = `${t('movesCount', { n: level.moves })}${level.hard ? `<br>⚡ <b>${t('hardLevel')}</b>` : ''}`;
  intro.append(info);
  const bonus = streakBonus(state.streak);
  if (bonus) {
    const sb = document.createElement('p');
    sb.className = 'streak-info';
    sb.innerHTML = `🔥 <b>${t('streak', { n: state.streak })}</b><br><small>${bonus.specials.length ? t('streakSpecials', { m: bonus.moves, k: bonus.specials.length }) : t('streakMoves', { m: bonus.moves })}</small>`;
    intro.append(sb);
  }
  // Booster picker: tap to take one into the level, or buy one on the spot
  const chosen = new Set();
  const picker = document.createElement('div');
  picker.className = 'booster-pick';
  const renderPicker = () => {
    picker.innerHTML = `<small>${t('boosters')}</small>`;
    const row = document.createElement('div');
    row.className = 'booster-row';
    for (const id of ['lance', 'bomb', 'orb']) {
      const owned = state.items[id] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `booster-opt${chosen.has(id) ? ' on' : ''}${owned ? '' : ' empty'}`;
      b.setAttribute('aria-label', `${t(`item_${id}`)}, ${t('owned', { n: owned })}`);
      b.append(itemIcon(id, 46));
      b.insertAdjacentHTML('beforeend', owned ? `<b class="count">${owned}</b>` : `<b class="price">${COIN}${ITEMS[id].price}</b>`);
      b.addEventListener('click', () => {
        if (!owned) {
          if (buyItem(state, id)) { save(state); updateCoinsUI(); sfx('star'); chosen.add(id); } else toast(t('notEnough'));
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
    title: `${t('level')} ${n}`,
    body: intro,
    buttons: [{ label: t('start'), value: 'go', cls: 'btn-primary' }, { label: t('back'), value: 'back', cls: 'btn-ghost' }],
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
  for (const id of chosen) if (useItem(state, id)) { specials.push(...ITEMS[id].specials); track(state, 'booster'); }
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
  if (bonus && state.streak >= 2) setTimeout(() => cheer('streak', t('streakCheer'), 2400, 'hop'), 700);
  else setTimeout(() => cheer('lets-shine', t('letsShine'), 1900, 'hop'), 700);
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
    wrap.innerHTML = `<span class="goal">${CROWN_ICON}<b>${fmt(L.targetScore)}</b></span>`;
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
  if (target < from) { scoreShown = target; el.textContent = fmt(target); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 450);
    scoreShown = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
    el.textContent = fmt(scoreShown);
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
    $('#speech-text').textContent = t('wandHint');
    $('#speech').hidden = false;
  } else if ($('#speech-text').textContent === t('wandHint')) hideSpeech();
  $('#btn-wand').classList.toggle('active', on);
  $('.board-frame').classList.toggle('wand-on', on);
}
$('#btn-wand').addEventListener('click', async () => {
  if (!engine || renderer.busy || engine.finished) return;
  if (renderer.wandMode) { setWandMode(false); return; }
  if (!state.items.wand) {
    const choice = await modal({
      title: t('item_wand'),
      body: `<p>${t('item_wand_d')}</p>`,
      buttons: [
        { label: t('buyOne', { price: `${COIN}${ITEMS.wand.price}` }), value: 'buy', cls: 'btn-primary' },
        { label: t('notNow'), value: 'no', cls: 'btn-ghost' },
      ],
    });
    if (choice !== 'buy') return;
    if (!buyItem(state, 'wand')) { toast(t('notEnough')); return; }
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
  track(state, 'booster');
  trackSteps(state, result.steps);
  updateHUD();
  renderer.busy = false;
  cheer('my-hero', t('p_myHero'), 1800, 'kiss');
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
  trackSteps(state, result.steps);
  updateHUD();
  renderer.busy = false;
  if (!engine.finished && !praiseMove(bestCascade, specials, rainbow)) stagePrincess.react('nod');
  if (engine.finished) await endOfMoves();
}

// The princess praises good moves out loud (not every move, so it stays special).
const PRAISE = {
  2: [['great', 'p_great'], ['sweet', 'p_sweet'], ['ooh-nice', 'p_oohNice'], ['yay', 'p_yay']],
  3: [['amazing', 'p_amazing'], ['wonderful', 'p_wonderful'], ['hehe', 'p_hehe']],
  4: [['fantastic', 'p_fantastic'], ['so-good', 'p_soGood'], ['wow', 'p_wow']],
  5: [['spectacular', 'p_spectacular'], ['my-hero', 'p_myHero']],
  6: [['magnificent', 'p_magnificent']],
};
function praiseMove(cascade, specials, rainbow) {
  if (rainbow) { cheer('magnificent', t('p_magnificentImp'), 2200, 'dance'); return true; }
  if (cascade >= 2) {
    const [key, text] = pick(PRAISE[Math.min(cascade, 6)]);
    cheer(key, t(text), 1800, cascade >= 4 ? 'dance' : 'cheer');
    return true;
  }
  if (specials > 0) {
    const [key, text] = pick([['wonderful', 'p_wonderful'], ['brilliant', 'p_brilliant'], ['smile', 'p_smile']]);
    cheer(key, t(text), 1800, 'kiss');
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
      title: t('outOfMoves'),
      body: `<p>${t('reachedPct', { p: pct })}${pct >= 75 ? t('soClose') : ''}</p>`,
      buttons: [
        { label: t('adMoves', { n: CONTINUE_MOVES }), value: 'ad', cls: 'btn-ad' },
        ...(state.coins >= EXTRA_MOVES_PRICE ? [{ label: t('buyMoves', { n: EXTRA_MOVES, price: `${COIN}${EXTRA_MOVES_PRICE}` }), value: 'buy', cls: 'btn-primary' }] : []),
        { label: t('giveUp'), value: 'quit', cls: 'btn-ghost' },
      ],
    });
    if (choice === 'buy' && spend(state, EXTRA_MOVES_PRICE)) {
      save(state);
      updateCoinsUI();
      continuesUsed++;
      engine.addMoves(EXTRA_MOVES);
      updateHUD();
      renderer.bigText(t('plusMoves', { n: EXTRA_MOVES }));
      sfx('special');
      cheer('keep-going', t('keepGoing'), 1800, 'hop');
      return;
    }
    if (choice === 'ad') {
      const ok = await withAd(showRewarded);
      if (ok) {
        continuesUsed++;
        engine.addMoves(CONTINUE_MOVES);
        updateHUD();
        renderer.bigText(t('plusMoves', { n: CONTINUE_MOVES }));
        sfx('special');
        cheer('keep-going', t('keepGoing'), 1800, 'hop');
        return;
      }
      toast(t('adNow'));
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
    title: t('levelFailed'),
    body: `<p>${t('lostLife', { n: lives })}</p><p class="small">${t('encourage')}</p>`,
    buttons: [
      { label: t('tryAgain'), value: 'retry', cls: 'btn-primary' },
      { label: t('kingdomMap'), value: 'map', cls: 'btn-ghost' },
    ],
  });
  await adBreak();
  if (choice !== 'retry' || !(await startLevel(currentLevel))) show('map');
}

async function winFlow() {
  renderer.busy = true;
  renderer.bigText(t('levelComplete'));
  sfx('win');
  cheer('congratulations', t('congrats'), 2400, 'dance');
  let bonus = 0;
  if (engine.movesLeft > 0) {
    await new Promise((res) => setTimeout(res, 700));
    renderer.bigText(t('finale'));
    const fin = engine.finale();
    bonus = fin.bonus;
    await renderer.playSteps(fin.steps, (step) => { if (step.type === 'clear' || step.type === 'convert') updateHUD(step.score); });
  }
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
  track(state, 'win');
  track(state, 'stars', stars);
  if (stars === 3) track(state, 'three');
  track(state, 'streak', state.streak);
  state.stars[n] = Math.max(state.stars[n] || 0, stars);
  state.best[n] = Math.max(state.best[n] || 0, engine.score);
  if (n === state.maxLevel && n < LEVEL_COUNT) state.maxLevel = n + 1;
  state.levelsSinceAd = (state.levelsSinceAd || 0) + 1;
  save(state);

  const starsHtml = [1, 2, 3].map((i) => `<span class="s ${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('');
  setTimeout(() => { for (let i = 0; i < stars; i++) setTimeout(() => sfx('star'), i * 250); }, 100);
  setTimeout(() => say(stars === 3 ? 'you-did-it' : 'well-done'), 900);
  const choice = await modal({
    title: t('levelNComplete', { n }),
    body: `<img class="modal-portrait breathe" src="img/prenses-yuz.jpg" alt=""><div class="big-stars">${starsHtml}</div><p>${t('score')}: <b>${fmt(engine.score)}</b>${bonus ? `<br><small>${t('movesBonus')}: +${fmt(bonus)}</small>` : ''}</p><div class="reward">+${reward} ${COIN}${fest.active ? ` <small>${t('festX2')}</small>` : ''}</div>${shards ? `<div class="reward shards">+${shards} <span class="shard">✦</span></div>` : ''}<p class="small">🔥 ${t('streak', { n: state.streak })}</p>`,
    buttons: [
      ...(n < LEVEL_COUNT ? [{ label: t('nextLevel'), value: 'next', cls: 'btn-primary' }] : []),
      { label: t('kingdomMap'), value: 'map', cls: 'btn-ghost' },
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
    title: t('leaveTitle'),
    body: `<p>${t('leaveBody', { extra: state.streak ? t('leaveStreak', { n: state.streak }) : '' })}</p>`,
    buttons: [
      { label: t('keepPlaying'), value: 'stay', cls: 'btn-primary' },
      { label: t('leave'), value: 'quit', cls: 'btn-ghost' },
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
      title: t('breakTitle'),
      body: `<p>${t('breakBody')}</p><p class="small">${t('breakSmall')}</p>`,
      buttons: [{ label: t('ok'), value: 'ok', cls: 'btn-primary' }],
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
