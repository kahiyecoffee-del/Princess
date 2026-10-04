// Google Play için 1080x1920 telefon ekran görüntüleri üretir.
// Önce oyunu başlatın: npm start   (http://localhost:8080)
import { chromium } from 'playwright';
const out = new URL('../store/', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
await page.goto('http://localhost:8080/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}ekran-1-menu.png` });
await page.click('#btn-play');
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
await page.evaluate(() => { document.querySelector('#speech-text').textContent = 'Amazing!'; document.querySelector('#speech').hidden = false; });
await page.screenshot({ path: `${out}ekran-2-oyun.png` });
await page.waitForTimeout(1500);
await page.goto('http://localhost:8080/');
await page.evaluate(() => { const s = window.__game.state; s.maxLevel = 23; for (let i = 1; i < 23; i++) s.stars[i] = 1 + (i * 7) % 3; });
await page.click('#btn-map');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}ekran-3-harita.png` });
await page.click('#screen-map [data-back]');
await page.click('#btn-settings');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}ekran-4-ayarlar.png` });
await browser.close();
