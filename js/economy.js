// Game economy: gold coins, shop items (boosters) and daily rewards.
// Pure logic on the saved state object; the UI lives in main.js.
import { SP } from './board.js';

export const ITEMS = {
  lance: { name: 'Comet Lance', desc: 'Start a level with 2 line-clearing jewels.', price: 150, when: 'start', specials: [SP.ROW, SP.COL] },
  bomb: { name: 'Star Bomb', desc: 'Start a level with a star bomb.', price: 250, when: 'start', specials: [SP.BOMB] },
  orb: { name: 'Celestial Orb', desc: 'Start a level with an orb that clears a whole color.', price: 400, when: 'start', specials: [SP.RAINBOW] },
  wand: { name: 'Royal Wand', desc: 'During a level, smash any jewel without using a move.', price: 200, when: 'play' },
};
export const ITEM_ORDER = ['lance', 'bomb', 'orb', 'wand'];

export const LIVES_REFILL_PRICE = 300;
export const EXTRA_MOVES_PRICE = 250;
export const EXTRA_MOVES = 5;
export const AD_COINS = 40;
export const AD_COINS_PER_DAY = 5;

// 7-day login calendar; day 7 also gives a Celestial Orb.
export const DAILY = [
  { coins: 50 }, { coins: 75 }, { coins: 100, item: 'lance' }, { coins: 125 },
  { coins: 150, item: 'wand' }, { coins: 200 }, { coins: 300, item: 'orb' },
];

export function initEconomy(state) {
  if (typeof state.coins !== 'number') state.coins = 200; // welcome gift
  state.items = { lance: 1, bomb: 1, orb: 0, wand: 1, ...(state.items || {}) };
  state.daily = { last: null, streak: 0, ...(state.daily || {}) };
  state.adCoins = { date: null, count: 0, ...(state.adCoins || {}) };
  return state;
}

export function canAfford(state, price) { return state.coins >= price; }

export function spend(state, price) {
  if (state.coins < price) return false;
  state.coins -= price;
  return true;
}

export function buyItem(state, id, qty = 1) {
  const item = ITEMS[id];
  if (!item || !spend(state, item.price * qty)) return false;
  state.items[id] = (state.items[id] || 0) + qty;
  return true;
}

export function useItem(state, id) {
  if (!state.items[id]) return false;
  state.items[id]--;
  return true;
}

// Coins for finishing a level: more for the first clear and for more stars.
export function levelReward(stars, firstClear) {
  return firstClear ? 30 + stars * 20 : 10 + stars * 5;
}

const dayStr = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function dailyStatus(state, now = new Date()) {
  const today = dayStr(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const claimed = state.daily.last === today;
  const continues = state.daily.last === dayStr(y);
  const day = claimed ? state.daily.streak : (continues ? state.daily.streak % 7 : 0) + 1;
  return { available: !claimed, day, reward: DAILY[(day - 1) % 7] };
}

export function claimDaily(state, now = new Date()) {
  const st = dailyStatus(state, now);
  if (!st.available) return null;
  state.daily = { last: dayStr(now), streak: st.day };
  state.coins += st.reward.coins;
  if (st.reward.item) state.items[st.reward.item] = (state.items[st.reward.item] || 0) + 1;
  return st;
}

export function adCoinsLeft(state, now = new Date()) {
  const today = dayStr(now);
  if (state.adCoins.date !== today) return AD_COINS_PER_DAY;
  return Math.max(0, AD_COINS_PER_DAY - state.adCoins.count);
}

export function grantAdCoins(state, now = new Date()) {
  const today = dayStr(now);
  if (state.adCoins.date !== today) state.adCoins = { date: today, count: 0 };
  if (state.adCoins.count >= AD_COINS_PER_DAY) return false;
  state.adCoins.count++;
  state.coins += AD_COINS;
  return true;
}

// ---------- Invites ----------
// Without a server we cannot verify that a friend installed the game, so:
// the new player gets INVITE_REWARD for entering a friend's code (once),
// and the sharer gets SHARE_REWARD once a day for sharing their code.
export const INVITE_REWARD = 500;
export const SHARE_REWARD = 50;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function ensurePlayerId(state, rng = Math.random) {
  if (!state.playerId) state.playerId = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)]).join('');
  return state.playerId;
}

export function redeemInvite(state, raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (state.inviteRedeemed) return 'already';
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return 'invalid';
  if (code === state.playerId) return 'own';
  state.inviteRedeemed = code;
  state.coins += INVITE_REWARD;
  return 'ok';
}

export function grantShareReward(state, now = new Date()) {
  const today = dayStr(now);
  if (state.shareRewardDay === today) return false;
  state.shareRewardDay = today;
  state.coins += SHARE_REWARD;
  return true;
}
