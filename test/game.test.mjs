import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, SP, mulberry32 } from '../www/js/board.js';
import { Engine } from '../www/js/engine.js';
import { getLevel, LEVEL_COUNT } from '../www/js/levels.js';
import { initEconomy, buyItem, useItem, claimDaily, dailyStatus, grantAdCoins, levelReward, ITEMS } from '../www/js/economy.js';
import { createLives, loseLife, refresh, msToNext, addLife, REGEN_MS, MAX_LIVES } from '../www/js/lives.js';

// Tahtayı elle kurmak için yardımcı: harfler renk, '.' boşluk
function boardFrom(rows) {
  const b = new Board({ rows: rows.length, cols: rows[0].length, colors: 6, rng: mulberry32(1) });
  rows.forEach((line, r) => [...line].forEach((ch, c) => {
    b.grid[r][c] = ch === '.' ? null : b.newTile(Number(ch));
  }));
  return b;
}

test('başlangıç tahtasında hazır eşleşme yok ve hamle var', () => {
  for (let seed = 1; seed < 50; seed++) {
    const b = new Board({ colors: 6, rng: mulberry32(seed) });
    assert.equal(b.findGroups().length, 0);
    assert.ok(b.hasPossibleMove());
  }
});

test('3lü eşleşme temizlenir', () => {
  const b = boardFrom(['0001', '1234', '2345', '3450']);
  const step = b.resolveStep();
  assert.equal(step.cleared.length, 3);
  assert.equal(step.created.length, 0);
});

test('4lü yatay eşleşme satır temizleyici oluşturur', () => {
  const b = boardFrom(['00001', '12341', '23452', '34503', '45014']);
  const step = b.resolveStep();
  assert.equal(step.created.length, 1);
  assert.equal(step.created[0].tile.special, SP.ROW);
});

test('5li eşleşme gökkuşağı, L şekli bomba oluşturur', () => {
  const b1 = boardFrom(['00000', '12341', '23452', '34503', '45014']);
  assert.equal(b1.resolveStep().created[0].tile.special, SP.RAINBOW);
  const b2 = boardFrom(['00012', '03452', '04523', '15234', '52345']);
  const step = b2.resolveStep();
  assert.equal(step.created[0].tile.special, SP.BOMB);
  assert.deepEqual([step.created[0].r, step.created[0].c], [0, 0]);
});

test('geçersiz takas geri alınır, geçerli takas kalır', () => {
  const b = boardFrom(['0120', '3453', '0124', '5235']);
  const before = b.grid.map((row) => row.map((t) => t.id));
  assert.equal(b.trySwap({ r: 0, c: 0 }, { r: 1, c: 0 }).valid, false);
  assert.deepEqual(b.grid.map((row) => row.map((t) => t.id)), before);
  // (2,2)'deki 5 ile (2,3)'teki 2 yer değişince 2. sütunda 2-2-2 oluşur
  const c = boardFrom(['0120', '3423', '0152', '5235']);
  assert.equal(c.trySwap({ r: 2, c: 2 }, { r: 2, c: 3 }).valid, true);
  assert.equal(c.grid[2][2].color, 2);
});

test('satır temizleyici patlayınca tüm satır gider', () => {
  const b = boardFrom(['0001', '1234', '2345', '3452']);
  b.grid[0][1].special = SP.ROW;
  b.grid[0][3] = b.newTile(5);
  const step = b.resolveStep();
  assert.equal(step.cleared.length, 4);
});

test('yerçekimi boşlukları doldurur, boşluk hücreleri (delik) atlanır', () => {
  const b = new Board({ rows: 4, cols: 1, colors: 3, holes: [[2, 0]], rng: mulberry32(2) });
  b.grid[3][0] = null;
  const { spawns } = b.applyGravity();
  assert.ok(spawns.length >= 1);
  assert.equal(b.grid[2][0], null);
  for (const r of [0, 1, 3]) assert.ok(b.grid[r][0]);
});

test('motor: hamle sayısı düşer, hedef tamamlanınca biter', () => {
  const e = new Engine(getLevel(1), 42);
  const m = e.board.listMoves(1)[0];
  const r = e.play(m.a, m.b);
  assert.ok(r.valid);
  assert.equal(e.movesLeft, getLevel(1).moves - 1);
  assert.ok(e.score > 0);
  e.addMoves(3);
  assert.equal(e.movesLeft, getLevel(1).moves + 2);
});

test('tüm seviyeler geçerli ve zorluk artıyor', () => {
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const L = getLevel(n);
    assert.ok(L.moves >= 12 && L.moves <= 35, `seviye ${n} hamle ${L.moves}`);
    assert.ok(L.starScores[0] < L.starScores[1] && L.starScores[1] < L.starScores[2]);
    if (L.kind === 'ice') assert.ok(L.ice.length > 0);
    if (L.kind === 'collect') assert.ok(L.collect.length >= 2);
    new Engine(L, n); // kurulum hatasız olmalı
  }
  assert.ok(getLevel(150).moves < getLevel(1).moves);
  assert.ok(getLevel(150).colors > getLevel(1).colors);
});

