// Google Play için 1080x1920 telefon ekran görüntüleri üretir (JPEG: PNG'nin ~1/5'i boyutunda).
// Önce oyunu başlatın: npm start   (http://localhost:8080)
import { chromium } from 'playwright';
const out = new URL('../store/', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
const shot = (name) => page.screenshot({ path: `${out}${name}.jpg`, type: 'jpeg', quality: 88 });
await page.goto('http://localhost:8080/');
await page.evaluate(() => { const s = window.__game.state; s.maxLevel = 8; s.coins = 1250; for (let i = 1; i < 8; i++) s.stars[i] = 1 + (i * 7) % 3; s.daily.last = ((d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)(new Date()); });
await page.waitForTimeout(1500);
await shot('ekran-1-karsilama');
await page.click('#screen-home');
await page.waitForTimeout(1400);
await shot('ekran-3-harita');
await page.click('.node.current');
await page.waitForTimeout(400);
await page.click('#modal-buttons .btn-primary');
await page.waitForTimeout(1500);
const swipe = async () => {
  const pts = await page.evaluate(() => {
    const g = window.__game; const m = g.engine.board.listMoves(1)[0]; const r = g.renderer;
    const rect = document.querySelector('#board').getBoundingClientRect();
    const p = (c) => [rect.left + r.ox + (c.c + 0.5) * r.cell, rect.top + r.oy + (c.r + 0.5) * r.cell];
    return [p(m.a), p(m.b)];
  });
  await page.mouse.move(...pts[0]); await page.mouse.down(); await page.mouse.move(...pts[1], { steps: 4 }); await page.mouse.up();
};
await swipe(); await page.waitForTimeout(1500);
await swipe(); await page.waitForTimeout(260);
await page.evaluate(() => { document.querySelector('#speech-text').textContent = 'Amazing! Hehe!'; document.querySelector('#speech').hidden = false; });
await shot('ekran-2-oyun');
await page.waitForTimeout(1500);
await page.click('#btn-quit');
await page.waitForTimeout(400);
await page.click('#modal-buttons .btn-ghost');
await page.waitForTimeout(800);
await page.click('#btn-shop');
await page.waitForTimeout(600);
await shot('ekran-4-market');
await page.click('#modal-buttons .btn-ghost').catch(() => {});
await page.waitForTimeout(400);
await page.click('#btn-quests');
await page.waitForTimeout(500);
await shot('ekran-5-gorevler');
await browser.close();
