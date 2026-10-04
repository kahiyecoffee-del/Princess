// Uygulama ikonu, açılış ekranı ve Google Play mağaza görsellerini üretir.
// Prenses karakteri www/index.html içindeki SVG'den alınır.
// Kullanım: npx playwright ... gerektirir → node tools/make-assets.mjs
// (Playwright kurulu değilse: npm i -D playwright)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Prenses görselleri (www/img) data URI olarak sayfalara gömülür.
const imgData = (f) => `data:image/jpeg;base64,${readFileSync(join(root, 'www/img', f)).toString('base64')}`;
const PORTRAIT = imgData('prenses.jpg');
const FACE = imgData('prenses-yuz.jpg');

const BG = 'radial-gradient(ellipse at 50% 110%, #b23a9c 0%, #4a1477 45%, #1a0636 100%)';
// Yüz yakın planı: yuvarlak, altın çerçeveli
const face = (size, border = Math.max(2, size / 40)) => `<img src="${FACE}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:${border}px solid #ffd34d;box-shadow:0 0 ${size / 6}px rgba(140,120,255,.7)">`;
// Kemer çerçeveli portre
const portrait = (w) => `<img src="${PORTRAIT}" style="width:${w}px;height:${w * 1.25}px;object-fit:cover;object-position:50% 18%;border-radius:50% 50% ${w / 14}px ${w / 14}px / 38% 38% ${w / 14}px ${w / 14}px;border:${Math.max(2, w / 90)}px solid #ffd34d;box-shadow:0 0 ${w / 8}px rgba(140,120,255,.6)">`;
const stars = (n, w, h, seed = 7) => {
  let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => `<i style="left:${r() * w}px;top:${r() * h}px;width:${1 + r() * 3}px;height:${1 + r() * 3}px;opacity:${0.4 + r() * 0.6}"></i>`).join('');
};
const page = (w, h, body, bg = BG) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
.c{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column}
i{position:absolute;background:#fff;border-radius:50%}
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
  const icon = page(s, s, `<img src="${FACE}" style="width:${s}px;height:${s}px;object-fit:cover">`);
  await shot(`${res}/mipmap-${d}/ic_launcher.png`, s, s, icon);
  // Yuvarlak ikon: köşeler şeffaf
  const round = page(s, s, `<img src="${FACE}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover">`, 'transparent');
  await shot(`${res}/mipmap-${d}/ic_launcher_round.png`, s, s, round, { transparent: true });
  // Uyarlanabilir ikon ön katmanı: güvenli alan ortadaki %61
  const f = Math.round(108 * k);
  // Uyarlanabilir ikon: tüm katman yüz görseli; launcher maske ile kırpar
  const fg = page(f, f, `<img src="${FACE}" style="width:${f}px;height:${f}px;object-fit:cover">`, 'transparent');
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
  await shot(`${res}/${f}`, w, h, page(w, h, `${stars(Math.round((w * h) / 6000), w, h)}<div class="c">${face(Math.round(m * 0.42))}</div>`));
}

// Google Play mağaza görselleri
const store = join(root, 'store');
await shot(`${store}/ikon-512.png`, 512, 512, page(512, 512, `<img src="${FACE}" style="width:512px;height:512px;object-fit:cover">`));
await shot(`${store}/one-cikan-gorsel-1024x500.png`, 1024, 500, page(1024, 500,
  `${stars(80, 1024, 500)}<div class="c" style="flex-direction:row;gap:48px">${portrait(300)}<div><h1>Gökyüzü<br>Prensesi</h1><p>Yıldızları eşleştir, gökyüzünü aydınlat ✨</p></div></div>`));

await browser.close();
console.log('Görseller üretildi.');
