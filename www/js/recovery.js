// Support tools for people recovering from gambling problems.
// These tools do not replace professional treatment; they point to helplines.

export const HELPLINES = [
  { country: 'US', name: 'National Problem Gambling Helpline (US)', phone: '1-800-GAMBLER', dial: '18004262537', note: 'Free, confidential, 24/7. Call or text.' },
  { country: 'GB', name: 'National Gambling Helpline (UK)', phone: '0808 8020 133', dial: '08088020133', note: 'Free, confidential, 24/7.' },
  { country: 'TR', name: 'Yeşilay Counseling Center YEDAM (Türkiye)', phone: '115', dial: '115', note: 'Free, confidential counseling.' },
  { country: 'AU', name: 'Gambling Help Online (Australia)', phone: '1800 858 858', dial: '1800858858', note: 'Free, confidential, 24/7.' },
];

// Show the helpline for the player's own country first.
export function sortedHelplines(lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US') {
  const region = (lang.split('-')[1] || (lang.startsWith('tr') ? 'TR' : '')).toUpperCase();
  return [...HELPLINES].sort((a, b) => (b.country === region) - (a.country === region));
}

export function guessCurrency(lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US') {
  if (lang.startsWith('tr')) return 'TRY';
  if (/-GB$/i.test(lang)) return 'GBP';
  if (/^(de|fr|es|it|nl|pt|fi|el|sk|sl|et|lv|lt)\b/i.test(lang) && !/-(BR|CH)$/i.test(lang)) return 'EUR';
  return 'USD';
}

export const MESSAGES = [
  'Every day, your brain finds its balance again. Today, you won.',
  'The house always wins. Today you invested in yourself instead.',
  'An urge is like a wave: it rises, peaks and passes. It usually lasts 15 to 20 minutes.',
  'The wish to win back lost money is the strongest trap of gambling. Noticing it is a big step.',
  'There is no money and no risk in this game. Just fun and calm.',
  'Call a friend and ask how they are. Connection is the antidote to addiction.',
  'Plan a small treat with the money you have saved. You earned it.',
  'Asking for help is not weakness. It takes courage.',
  'If you slip, do not give up. Restart your counter and keep going.',
  'Block betting ads, delete the apps, set limits on your cards. Change your surroundings so your willpower can rest.',
];

export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysSince(dateStr, now = new Date()) {
  if (!dateStr) return 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - start) / 86400000));
}

export function moneySaved(rec, now = new Date()) {
  return Math.round(daysSince(rec.quitDate, now) * (Number(rec.dailySpend) || 0));
}

export function dailyMessage(now = new Date()) {
  const dayIndex = Math.floor(now.getTime() / 86400000);
  return MESSAGES[dayIndex % MESSAGES.length];
}

// Milestones shown as badges.
export const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365];

export function milestoneReached(days) {
  return MILESTONES.filter((m) => days >= m);
}
