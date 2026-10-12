const WORLD = { width: 1050, height: 740 };
const STATIONS = [
  { x: 170, y: 337 }, { x: 345, y: 310 }, { x: 870, y: 337 },
  { x: 205, y: 565 }, { x: 760, y: 567 }, { x: 888, y: 635 }
];
const MANICURE = { x: 560, y: 486 };
const SPEED = 178;
const BARE_STYLE = { id: 'bare', name: 'Bare & beautiful', color: '#e3b8ad', accent: '#ead7bf', pattern: 'solid' };
const START = { x: 560, y: 520 };
const OBSTACLES = [
  { x: 423, y: 340, w: 275, h: 119 },
  { x: 57, y: 202, w: 56, h: 82 },
  { x: 948, y: 204, w: 55, h: 77 },
  { x: 78, y: 613, w: 75, h: 72 },
  { x: 942, y: 610, w: 69, h: 71 }
];

function rr(ctx, x, y, w, h, r = 10) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function label(ctx, words, x, y, size = 12, color = '#54705e', weight = 600) {
  ctx.font = `${weight} ${size}px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(words, x, y);
}

/** Self-contained, offline salon scene. World coordinates are floor contact points. */
export class SalonGame {
  constructor(canvas, { styles = [], onCollect, onNear, onManicure, onMove } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.styles = styles;
    this.callbacks = { onCollect, onNear, onManicure, onMove };
    this.player = { ...START, face: 'south', walk: 0, moving: false };
    this.collected = new Set();
    this.currentStyle = 'bare';
    this.enabled = false;
    this.keys = new Set();
    this.near = null;
    this.nearKey = '';
    this.manicure = null;
    this.particles = [];
    this.elapsed = 0;
    this.lastTime = 0;
    this.lastMoveEvent = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.avatar = new Image();
    this.avatar.src = './assets/avatar.png';
    this.avatar.onload = () => { this.avatarReady = true; };
    this.avatar.onerror = () => { this.avatarReady = false; };
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
    this.keyDown = e => {
      if (!this.enabled || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      // Let the browser activate a focused interface control with Space.
      if (key === ' ' && e.target?.closest?.('button, a, [role="button"], [role="link"]')) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'e', ' '].includes(key)) {
        e.preventDefault();
        if ((key === 'e' || key === ' ') && !e.repeat) this.interact();
        else this.setInput(key, true);
      }
    };
    this.keyUp = e => this.setInput(e.key.toLowerCase(), false);
    this.blur = () => { this.keys.clear(); this.player.moving = false; };
    this.focus = () => canvas.focus({ preventScroll: true });
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    canvas.addEventListener('pointerdown', this.focus);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.tick = t => {
      if (this.destroyed) return;
      const dt = this.lastTime ? Math.min((t - this.lastTime) / 1000, 0.045) : 0;
      this.lastTime = t; this.elapsed += dt;
      this.update(dt);
      this.draw();
      this.frame = requestAnimationFrame(this.tick);
    };
    this.frame = requestAnimationFrame(this.tick);
    this.refreshNear(true);
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.viewWidth = Math.max(1, bounds.width);
    this.viewHeight = Math.max(1, bounds.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.viewWidth * this.dpr);
    this.canvas.height = Math.round(this.viewHeight * this.dpr);
    this.scale = Math.min(this.viewWidth / WORLD.width, this.viewHeight / WORLD.height);
    this.offsetX = (this.viewWidth - WORLD.width * this.scale) / 2;
    this.offsetY = (this.viewHeight - WORLD.height * this.scale) / 2;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!enabled) this.blur();
    this.refreshNear(true);
  }
  setInput(key, down) {
    key = key.toLowerCase();
    if (down && this.enabled) this.keys.add(key); else this.keys.delete(key);
  }
  setStyle(styleId) {
    if (styleId === 'bare' || this.styles.some(s => s.id === styleId)) this.currentStyle = styleId;
  }
  setCollected(ids) { this.collected = new Set(ids); this.refreshNear(true); }
  resetPosition() {
    this.player = { ...START, face: 'south', walk: 0, moving: false };
    this.manicure = null; this.keys.clear(); this.refreshNear(true);
  }
  getState() {
    return {
      player: { ...this.player }, collected: [...this.collected], enabled: this.enabled,
      near: this.near, currentStyle: this.currentStyle, avatarReady: Boolean(this.avatarReady),
      manicure: this.manicure ? { style: this.manicure.style.id, progress: this.manicure.time / 2.6 } : null,
      stations: this.styles.map((style, i) => ({ style: style.id, ...STATIONS[i % STATIONS.length] })),
      manicureTarget: { ...MANICURE }, world: { ...WORLD }
    };
  }
  interact() {
    if (!this.enabled || this.manicure) return false;
    this.refreshNear();
    if (this.near?.type === 'style') {
      const style = this.near.style;
      if (this.collected.has(style.id)) return false;
      this.collected.add(style.id); this.currentStyle = style.id;
      const position = STATIONS[this.styles.findIndex(s => s.id === style.id) % STATIONS.length];
      for (let i = 0; i < 15; i++) {
        const angle = i * Math.PI * 2 / 15;
        this.particles.push({ x: position.x, y: position.y - 48, vx: Math.cos(angle) * 60, vy: Math.sin(angle) * 60 - 25, life: 0.75, color: style.accent || style.color });
      }
      this.callbacks.onCollect?.(style); this.refreshNear(true); return true;
    }
    if (this.near?.type === 'manicure') {
      const style = this.currentStyle === 'bare' ? BARE_STYLE : this.styles.find(s => s.id === this.currentStyle);
      if (!style) return false;
      this.manicure = { time: 0, style, returnPosition: { x: this.player.x, y: this.player.y } };
      this.player.x = MANICURE.x; this.player.y = 484; this.player.face = 'north';
      this.player.moving = false; this.keys.clear(); this.refreshNear(true); return true;
    }
    return false;
  }

  canStand(x, y) {
    const radius = 14;
    if (x < 76 || x > 981 || y < 270 || y > 697) return false;
    return !OBSTACLES.some(o => x + radius > o.x && x - radius < o.x + o.w && y + radius > o.y && y - radius < o.y + o.h);
  }
  refreshNear(force = false) {
    let next = null;
    if (this.enabled && !this.manicure) {
      let closest = 68;
      this.styles.forEach((style, i) => {
        if (this.collected.has(style.id)) return;
        const p = STATIONS[i % STATIONS.length];
        const distance = Math.hypot(this.player.x - p.x, this.player.y - p.y);
        if (distance < closest) { closest = distance; next = { type: 'style', style, action: 'Pick up' }; }
      });
      if (!next && Math.hypot(this.player.x - MANICURE.x, this.player.y - MANICURE.y) < 83) next = { type: 'manicure', action: 'Get nails done' };
    }
    const key = next ? `${next.type}:${next.style?.id || ''}` : '';
    this.near = next;
    if (force || key !== this.nearKey) {
      this.nearKey = key;
      this.callbacks.onNear?.(next);
    }
  }
  update(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.vy += 30 * dt; particle.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.manicure && this.enabled) {
      this.manicure.time += dt;
      if (this.manicure.time >= 2.6) {
        const { style, returnPosition } = this.manicure;
        this.manicure = null; this.player.x = returnPosition.x; this.player.y = returnPosition.y;
        this.player.face = 'south'; this.callbacks.onManicure?.(style); this.refreshNear(true);
      }
      return;
    }
    if (!this.enabled) return;
    let dx = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    let dy = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    const length = Math.hypot(dx, dy);
    this.player.moving = length > 0;
    if (length) {
      dx /= length; dy /= length;
      if (Math.abs(dx) > Math.abs(dy)) this.player.face = dx > 0 ? 'east' : 'west';
      else this.player.face = dy > 0 ? 'south' : 'north';
      const nextX = this.player.x + dx * SPEED * dt;
      const nextY = this.player.y + dy * SPEED * dt;
      if (this.canStand(nextX, this.player.y)) this.player.x = nextX;
      if (this.canStand(this.player.x, nextY)) this.player.y = nextY;
      this.player.walk += dt * 9;
      if (this.elapsed - this.lastMoveEvent > 0.12) {
        this.callbacks.onMove?.({ x: this.player.x, y: this.player.y, moving: true });
        this.lastMoveEvent = this.elapsed;
      }
    }
    this.refreshNear();
  }

  draw() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.viewWidth, this.viewHeight);
    c.fillStyle = '#f1ece1'; c.fillRect(0, 0, this.viewWidth, this.viewHeight);
    c.translate(this.offsetX, this.offsetY); c.scale(this.scale, this.scale);
    this.drawRoom(c);
    this.drawRug(c);
    const objects = [
      { y: 276, draw: () => this.drawPlant(c, 85, 263, 0.92) },
      { y: 276, draw: () => this.drawPlant(c, 976, 264, 0.95) },
      { y: 370, draw: () => this.drawTechnician(c) },
      { y: 458, draw: () => this.drawTable(c) },
      { y: 510, draw: () => this.drawChair(c) },
      { y: 680, draw: () => this.drawPlant(c, 113, 677, 0.88) },
      { y: 680, draw: () => this.drawPlant(c, 977, 678, 0.91) },
      ...this.styles.map((style, i) => ({ y: STATIONS[i % STATIONS.length].y, draw: () => this.drawStation(c, style, i) })),
      { y: this.player.y, draw: () => this.drawCharacter(c) }
    ];
    objects.sort((a, b) => a.y - b.y).forEach(o => o.draw());
    if (this.manicure) this.drawManicure(c);
    for (const particle of this.particles) {
      c.globalAlpha = Math.min(particle.life / 0.4, 1);
      this.sparkle(c, particle.x, particle.y, 3, particle.color);
    }
    c.globalAlpha = 1;
    this.drawVignette(c);
  }

  drawRoom(c) {
    // Forest-green plaster and a soft oak floor anchor the miniature salon.
    const wall = c.createLinearGradient(0, 30, 0, 262);
    wall.addColorStop(0, '#315b49'); wall.addColorStop(1, '#234936');
    rr(c, 35, 24, 980, 690, 24); c.fillStyle = '#d2c7ad'; c.fill();
    c.save(); rr(c, 40, 29, 970, 678, 20); c.clip();
    c.fillStyle = wall; c.fillRect(40, 29, 970, 224);
    for (let x = 65; x < 1010; x += 119) {
      c.fillStyle = 'rgba(213,219,178,.09)'; c.fillRect(x, 29, 2, 216);
    }
    c.fillStyle = '#f0e1c0'; c.fillRect(40, 240, 970, 14);
    c.fillStyle = '#bca982'; c.fillRect(40, 252, 970, 5);
    const floor = c.createLinearGradient(0, 254, 0, 711);
    floor.addColorStop(0, '#e6d7b8'); floor.addColorStop(1, '#f2e7d1');
    c.fillStyle = floor; c.fillRect(40, 257, 970, 450);
    for (let y = 267, row = 0; y < 721; y += 52, row++) {
      c.strokeStyle = 'rgba(158,128,85,.16)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(40, y); c.lineTo(1010, y); c.stroke();
      for (let x = 40 + (row % 2 ? 94 : 0); x < 1010; x += 186) {
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 52); c.stroke();
        c.strokeStyle = 'rgba(179,147,103,.06)';
        c.beginPath(); c.moveTo(x + 10, y + 17); c.bezierCurveTo(x + 57, y + 8, x + 126, y + 30, x + 175, y + 19); c.stroke();
        c.strokeStyle = 'rgba(158,128,85,.16)';
      }
    }
    // Tall arched mirror, softly lit signage, and two slender brass pendants.
    c.save(); c.shadowColor = '#132d2470'; c.shadowBlur = 14;
    rr(c, 443, 64, 235, 162, [95, 95, 12, 12]); c.fillStyle = '#bca26a'; c.fill(); c.restore();
    const mirror = c.createLinearGradient(457, 75, 666, 220);
    mirror.addColorStop(0, '#bed7cb'); mirror.addColorStop(0.5, '#e8eee5'); mirror.addColorStop(1, '#9dbab0');
    rr(c, 450, 71, 221, 148, [91, 91, 8, 8]); c.fillStyle = mirror; c.fill();
    c.save(); rr(c, 450, 71, 221, 148, [91, 91, 8, 8]); c.clip();
    c.fillStyle = '#ffffff38'; c.beginPath(); c.moveTo(590, 66); c.lineTo(639, 66); c.lineTo(509, 230); c.lineTo(455, 230); c.fill(); c.restore();
    label(c, 'THE NAIL ATELIER', 558, 171, 18, '#38614d', 600);
    label(c, 'a little room for your next favorite', 558, 195, 10, '#547963', 500);
    this.drawShelf(c, 152, 135, 206);
    this.drawShelf(c, 759, 135, 173);
    this.drawPendant(c, 368, 28, 84);
    this.drawPendant(c, 745, 28, 81);
    c.restore();
    c.strokeStyle = '#b9b294'; c.lineWidth = 1.5; rr(c, 40, 29, 970, 678, 20); c.stroke();
  }

  drawShelf(c, x, y, width) {
    c.fillStyle = '#c4a773'; rr(c, x, y + 42, width, 10, 3); c.fill();
    c.fillStyle = '#ba9b61'; rr(c, x, y + 104, width, 10, 3); c.fill();
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < Math.floor(width / 27); i++) {
        const color = this.styles[(i + row * 3) % Math.max(1, this.styles.length)]?.color || '#c29099';
        const bx = x + 12 + i * 26, by = y + 42 + row * 62;
        c.fillStyle = '#152d25'; rr(c, bx + 3, by - 34, 11, 15, 3); c.fill();
        c.fillStyle = color; rr(c, bx, by - 22, 17, 22, 4); c.fill();
        c.fillStyle = '#ffffff75'; rr(c, bx + 3, by - 17, 3, 12, 1); c.fill();
      }
    }
  }
  drawPendant(c, x, y, drop) {
    c.strokeStyle = '#bca268'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + drop); c.stroke();
    const halo = c.createRadialGradient(x, y + drop + 23, 0, x, y + drop + 23, 84);
    halo.addColorStop(0, '#fff1bd27'); halo.addColorStop(1, '#fff1bd00');
    c.fillStyle = halo; c.fillRect(x - 85, y + drop - 60, 170, 170);
    c.fillStyle = '#c6ac70'; c.beginPath(); c.moveTo(x - 22, y + drop + 12); c.lineTo(x - 9, y + drop - 4); c.lineTo(x + 9, y + drop - 4); c.lineTo(x + 22, y + drop + 12); c.closePath(); c.fill();
    ellipse(c, x, y + drop + 12, 22, 4, '#f4dda0');
  }
  drawRug(c) {
    c.save();
    ellipse(c, 557, 501, 233, 139, '#425c4821');
    ellipse(c, 557, 498, 228, 137, '#ddc29e');
    c.strokeStyle = '#efdcbf'; c.lineWidth = 8; c.beginPath(); c.ellipse(557, 498, 216, 126, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#c8ab86'; c.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(557, 498, 198 - i * 27, 114 - i * 15, 0, 0, Math.PI * 2); c.stroke(); }
    c.restore();
  }
  drawPlant(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    ellipse(c, 4, 0, 34, 13, '#293c2525');
    c.fillStyle = '#c3a479'; c.beginPath(); c.moveTo(-21, -38); c.lineTo(22, -38); c.lineTo(16, 0); c.lineTo(-15, 0); c.closePath(); c.fill();
    ellipse(c, 0, -38, 23, 7, '#d9bd8d'); ellipse(c, 0, -39, 18, 4, '#625f38');
    c.strokeStyle = '#406449'; c.lineWidth = 3;
    for (const [dx, dy, angle] of [[-23, -99, -0.5], [18, -112, 0.45], [0, -124, 0], [-36, -67, -0.8], [33, -77, 0.9]]) {
      c.beginPath(); c.moveTo(0, -39); c.quadraticCurveTo(dx * 0.3, dy + 30, dx, dy); c.stroke();
      c.save(); c.translate(dx, dy); c.rotate(angle); ellipse(c, 0, 0, 12, 30, dx < 0 ? '#3e7552' : '#58845b');
      c.strokeStyle = '#8ba37580'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 24); c.lineTo(0, -23); c.stroke(); c.restore();
    }
    c.restore();
  }

  drawTechnician(c) {
    c.save(); c.translate(560, 353);
    ellipse(c, 0, 12, 37, 11, '#243b2a25');
    c.fillStyle = '#294d39'; rr(c, -26, -30, 52, 51, 14); c.fill();
    c.fillStyle = '#e8d9c3'; rr(c, -23, -56, 46, 62, [17, 17, 7, 7]); c.fill();
    c.fillStyle = '#4c3930'; rr(c, -23, -101, 47, 68, [23, 23, 15, 15]); c.fill();
    ellipse(c, 0, -72, 18, 24, '#d9aa85');
    c.fillStyle = '#5b4133'; c.beginPath(); c.moveTo(-19, -80); c.quadraticCurveTo(-12, -112, 19, -86); c.lineTo(18, -73); c.quadraticCurveTo(3, -97, -19, -80); c.fill();
    c.strokeStyle = '#47443b'; c.lineWidth = 2; rr(c, -17, -78, 15, 10, 4); c.stroke(); rr(c, 3, -78, 15, 10, 4); c.stroke();
    c.beginPath(); c.moveTo(-2, -74); c.lineTo(3, -74); c.stroke();
    c.fillStyle = '#e8d9c3'; rr(c, -39, -39, 26, 17, 9); c.fill(); rr(c, 15, -39, 26, 17, 9); c.fill();
    c.restore();
  }
  drawTable(c) {
    c.save();
    ellipse(c, 558, 456, 151, 28, '#34533223');
    c.fillStyle = '#bb9d6d'; rr(c, 439, 405, 16, 58, 4); c.fill(); rr(c, 665, 405, 16, 58, 4); c.fill();
    c.fillStyle = '#c2ad89'; rr(c, 425, 379, 270, 31, 17); c.fill();
    c.shadowColor = '#314c2925'; c.shadowBlur = 14; c.shadowOffsetY = 6;
    c.fillStyle = '#f6efdf'; rr(c, 419, 343, 281, 59, 22); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.strokeStyle = '#fffdf4'; c.lineWidth = 2; rr(c, 425, 348, 269, 48, 18); c.stroke();
    // UV lamp and hands rest.
    c.fillStyle = '#ede6db'; rr(c, 522, 354, 80, 39, [23, 23, 8, 8]); c.fill();
    c.fillStyle = '#e1d8cc'; rr(c, 524, 378, 76, 16, 7); c.fill();
    c.fillStyle = this.manicure ? '#79a9ff' : '#354a61'; rr(c, 532, 374, 60, 16, [11, 11, 3, 3]); c.fill();
    c.fillStyle = '#263b50'; rr(c, 546, 360, 32, 9, 4); c.fill(); label(c, this.manicure ? 'ON' : 'UV', 562, 367, 6, '#9db8df');
    c.fillStyle = '#e4bea3'; rr(c, 488, 388, 145, 16, 7); c.fill();
    c.fillStyle = '#bfb39c'; rr(c, 446, 355, 41, 21, 8); c.fill();
    c.fillStyle = '#b58273'; rr(c, 459, 349, 11, 17, 3); c.fill();
    c.fillStyle = '#324035'; rr(c, 461, 344, 7, 7, 1); c.fill();
    c.fillStyle = '#d1b881'; rr(c, 639, 356, 29, 24, 5); c.fill();
    c.strokeStyle = '#6f715a'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(643 + i * 5, 358); c.lineTo(638 + i * 7, 345); c.stroke(); }
    label(c, 'MANICURE BAR', 560, 437, 10, '#6d715b', 700);
    c.restore();
  }
  drawChair(c) {
    c.save();
    ellipse(c, 560, 510, 43, 14, '#31422d22');
    c.strokeStyle = '#987f50'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(535, 487); c.lineTo(532, 514); c.moveTo(585, 487); c.lineTo(588, 514); c.stroke();
    c.fillStyle = '#b27e6b'; rr(c, 520, 461, 80, 39, 17); c.fill();
    c.fillStyle = '#d3a18a'; rr(c, 521, 455, 78, 27, 14); c.fill();
    c.fillStyle = '#bf8c74'; rr(c, 523, 480, 75, 21, [8, 8, 14, 14]); c.fill();
    c.strokeStyle = '#e2b299'; c.lineWidth = 2; rr(c, 528, 484, 64, 11, 5); c.stroke();
    c.restore();
  }

  drawStation(c, style, index) {
    const position = STATIONS[index % STATIONS.length];
    const { x, y } = position;
    const has = this.collected.has(style.id);
    const near = this.near?.style?.id === style.id;
    const bob = !this.reduced && !has ? Math.sin(this.elapsed * 2 + index) * 3 : 0;
    c.save();
    if (near) {
      ellipse(c, x, y + 2, 44, 18, '#92a57c34');
      c.strokeStyle = '#7d946a'; c.lineWidth = 1.5; c.setLineDash([3, 4]);
      c.beginPath(); c.ellipse(x, y + 2, 44, 18, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    ellipse(c, x + 3, y + 8, 30, 10, '#3b4c2724');
    c.fillStyle = '#b49f78'; rr(c, x - 23, y - 31, 46, 34, [0, 0, 7, 7]); c.fill();
    c.fillStyle = '#d4c39a'; ellipse(c, x, y - 30, 28, 9, '#d4c39a');
    c.fillStyle = '#e5d6b1'; ellipse(c, x, y - 32, 26, 7, '#e5d6b1');
    if (!has) {
      const glow = c.createRadialGradient(x, y - 57, 5, x, y - 57, 48);
      glow.addColorStop(0, `${style.color}35`); glow.addColorStop(1, `${style.color}00`);
      c.fillStyle = glow; c.fillRect(x - 49, y - 106, 98, 98);
      this.drawBottle(c, x, y - 34 + bob, style, index);
      if (!this.reduced) {
        this.sparkle(c, x + 26, y - 71 + Math.sin(this.elapsed * 2 + index) * 7, 3, '#aa915a');
        if (near) this.sparkle(c, x - 28, y - 50, 4, style.accent || '#c4a370');
      }
    } else {
      c.strokeStyle = '#69825c'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 6, y - 32); c.lineTo(x - 1, y - 28); c.lineTo(x + 7, y - 36); c.stroke();
    }
    const text = style.name;
    const labelWidth = Math.max(64, Math.min(138, text.length * 6.7 + 18));
    c.fillStyle = has ? '#ffffff9c' : '#fffcf1'; rr(c, x - labelWidth / 2, y + 18, labelWidth, 24, 11); c.fill();
    label(c, text, x, y + 34, 10, has ? '#8b927a' : '#4e6249', 600);
    c.restore();
  }
  drawBottle(c, x, y, style, index) {
    c.save(); c.translate(x, y);
    c.fillStyle = '#273e31'; rr(c, -9, -54, 18, 24, 4); c.fill();
    c.fillStyle = '#536b51'; rr(c, -6, -52, 3, 19, 1); c.fill();
    const gradient = c.createLinearGradient(-19, 0, 21, 0);
    gradient.addColorStop(0, style.color); gradient.addColorStop(0.5, style.accent || style.color); gradient.addColorStop(1, style.color);
    c.fillStyle = gradient; rr(c, -18, -34, 36, 36, [7, 7, 10, 10]); c.fill();
    c.strokeStyle = '#ffffff60'; c.lineWidth = 1; rr(c, -18, -34, 36, 36, [7, 7, 10, 10]); c.stroke();
    c.fillStyle = '#ffffff80'; rr(c, -13, -28, 4, 22, 2); c.fill();
    c.fillStyle = '#fffcf0bd'; rr(c, -11, -21, 23, 14, 3); c.fill();
    label(c, String(index + 1).padStart(2, '0'), 0, -11, 9, '#6f6756', 700);
    c.restore();
  }
  sparkle(c, x, y, size, color) {
    c.fillStyle = color; c.beginPath(); c.moveTo(x, y - size); c.quadraticCurveTo(x + 1, y - 1, x + size, y);
    c.quadraticCurveTo(x + 1, y + 1, x, y + size); c.quadraticCurveTo(x - 1, y + 1, x - size, y);
    c.quadraticCurveTo(x - 1, y - 1, x, y - size); c.fill();
  }

  drawCharacter(c) {
    const p = this.player;
    const seated = Boolean(this.manicure);
    const bob = p.moving && !this.reduced ? Math.sin(p.walk * 2) * 2.7 : 0;
    c.save(); c.translate(p.x, p.y);
    ellipse(c, 0, 2, seated ? 28 : 24, 9, '#24362740');
    if (this.avatarReady && !seated) {
      c.save();
      if (p.face === 'west') c.scale(-1, 1);
      // The source cutout is contained to preserve the original portrait proportions.
      const ratio = this.avatar.naturalWidth / this.avatar.naturalHeight;
      const height = 139, width = Math.min(122, height * ratio);
      c.drawImage(this.avatar, -width / 2, -height + bob, width, height);
      // Tiny fingertip glints make an equipped polish visible on the cutout too.
      // Coordinates suit the full-body avatar; the hand comparison gives the detailed view.
      if (this.currentStyle !== 'bare') {
        const style = this.styles.find(s => s.id === this.currentStyle);
        c.fillStyle = style?.color || '#e3b8ad';
        for (let i = 0; i < 3; i++) {
          rr(c, -width * 0.3 + i * 2.5, -height * 0.43 + bob, 2, 3, 1); c.fill();
          rr(c, width * 0.26 + i * 2.5, -height * 0.43 + bob, 2, 3, 1); c.fill();
        }
      }
      c.restore();
    } else this.drawProceduralAvatar(c, p, bob, seated);
    if (p.moving && !this.reduced && !seated) {
      c.globalAlpha = 0.16; ellipse(c, p.face === 'west' ? 12 : -12, 10, 6, 3, '#9b8463'); c.globalAlpha = 1;
    }
    c.restore();
  }
  drawProceduralAvatar(c, p, bob, seated) {
    c.save(); c.translate(0, bob);
    const back = p.face === 'north';
    const walk = p.moving && !this.reduced ? Math.sin(p.walk) * 5 : 0;
    if (!seated) {
      c.fillStyle = '#527087'; rr(c, -16, -39, 14, 35 + walk, 5); c.fill(); rr(c, 3, -39, 14, 35 - walk, 5); c.fill();
      c.fillStyle = '#e2d6c4'; rr(c, -18, -8 + walk, 19, 10, 4); c.fill(); rr(c, 2, -8 - walk, 19, 10, 4); c.fill();
      c.fillStyle = '#536c80'; rr(c, -18, -6 + walk, 19, 4, 2); c.fill(); rr(c, 2, -6 - walk, 19, 4, 2); c.fill();
    }
    c.fillStyle = '#273c65'; rr(c, -25, -80, 50, seated ? 66 : 54, [15, 15, 8, 8]); c.fill();
    c.strokeStyle = '#6b82a332'; c.lineWidth = 1.2;
    for (let i = -17; i <= 19; i += 5) { c.beginPath(); c.moveTo(i, -65); c.lineTo(i, -30); c.stroke(); }
    c.fillStyle = '#d4a17e'; rr(c, -5, -88, 12, 16, 4); c.fill();
    c.fillStyle = '#273c65'; rr(c, -35, -76 + walk / 2, 16, 43, 8); c.fill(); rr(c, 20, -76 - walk / 2, 16, 43, 8); c.fill();
    c.fillStyle = '#d4a17e'; ellipse(c, -27, -30 + walk / 2, 7, 8, '#d4a17e'); ellipse(c, 28, -30 - walk / 2, 7, 8, '#d4a17e');
    // Chestnut shoulder-length hair, a wispy fringe, and navy ribbed knit.
    c.fillStyle = '#352824'; rr(c, -29, -131, 59, 69, [28, 28, 18, 18]); c.fill();
    if (!back) {
      ellipse(c, 1, -103, 20, 27, '#d9aa87');
      c.fillStyle = '#543830';
      c.beginPath(); c.moveTo(-26, -108); c.bezierCurveTo(-25, -141, 15, -140, 29, -112);
      c.lineTo(25, -84); c.quadraticCurveTo(17, -99, 18, -120); c.quadraticCurveTo(7, -116, -5, -101); c.lineTo(-9, -118); c.quadraticCurveTo(-16, -109, -21, -92); c.closePath(); c.fill();
      c.fillStyle = '#312c29'; ellipse(c, -7, -104, 2.3, 3, '#312c29'); ellipse(c, 10, -104, 2.3, 3, '#312c29');
      c.fillStyle = '#ffffff'; ellipse(c, -7.4, -105, 0.7, 0.8, '#ffffff'); ellipse(c, 9.5, -105, 0.7, 0.8, '#ffffff');
      c.strokeStyle = '#bb856f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-4, -89); c.quadraticCurveTo(3, -86, 9, -90); c.stroke();
      c.fillStyle = '#c49479'; ellipse(c, 1, -98, 1.3, 3.5, '#c49479');
    }
    c.strokeStyle = '#97644955'; c.lineWidth = 1.5;
    for (const x of [-25, -20, 21, 25]) { c.beginPath(); c.moveTo(x, -117); c.quadraticCurveTo(x - 3, -87, x + 1, -69); c.stroke(); }
    if (back) {
      for (let x = -18; x < 22; x += 6) { c.beginPath(); c.moveTo(x, -126); c.quadraticCurveTo(x - 3, -91, x + 1, -71); c.stroke(); }
    }
    if (!back && this.currentStyle) {
      const style = this.currentStyle === 'bare' ? BARE_STYLE : this.styles.find(s => s.id === this.currentStyle);
      c.fillStyle = style?.color || '#b97f8b';
      for (let i = 0; i < 3; i++) { rr(c, -31 + i * 3, -30 + walk / 2, 2, 3, 1); c.fill(); rr(c, 24 + i * 3, -30 - walk / 2, 2, 3, 1); c.fill(); }
    }
    c.restore();
  }

  drawManicure(c) {
    const progress = Math.min(1, this.manicure.time / 2.6);
    const glow = c.createRadialGradient(561, 383, 3, 561, 383, 80);
    glow.addColorStop(0, '#5994ff85'); glow.addColorStop(1, '#5994ff00');
    c.fillStyle = glow; c.fillRect(480, 311, 164, 145);
    c.strokeStyle = '#e8dbcd'; c.lineWidth = 15; c.lineCap = 'round';
    c.beginPath(); c.moveTo(541, 328); c.lineTo(548, 373); c.moveTo(581, 328); c.lineTo(574, 373); c.stroke();
    c.strokeStyle = '#d5a589'; c.lineWidth = 10; c.beginPath(); c.moveTo(549, 374); c.lineTo(556, 385); c.moveTo(574, 374); c.lineTo(565, 385); c.stroke();
    c.lineCap = 'butt';
    c.fillStyle = '#fffff4'; rr(c, 460, 550, 200, 42, 18); c.fill();
    label(c, 'A little polish, a little magic…', 560, 568, 10, '#52684c');
    c.fillStyle = '#e7e6d8'; rr(c, 477, 578, 166, 5, 3); c.fill();
    c.fillStyle = '#809369'; rr(c, 477, 578, 166 * progress, 5, 3); c.fill();
  }
  drawVignette(c) {
    // A subtle sunlit wash makes the diorama feel less flat.
    const sunlight = c.createRadialGradient(179, 232, 50, 179, 232, 485);
    sunlight.addColorStop(0, '#fff7d319'); sunlight.addColorStop(1, '#fff7d300');
    c.fillStyle = sunlight; rr(c, 40, 29, 970, 678, 20); c.fill();
  }
  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur); this.canvas.removeEventListener('pointerdown', this.focus);
  }
}
