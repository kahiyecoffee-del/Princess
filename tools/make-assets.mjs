// Uygulama ikonu, açılış ekranı ve Google Play mağaza görsellerini üretir.
// Prenses karakteri www/index.html içindeki SVG'den alınır.
// Kullanım: npx playwright ... gerektirir → node tools/make-assets.mjs
// (Playwright kurulu değilse: npm i -D playwright)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'www/index.html'), 'utf8');
const defs = html.match(/<defs>[\s\S]*?<\/defs>/)[0];
const princess = html.match(/<symbol id="princess"[^>]*>([\s\S]*?)<\/symbol>/)[1];

const BG = 'radial-gradient(ellipse at 50% 110%, #b23a9c 0%, #4a1477 45%, #1a0636 100%)';
const svg = (size) => `<svg viewBox="0 0 200 220" width="${size}" height="${size * 1.1}">${defs}${princess}</svg>`;
const stars = (n, w, h, seed = 7) => {
  let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => `<i style="left:${r() * w}px;top:${r() * h}px;width:${1 + r() * 3}px;height:${1 + r() * 3}px;opacity:${0.4 + r() * 0.6}"></i>`).join('');
};
const page = (w, h, body, bg = BG) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
.c{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column}
i{position:absolute;background:#fff;border-radius:50%}
svg{filter:drop-shadow(0 0 ${Math.round(w / 30)}px rgba(255,150,230,.8))}
h1{margin:0;font:800 ${Math.round(h / 6)}px/0.95 system-ui,sans-serif;text-align:center;
background:linear-gradient(180deg,#fff9c4,#ffd34d 45%,#ff8ad8);-webkit-background-clip:text;color:transparent;
filter:drop-shadow(0 4px 0 #6a1080)}
p{margin:12px 0 0;color:#f2d9ff;font:600 ${Math.round(h / 22)}px system-ui,sans-serif;white-space:nowrap}</style></head>
<body>${body}</body></html>`;

const browser = await chromium.launch();
async function shot(file, w, h, content, { transparent = false } = {}) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(content);
  mkdirSync(dirname(file), { recursive: true });
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
}

const res = join(root, 'android/app/src/main/res');
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, k] of Object.entries(DENS)) {
  const s = Math.round(48 * k);
  const icon = page(s, s, `${stars(8, s, s)}<div class="c">${svg(s * 0.78)}</div>`);
  await shot(`${res}/mipmap-${d}/ic_launcher.png`, s, s, icon);
  // Yuvarlak ikon: köşeler şeffaf
  const round = page(s, s, `<div style="position:absolute;inset:0;border-radius:50%;overflow:hidden;background:${BG}">${stars(8, s, s)}<div class="c">${svg(s * 0.74)}</div></div>`, 'transparent');
  await shot(`${res}/mipmap-${d}/ic_launcher_round.png`, s, s, round, { transparent: true });
  // Uyarlanabilir ikon ön katmanı: güvenli alan ortadaki %61
  const f = Math.round(108 * k);
  const fg = page(f, f, `<div class="c">${svg(f * 0.5)}</div>`, 'transparent');
  await shot(`${res}/mipmap-${d}/ic_launcher_foreground.png`, f, f, fg, { transparent: true });
}

// Açılış ekranları
const splashSizes = {
  'drawable/splash.png': [480, 320],
  ...Object.fromEntries(Object.entries({ mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] })
    .flatMap(([d, [w, h]]) => [[`drawable-port-${d}/splash.png`, [w, h]], [`drawable-land-${d}/splash.png`, [h, w]]])),
};
for (const [f, [w, h]] of Object.entries(splashSizes)) {
  const m = Math.min(w, h);
  await shot(`${res}/${f}`, w, h, page(w, h, `${stars(Math.round((w * h) / 6000), w, h)}<div class="c">${svg(m * 0.45)}</div>`));
}

// Google Play mağaza görselleri
const store = join(root, 'store');
await shot(`${store}/ikon-512.png`, 512, 512, page(512, 512, `${stars(30, 512, 512)}<div class="c">${svg(400)}</div>`));
await shot(`${store}/one-cikan-gorsel-1024x500.png`, 1024, 500, page(1024, 500,
  `${stars(80, 1024, 500)}<div class="c" style="flex-direction:row;gap:40px">${svg(300)}<div><h1>Gökyüzü<br>Prensesi</h1><p>Yıldızları eşleştir, gökyüzünü aydınlat ✨</p></div></div>`));

await browser.close();
console.log('Görseller üretildi.');