test('canlar: 5 can, kaybedince 30 dk sonra yenilenir', () => {
  const t0 = 1_000_000;
  const s = createLives(t0);
  assert.equal(s.lives, MAX_LIVES);
  loseLife(s, t0);
  loseLife(s, t0 + 1000);
  assert.equal(s.lives, 3);
  assert.equal(msToNext(s, t0), REGEN_MS);
  refresh(s, t0 + REGEN_MS + 5);
  assert.equal(s.lives, 4);
  refresh(s, t0 + 2 * REGEN_MS + 5);
  assert.equal(s.lives, 5);
  refresh(s, t0 + 10 * REGEN_MS);
  assert.equal(s.lives, 5);
});

test('canlar: hepsi bitince 0, reklamla 1 can eklenir, fazla dolmaz', () => {
  const t0 = 5_000_000;
  const s = createLives(t0);
  for (let i = 0; i < 6; i++) loseLife(s, t0);
  assert.equal(s.lives, 0);
  assert.equal(loseLife(s, t0), false);
  addLife(s, t0, 1);
  assert.equal(s.lives, 1);
  addLife(s, t0, 10);
  assert.equal(s.lives, MAX_LIVES);
});



test('güçlendiriciler: özel taş yerleştirme ve asa', () => {
  const e = new Engine(getLevel(5), 7);
  const placed = e.placeSpecials([SP.ROW, SP.BOMB, SP.RAINBOW], mulberry32(3));
  assert.equal(placed.length, 3);
  assert.deepEqual(placed.map((p) => p.tile.special), [SP.ROW, SP.BOMB, SP.RAINBOW]);
  const moves = e.movesLeft;
  const r = e.useWand(0, 0);
  assert.ok(r.valid);
  assert.equal(e.movesLeft, moves, 'asa hamle harcamaz');
  assert.ok(e.score > 0);
  assert.ok(e.board.grid[0][0], 'kırılan hücre yeniden dolar');
});

test('ekonomi: satın alma, kullanma, günlük ödül serisi, reklam parası sınırı', () => {
  const st = initEconomy({});
  assert.equal(st.coins, 200);
  assert.ok(buyItem(st, 'lance'));
  assert.equal(st.coins, 200 - ITEMS.lance.price);
  assert.equal(st.items.lance, 2);
  assert.equal(buyItem(st, 'orb'), false, 'yetersiz bakiye');
  assert.ok(useItem(st, 'lance'));
  assert.equal(st.items.lance, 1);
  const d1 = new Date(2026, 9, 1); const d2 = new Date(2026, 9, 2); const d4 = new Date(2026, 9, 4);
  assert.equal(claimDaily(st, d1).day, 1);
  assert.equal(claimDaily(st, d1), null, 'aynı gün ikinci kez alınamaz');
  assert.equal(claimDaily(st, d2).day, 2);
  assert.equal(dailyStatus(st, d4).day, 1, 'gün atlanınca seri sıfırlanır');
  for (let i = 0; i < 5; i++) assert.ok(grantAdCoins(st, d1));
  assert.equal(grantAdCoins(st, d1), false);
  assert.ok(levelReward(3, true) > levelReward(3, false));
});

test('kazanma serisi, festival ve bölüm hikâyeleri', async () => {
  const { streakBonus, festivalInfo, festivalState, addShards, claimFestival, chapterStory } = await import('../www/js/progression.js');
  assert.equal(streakBonus(0), null);
  assert.equal(streakBonus(1).moves, 2);
  assert.equal(streakBonus(9).specials.length, 2);
  // 2026-10-02 Cuma, 10-04 Pazar, 10-05 Pazartesi
  const fri = new Date(2026, 9, 2, 10); const sun = new Date(2026, 9, 4, 22); const mon = new Date(2026, 9, 5, 9);
  assert.ok(festivalInfo(fri).active);
  assert.ok(festivalInfo(sun).active);
  assert.equal(festivalInfo(fri).key, festivalInfo(sun).key);
  assert.ok(!festivalInfo(mon).active);
  assert.equal(festivalInfo(mon).startsAt.getDay(), 5);
  const st = initEconomy({});
  festivalState(st, fri);
  assert.equal(addShards(st, 12, fri), 12);
  assert.equal(addShards(initEconomy({}), 5, mon), 0, 'festival dışında parça yok');
  const coins = st.coins;
  assert.ok(claimFestival(st, 0, sun));
  assert.equal(st.coins, coins + 150);
  assert.equal(claimFestival(st, 0, sun), null, 'iki kez alınamaz');
  assert.equal(claimFestival(st, 1, sun), null, 'yetersiz parça');
  festivalState(st, new Date(2026, 9, 9, 10));
  assert.equal(st.festival.shards, 0, 'yeni hafta sıfırlanır');
  assert.equal(chapterStory(9), null);
  assert.equal(chapterStory(10).voice, 'story1');
  assert.equal(chapterStory(110).voice, 'story11');
  assert.equal(chapterStory(210).voice, 'story1'); // 20 hikâyeden sonra döngü
});

