// Daily quests (3 per day, same for everyone on a given date) and lifetime achievements.
// Everything is driven by track(state, event, amount): the game reports what happened,
// this module updates daily progress and lifetime stats.
import { mulberry32, SP } from './board.js';

export const QUEST_POOL = [
  { id: 'win', ev: 'win', n: 3, coins: 60 },
  { id: 'stars', ev: 'stars', n: 6, coins: 60 },
  { id: 'clear', ev: 'clear', n: 200, coins: 50 },
  { id: 'special', ev: 'special', n: 8, coins: 60 },
  { id: 'bomb', ev: 'bomb', n: 3, coins: 70 },
  { id: 'orb', ev: 'orb', n: 1, coins: 80 },
  { id: 'ice', ev: 'ice', n: 20, coins: 60 },
  { id: 'booster', ev: 'booster', n: 2, coins: 50 },
  { id: 'combo', ev: 'combo', n: 5, coins: 60 },
  { id: 'three', ev: 'three', n: 1, coins: 70 },
];
export const QUESTS_PER_DAY = 3;
export const ALL_DONE_BONUS = 150;

export const ACHIEVEMENTS = [
  { id: 'winner', stat: 'win', tiers: [10, 50, 150], coins: [100, 300, 800] },
  { id: 'jeweler', stat: 'clear', tiers: [1000, 10000, 50000], coins: [100, 300, 800] },
  { id: 'artisan', stat: 'special', tiers: [50, 300, 1000], coins: [100, 300, 800] },
  { id: 'bomber', stat: 'bomb', tiers: [20, 100, 400], coins: [100, 300, 800] },
  { id: 'starlight', stat: 'orb', tiers: [5, 30, 100], coins: [120, 350, 900] },
  { id: 'iceQueen', stat: 'ice', tiers: [100, 500, 2000], coins: [100, 300, 800] },
  { id: 'perfect', stat: 'three', tiers: [10, 50, 150], coins: [120, 350, 900] },
  { id: 'combo', stat: 'combo', tiers: [20, 100, 400], coins: [100, 300, 800] },
  { id: 'devoted', stat: 'bestStreak', tiers: [3, 7, 15], coins: [100, 300, 800] },
];

const dayStr = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const daySeed = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function questsFor(date) {
  const rng = mulberry32(daySeed(dayStr(date)));
  const pool = [...QUEST_POOL];
  const out = [];
  while (out.length < QUESTS_PER_DAY) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  return out;
}

export function ensureQuests(state, now = new Date()) {
  const day = dayStr(now);
  if (!state.quests || state.quests.day !== day) {
    state.quests = { day, ids: questsFor(now), prog: {}, claimed: [], bonus: false };
  }
  state.stats ||= {};
  state.ach ||= {};
  return state.quests;
}

export function track(state, ev, amount = 1, now = new Date()) {
  if (!amount) return;
  const q = ensureQuests(state, now);
  if (ev === 'streak') { state.stats.bestStreak = Math.max(state.stats.bestStreak || 0, amount); return; }
  state.stats[ev] = (state.stats[ev] || 0) + amount;
  for (const id of q.ids) {
    const def = QUEST_POOL.find((d) => d.id === id);
    if (def.ev === ev) q.prog[id] = Math.min(def.n, (q.prog[id] || 0) + amount);
  }
}

// Game counters derived from the engine's animation steps.
export function trackSteps(state, steps) {
  let clear = 0; let special = 0; let bomb = 0; let orb = 0; let ice = 0; let best = 0;
  for (const s of steps) {
    if (s.type !== 'clear') continue;
    clear += s.cleared.length;
    ice += s.iceBroken.length;
    best = Math.max(best, s.cascade);
    for (const c of s.created) {
      special++;
      if (c.tile.special === SP.BOMB) bomb++;
      if (c.tile.special === SP.RAINBOW) orb++;
    }
  }
  track(state, 'clear', clear);
  track(state, 'special', special);
  track(state, 'bomb', bomb);
  track(state, 'orb', orb);
  track(state, 'ice', ice);
  if (best >= 3) track(state, 'combo', 1);
}

export function questList(state, now = new Date()) {
  const q = ensureQuests(state, now);
  return q.ids.map((id) => {
    const def = QUEST_POOL.find((d) => d.id === id);
    const prog = q.prog[id] || 0;
    return { ...def, prog, done: prog >= def.n, claimed: q.claimed.includes(id) };
  });
}

export function claimQuest(state, id, now = new Date()) {
  const quest = questList(state, now).find((x) => x.id === id);
  if (!quest || !quest.done || quest.claimed) return 0;
  state.quests.claimed.push(id);
  state.coins += quest.coins;
  return quest.coins;
}

export function bonusReady(state, now = new Date()) {
  const q = ensureQuests(state, now);
  return !q.bonus && q.claimed.length >= q.ids.length;
}

export function claimBonus(state, now = new Date()) {
  if (!bonusReady(state, now)) return 0;
  state.quests.bonus = true;
  state.coins += ALL_DONE_BONUS;
  return ALL_DONE_BONUS;
}

export function achievementList(state) {
  ensureQuests(state);
  return ACHIEVEMENTS.map((a) => {
    const tier = state.ach[a.id] || 0; // tiers already claimed
    const value = state.stats[a.stat] || 0;
    const maxed = tier >= a.tiers.length;
    const target = a.tiers[Math.min(tier, a.tiers.length - 1)];
    return { ...a, tier, value, target, maxed, coinsNext: maxed ? 0 : a.coins[tier], ready: !maxed && value >= target };
  });
}

export function claimAchievement(state, id) {
  const a = achievementList(state).find((x) => x.id === id);
  if (!a || !a.ready) return 0;
  state.ach[id] = a.tier + 1;
  state.coins += a.coinsNext;
  return a.coinsNext;
}

// Number of rewards waiting (for the red dot on the map).
export function rewardsWaiting(state, now = new Date()) {
  const quests = questList(state, now).filter((x) => x.done && !x.claimed).length;
  const ach = achievementList(state).filter((x) => x.ready).length;
  return quests + ach + (bonusReady(state, now) ? 1 : 0);
}
