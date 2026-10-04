// Retention systems: win streak, weekend Star Festival and chapter stories.
// Pure logic on the saved state object; the UI lives in main.js.
import { SP } from './board.js';

// ---------- Win streak ----------
// Winning levels in a row gives a bonus at the start of the next level.
// Losing or leaving a level resets the streak.
export const STREAK_BONUS = [
  null,
  { moves: 2, specials: [] },
  { moves: 2, specials: [SP.ROW] },
  { moves: 3, specials: [SP.ROW, SP.BOMB] },
];
export function streakBonus(streak) {
  return STREAK_BONUS[Math.min(streak || 0, STREAK_BONUS.length - 1)];
}

// ---------- Star Festival (every weekend: Friday 00:00 to Sunday 23:59, local time) ----------
export const FESTIVAL_MILESTONES = [
  { shards: 10, coins: 150 },
  { shards: 25, coins: 100, item: 'bomb' },
  { shards: 45, coins: 300, item: 'orb' },
];
export const FESTIVAL_COIN_MULTIPLIER = 2;

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

export function festivalInfo(now = new Date()) {
  const day = now.getDay(); // 0 Sun .. 5 Fri, 6 Sat
  const today = startOfDay(now);
  const active = day === 5 || day === 6 || day === 0;
  // Friday that starts this (or the next) festival
  const back = active ? (day + 2) % 7 : 0; // Fri=0, Sat=1, Sun=2 days back
  const friday = new Date(today);
  if (active) friday.setDate(today.getDate() - back);
  else friday.setDate(today.getDate() + ((5 - day + 7) % 7));
  const endsAt = new Date(friday);
  endsAt.setDate(friday.getDate() + 3);
  const key = `${friday.getFullYear()}-${friday.getMonth() + 1}-${friday.getDate()}`;
  return { active, startsAt: friday, endsAt, key };
}

export function festivalState(state, now = new Date()) {
  const info = festivalInfo(now);
  if (!state.festival || state.festival.key !== info.key) state.festival = { key: info.key, shards: 0, claimed: [] };
  return { ...info, shards: state.festival.shards, claimed: state.festival.claimed };
}

export function addShards(state, n, now = new Date()) {
  const f = festivalState(state, now);
  if (!f.active) return 0;
  state.festival.shards += n;
  return n;
}

export function claimFestival(state, index, now = new Date()) {
  const f = festivalState(state, now);
  const m = FESTIVAL_MILESTONES[index];
  if (!m || f.shards < m.shards || f.claimed.includes(index)) return null;
  state.festival.claimed.push(index);
  state.coins += m.coins;
  if (m.item) state.items[m.item] = (state.items[m.item] || 0) + 1;
  return m;
}

// ---------- Chapter stories (shown after every 10th level) ----------
export const CHAPTER_REWARD = 200;
export const STORIES = [
  "We made it through the Starlit Gate! Hold my hand, darling. The Crystal Bridge is next.",
  "The Crystal Bridge sings when we cross it together. Can you hear it? The Moonlit Gardens are waiting.",
  "These moon roses bloom only for heroes. This one is for you, my dear. Next, the Sapphire Halls!",
  "My ancestors danced in these halls. I can feel them smiling at us. Onward to the Floating Isles!",
  "Look how small the world looks from up here! Stay close. The Tower of Dawn is near.",
  "The first light of dawn, and you are here to see it with me. The Celestial Library holds our next secret.",
  "Every book here tells a story about the stars. Ours might be my favorite. The Aurora Court is calling!",
  "The aurora is dancing just for you, darling. Only the Silver Spires stand between us and the throne.",
  "One more step. Whatever waits at the Sky Throne, I'm glad it's you beside me.",
  "We did it! The Sky Throne shines again, all thanks to you. But the stars whisper of new adventures...",
];
export function chapterStory(levelCompleted) {
  if (levelCompleted % 10 !== 0) return null;
  const chapter = levelCompleted / 10; // 1-based
  const idx = (chapter - 1) % STORIES.length;
  return { chapter, idx, text: STORIES[idx], voice: `story${idx + 1}` };
}