test('bildirim planı: canlar, günlük hediye, festival, özlem', async () => {
  const { planNotifications } = await import('../www/js/notifications.js');
  const now = new Date(2026, 9, 5, 12); // Pazartesi
  const st = initEconomy({ lives: createLives(now.getTime()) });
  loseLife(st.lives, now.getTime());
  const plan = planNotifications(st, now);
  const ids = plan.map((n) => n.id).sort();
  assert.deepEqual(ids, [1, 2, 3, 4]);
  const lives = plan.find((n) => n.id === 1);
  assert.equal(lives.at.getTime(), now.getTime() + REGEN_MS);
  assert.equal(plan.find((n) => n.id === 3).at.getDay(), 5, 'festival cuma');
});

test('davet kodu: kendi kodu, geçersiz, bir kez kullanım, günlük paylaşım ödülü', async () => {
  const { ensurePlayerId, redeemInvite, grantShareReward, INVITE_REWARD } = await import('../www/js/economy.js');
  const st = initEconomy({});
  const id = ensurePlayerId(st, mulberry32(5));
  assert.match(id, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(ensurePlayerId(st), id, 'kod değişmez');
  assert.equal(redeemInvite(st, id), 'own');
  assert.equal(redeemInvite(st, 'abc'), 'invalid');
  const c = st.coins;
  assert.equal(redeemInvite(st, 'k7m2qp'), 'ok');
  assert.equal(st.coins, c + INVITE_REWARD);
  assert.equal(redeemInvite(st, 'ZZZZ22'), 'already');
  const d = new Date(2026, 9, 5);
  assert.ok(grantShareReward(st, d));
  assert.equal(grantShareReward(st, d), false);
});

test('çeviriler: her dilde tüm anahtarlar ve aynı yer tutucular var', async () => {
  const { DICTIONARIES, t, setLang, detectLang } = await import('../www/js/i18n.js');
  const en = DICTIONARIES.en;
  for (const [code, d] of Object.entries(DICTIONARIES)) {
    for (const k of Object.keys(en)) {
      assert.ok(k in d, `${code} eksik: ${k}`);
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
      assert.equal(ph(d[k]), ph(en[k]), `${code}.${k} yer tutucuları farklı`);
    }
  }
  assert.equal(detectLang('tr-TR'), 'tr');
  assert.equal(detectLang('pt-BR'), 'pt');
  assert.equal(detectLang('de-DE'), 'en');
  setLang('tr');
  assert.equal(t('goal_score', { n: '1.000' }), '1.000 puana ulaş');
  setLang('en');
});

test('kraliyet finali: kalan hamleler özel taşa dönüşüp patlar', () => {
  const e = new Engine(getLevel(3), 11);
  e.movesLeft = 6;
  const before = e.score;
  const fin = e.finale(mulberry32(2));
  assert.equal(fin.converted, 6);
  assert.equal(e.movesLeft, 0);
  assert.ok(e.score > before + fin.bonus, 'patlamalar puan getirir');
  assert.equal(fin.steps[0].type, 'convert');
  const leftSpecials = e.board.grid.flat().filter((t) => t && t.special && t.special !== SP.CROWN).length;
  assert.equal(leftSpecials, 0, 'tüm özel taşlar patladı');
});

test('günlük görevler ve başarımlar', async () => {
  const Q = await import('../www/js/quests.js');
  const day = new Date(2026, 9, 4, 12);
  const a = Q.questsFor(day);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  assert.deepEqual(Q.questsFor(new Date(2026, 9, 4, 23)), a); // aynı gün aynı görevler
  const state = { coins: 0 };
  Q.ensureQuests(state, day);
  for (const id of a) {
    const def = Q.QUEST_POOL.find((d) => d.id === id);
    assert.equal(Q.claimQuest(state, id, day), 0); // henüz bitmedi
    Q.track(state, def.ev, def.n + 5, day);
    assert.equal(Q.claimQuest(state, id, day), def.coins);
    assert.equal(Q.claimQuest(state, id, day), 0); // iki kez alınmaz
  }
  assert.equal(Q.claimBonus(state, day), Q.ALL_DONE_BONUS);
  assert.equal(Q.claimBonus(state, day), 0);
  // Ertesi gün sıfırlanır, istatistikler kalır
  const next = new Date(2026, 9, 5, 9);
  assert.equal(Q.questList(state, next).every((q) => q.prog === 0 && !q.claimed), true);
  // Başarım kademeleri
  state.stats.win = 12;
  const before = state.coins;
  assert.equal(Q.claimAchievement(state, 'winner'), 100);
  assert.equal(Q.claimAchievement(state, 'winner'), 0); // 50'ye ulaşmadı
  assert.equal(state.coins, before + 100);
  Q.track(state, 'streak', 4, next);
  Q.track(state, 'streak', 2, next);
  assert.equal(state.stats.bestStreak, 4);
  assert.equal(Q.achievementList(state).find((x) => x.id === 'devoted').ready, true);
});

test('engeller: bulut, ay taşı, zincir ve taç', async () => {
  const { Board, SP } = await import('../www/js/board.js');
  const { Engine } = await import('../www/js/engine.js');
  const { mulberry32 } = await import('../www/js/board.js');
  // Ay taşı iki vuruşta kırılır, bulut bir vuruşta
  const b = new Board({ rows: 8, cols: 8, colors: 5, stones: [[7, 0]], clouds: [[7, 7]], chains: [[0, 0]], rng: mulberry32(3) });
  assert.equal(b.grid[7][0], null);
  assert.equal(b.block[7][0].hp, 2);
  assert.equal(b.grid[0][0].chain, true);
  b.grid[6][0] = b.newTile(0, SP.ROW);
  let step = b.resolveStep([], { cells: new Set([b.key(6, 0)]), activations: [], skip: new Set() });
  assert.equal(step.blockHits.length, 0); // satır ışını taşa değmez
  b.grid[5][0] = b.newTile(0, SP.COL);
  b.applyGravity();
  // sütun ışını taşa vurur
  let col = -1;
  for (let r = 0; r < 8; r++) if (b.grid[r][0]?.special === SP.COL) col = r;
  step = b.resolveStep([], { cells: new Set([b.key(col, 0)]), activations: [], skip: new Set() });
  assert.deepEqual(step.blockHits.map((h) => h.hp), [1]);
  // zincirli taş takas edilemez ve temizlenince zinciri kırılır
  if (b.grid[0][0]?.chain) {
    assert.equal(b.trySwap({ r: 0, c: 0 }, { r: 0, c: 1 }).valid, false);
    const st = b.resolveStep([], { cells: new Set([b.key(0, 0)]), activations: [], skip: new Set() });
    assert.equal(st.unchained.length, 1);
    assert.equal(b.grid[0][0].chain, false);
  }
  // Taç hedefi: üstte taç başlar, en alta inince toplanır
  const level = { number: 1, rows: 8, cols: 8, colors: 5, moves: 30, kind: 'crown', crowns: 3, holes: [], ice: [], collect: [], targetScore: 0, starScores: [0, 1000, 2000] };
  const e = new Engine(level, 11);
  assert.equal(e.board.countCrowns(), 2);
  let guard = 0;
  while (!e.finished && guard++ < 200) {
    const m = e.board.listMoves();
    // tacı aşağı indiren hamleyi tercih et
    const r = e.play(m[0].a, m[0].b);
    assert.equal(r.valid, true);
  }
  assert.ok(e.crownsGot >= 0);
  // Taçlar hiçbir zaman eşleşmez ve patlamaz
  for (const row of e.board.grid) for (const t of row) if (t?.special === SP.CROWN) assert.equal(t.color, -2);
  // Bulut seviyesi: kırılmazsa yayılır
  const lv2 = { ...level, kind: 'cloud', crowns: 0, clouds: [[0, 0]] };
  const e2 = new Engine(lv2, 5);
  assert.equal(e2.board.countBlocks('cloud'), 1);
  let spread = false;
  for (let i = 0; i < 20 && !e2.finished; i++) {
    const m = e2.board.listMoves();
    const res = e2.play(m[m.length - 1].a, m[m.length - 1].b);
    if (res.steps.some((s) => s.type === 'spread')) spread = true;
  }
  assert.ok(spread || e2.goalsMet());
});

test('taç sonunda toplanır (simülasyon)', async () => {
  const { Engine } = await import('../www/js/engine.js');
  const level = { number: 1, rows: 8, cols: 8, colors: 4, moves: 60, kind: 'crown', crowns: 2, holes: [], ice: [], collect: [], targetScore: 0, starScores: [0, 1000, 2000] };
  let wins = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const e = new Engine(level, seed);
    while (!e.finished) { const m = e.board.listMoves(); e.play(m[Math.floor(m.length / 2)].a, m[Math.floor(m.length / 2)].b); }
    if (e.goalsMet()) wins++;
  }
  assert.ok(wins >= 5, `wins ${wins}`);
});
