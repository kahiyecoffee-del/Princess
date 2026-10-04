// Local notifications in the princess's voice (no server needed).
// They are rescheduled each time the app goes to the background, so they always
// reflect the latest state (lives, daily gift, festival). Android only; no-op on the web.
import { Capacitor, registerPlugin } from '../vendor/capacitor-core.js';
import { MAX_LIVES, msToNext, REGEN_MS } from './lives.js';
import { dailyStatus } from './economy.js';
import { festivalInfo } from './progression.js';

const native = Capacitor.isNativePlatform();
const LocalNotifications = native ? registerPlugin('LocalNotifications') : null;
const IDS = { lives: 1, daily: 2, festival: 3, missYou: 4 };

export async function askPermission() {
  if (!LocalNotifications) return false;
  try {
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch { return false; }
}

// Pure planner, also used by tests: returns the notifications to schedule.
export function planNotifications(state, now = new Date()) {
  const list = [];
  const t = now.getTime();
  const lives = state.lives;
  if (lives.lives < MAX_LIVES) {
    const full = t + msToNext(lives, t) + (MAX_LIVES - lives.lives - 1) * REGEN_MS;
    list.push({ id: IDS.lives, at: new Date(full), title: 'Your lives are full 💕', body: "All your lives are back, darling! I'm waiting for you." });
  }
  const daily = dailyStatus(state, now);
  const next = new Date(now);
  if (daily.available) next.setHours(19, 0, 0, 0);
  if (!daily.available || next <= now) { next.setDate(next.getDate() + 1); next.setHours(10, 0, 0, 0); }
  list.push({ id: IDS.daily, at: next, title: 'Your daily gift is ready 🎁', body: 'I wrapped a royal gift just for you. Come and open it!' });
  const fest = festivalInfo(now);
  if (!fest.active) {
    const at = new Date(fest.startsAt);
    at.setHours(11, 0, 0, 0);
    list.push({ id: IDS.festival, at, title: 'The Star Festival has begun ✦', body: 'Double coins all weekend, darling! Let\'s collect star shards together.' });
  }
  list.push({ id: IDS.missYou, at: new Date(t + 2 * 24 * 3600 * 1000), title: 'I miss you, darling...', body: 'The kingdom feels empty without you. Come back and play with me? 👑' });
  return list.filter((n) => n.at.getTime() > t + 60 * 1000);
}

export async function scheduleAll(state) {
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.cancel({ notifications: Object.values(IDS).map((id) => ({ id })) });
    if (state.notify === false) return;
    const list = planNotifications(state).map((n) => ({
      id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true },
      smallIcon: 'ic_stat_crown', iconColor: '#E8B64A',
    }));
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch { /* permission denied or plugin unavailable */ }
}
