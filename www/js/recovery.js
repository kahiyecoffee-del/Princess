// Kumar bağımlılığından kurtulmaya destek araçları.
// Bu araçlar profesyonel tedavinin yerini tutmaz; yardım hattına yönlendirir.

export const HELPLINES = [
  { name: 'Yeşilay Danışmanlık Merkezi (YEDAM)', phone: '115', note: 'Ücretsiz, gizli danışmanlık' },
  { name: 'Acil durum', phone: '112', note: 'Kendinize zarar verme düşüncesi varsa' },
];

export const MESSAGES = [
  'Her geçen gün, beynin yeniden dengeyi buluyor. Bugün de kazandın.',
  'Kasa her zaman kazanır. Sen bugün kasaya değil, kendine yatırım yaptın.',
  'Dürtü bir dalga gibidir: yükselir, zirve yapar ve geçer. Ortalama 15-20 dakika sürer.',
  'Kaybedilen parayı geri kazanma isteği, bağımlılığın en güçlü tuzağıdır. Bu tuzağı fark etmek büyük bir adım.',
  'Bu oyunda para yok, risk yok. Sadece eğlence ve sakinlik var.',
  'Bir arkadaşını ara ve nasıl olduğunu sor. Bağlantı, bağımlılığın panzehiridir.',
  'Biriktirdiğin parayla kendine küçük bir ödül planla. Hak ettin.',
  'Yardım istemek güçsüzlük değil, cesarettir. 115 her zaman bir telefon uzağında.',
  'Kayma yaşarsan pes etme. Sayacı sıfırla ve kaldığın yerden devam et.',
  'Bahis reklamlarını engelle, uygulamaları sil, kartlarına limit koy. Ortamı değiştir, irade yorulmasın.',
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

// Kilometre taşları: rozet olarak gösterilir.
export const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365];

export function milestoneReached(days) {
  return MILESTONES.filter((m) => days >= m);
}
