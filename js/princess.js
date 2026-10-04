// The animated princess: breathing, swaying, blinking, playful winks and hearts.
// The artwork is a still image, so movement comes from three swappable frames
// (eyes open / blinking / winking) plus CSS motion on layered wrappers.

const FRAMES = {
  open: 'img/prenses.jpg', blink: 'img/prenses-blink.jpg', wink: 'img/prenses-wink.jpg',
  talk1: 'img/prenses-talk1.jpg', talk2: 'img/prenses-talk2.jpg',
};
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);

export class Princess {
  constructor(host, { onTap, onGiggle, framed = true } = {}) {
    this.host = host;
    this.onTap = onTap;
    this.onGiggle = onGiggle;
    host.classList.add('princess');
    if (!framed) host.classList.add('pr-unframed');
    host.innerHTML = `
      <div class="pr-aura"></div>
      <div class="pr-frame-box">
        <div class="pr-sway"><div class="pr-life"><div class="pr-body">
          <img class="pr-img" src="${FRAMES.open}" alt="The Sky Princess" draggable="false">
          <img class="pr-img pr-alt" data-frame="blink" src="${FRAMES.blink}" alt="" draggable="false">
          <img class="pr-img pr-alt pr-mouth" data-frame="talk1" src="${FRAMES.talk1}" alt="" draggable="false">
          <img class="pr-img pr-alt pr-mouth" data-frame="talk2" src="${FRAMES.talk2}" alt="" draggable="false">
          <img class="pr-img pr-alt" data-frame="wink" src="${FRAMES.wink}" alt="" draggable="false">
        </div></div></div>
        <div class="pr-shine"></div>
      </div>
      <div class="pr-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="pr-fx" aria-hidden="true"></div>`;
    this.body = host.querySelector('.pr-sway');
    this.fx = host.querySelector('.pr-fx');
    this.alts = Object.fromEntries([...host.querySelectorAll('.pr-alt')].map((el) => [el.dataset.frame, el]));
    this.busy = false;
    host.addEventListener('click', () => this.tap());
    this.loop();
  }

  // Show one of the alternative frames for a short time.
  frame(name, ms) {
    const el = this.alts[name];
    if (!el) return Promise.resolve();
    el.classList.add('on');
    return new Promise((r) => setTimeout(() => { el.classList.remove('on'); r(); }, ms));
  }

  // Lip movement while she speaks: level 0..1 from the voice's loudness.
  mouth(level) {
    const open = level > 0.42 ? 'talk2' : level > 0.12 ? 'talk1' : null;
    if (open === this.mouthOpen) return;
    this.mouthOpen = open;
    this.alts.talk1.classList.toggle('on', open === 'talk1');
    this.alts.talk2.classList.toggle('on', open === 'talk2');
  }

  async blink() {
    if (this.busy) return;
    await this.frame('blink', 120);
    if (Math.random() < 0.25) {
      await new Promise((r) => setTimeout(r, 140));
      await this.frame('blink', 110);
    }
  }

  async wink(ms = 650) {
    this.hearts(2);
    await this.frame('wink', ms);
  }

  play(cls, ms) {
    if (reduceMotion) return Promise.resolve();
    this.body.classList.remove(cls);
    void this.body.offsetWidth;
    this.body.classList.add(cls);
    return new Promise((r) => setTimeout(() => { this.body.classList.remove(cls); r(); }, ms));
  }

  hearts(n = 3, spread = 1, toBoard = false) {
    if (reduceMotion) return;
    for (let i = 0; i < n; i++) {
      const h = document.createElement('span');
      h.className = toBoard ? 'pr-heart pr-heart-kiss' : 'pr-heart';
      h.textContent = Math.random() < 0.75 ? '♥' : '✦';
      h.style.left = `${rand(60, 88)}%`;
      h.style.top = `${rand(34, 52)}%`;
      h.style.setProperty('--dx', `${rand(-40, 40) * spread}px`);
      h.style.setProperty('--rot', `${rand(-30, 30)}deg`);
      h.style.fontSize = `${rand(12, 22)}px`;
      h.style.animationDelay = `${i * 0.12}s`;
      this.fx.append(h);
      setTimeout(() => h.remove(), 2200 + i * 120);
    }
  }

  sparkle() {
    if (reduceMotion) return;
    const s = document.createElement('span');
    s.className = 'pr-sparkle';
    const edge = Math.random();
    s.style.left = `${edge < 0.5 ? rand(-4, 12) : rand(88, 104)}%`;
    s.style.top = `${rand(5, 80)}%`;
    this.fx.append(s);
    setTimeout(() => s.remove(), 1600);
  }

  // Reactions used by the game
  async react(kind) {
    switch (kind) {
      case 'nod':
        if (!this.busy) this.play('pr-nod', 600);
        break;
      case 'cheer':
        this.busy = true;
        this.play('pr-bounce', 700);
        await this.wink(700);
        this.busy = false;
        break;
      case 'kiss':
        this.busy = true;
        this.play('pr-kiss', 1100);
        this.hearts(4, 1.2, true);
        await this.frame('wink', 900);
        this.busy = false;
        break;
      case 'big':
      case 'dance':
        this.busy = true;
        this.hearts(6, 1.4);
        this.play('pr-dance', 1500);
        await this.frame('wink', 500);
        await new Promise((r) => setTimeout(r, 250));
        await this.frame('blink', 140);
        await this.frame('wink', 450);
        this.busy = false;
        break;
      case 'lean':
        this.play('pr-lean', 1800);
        await new Promise((r) => setTimeout(r, 500));
        await this.frame('wink', 600);
        break;
      case 'sad':
        this.play('pr-droop', 1400);
        await this.frame('blink', 500);
        break;
      case 'tilt':
        this.play('pr-tilt', 1600);
        break;
      case 'hop':
        this.play('pr-hop', 800);
        break;
      default:
        break;
    }
  }

  async tap() {
    if (this.tapCooldown) return;
    this.tapCooldown = true;
    setTimeout(() => { this.tapCooldown = false; }, 1800);
    this.onTap?.();
    this.play('pr-giggle', 900);
    this.hearts(3);
    await this.frame('blink', 160);
    await new Promise((r) => setTimeout(r, 120));
    await this.frame('wink', 600);
  }

  // Idle life: blinking every few seconds, now and then something playful.
  loop() {
    const schedule = (fn, min, max) => {
      setTimeout(async () => {
        if (this.host.offsetParent !== null && !document.hidden) await fn();
        schedule(fn, min, max);
      }, rand(min, max));
    };
    schedule(() => this.blink(), 2400, 5200);
    schedule(async () => {
      if (this.busy) return;
      const r = Math.random();
      if (r < 0.3) await this.react('tilt');
      else if (r < 0.55) await this.wink(550);
      else if (r < 0.7) await this.react('hop');
      else if (r < 0.85) { this.play('pr-giggle', 900); this.hearts(2); this.onGiggle?.(); } else this.hearts(2);
    }, 8000, 14000);
    schedule(() => this.sparkle(), 700, 1600);
  }
}
