class Renderer {
  constructor(canvas, nextCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.dpr = 1;
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.time = 0;
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.shooting = [];
    this.shake = 0;
    this.flash = 0;
    this.nextTier = 0;
    this.stars = this.makeStars();
    this.resize();
  }

  makeStars() {
    const rng = new RNG(12345);
    const stars = [];
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 80 + layer * 30; i++) {
        stars.push({
          x: rng.range(0, WORLD.w), y: rng.range(0, WORLD.h),
          r: rng.range(0.5, 1.8 + layer * 0.5),
          a: rng.range(0.18, 0.82),
          layer: layer + 1,
        });
      }
    }
    return stars;
  }

  resize() {
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scale = Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h);
    this.offX = (window.innerWidth - WORLD.w * this.scale) / 2;
    this.offY = (window.innerHeight - WORLD.h * this.scale) / 2;
  }

  screenToWorld(clientX) {
    return (clientX - this.offX) / this.scale;
  }

  handleEvent(type, data) {
    if (type === 'next') this.nextTier = data.tier;
    if (type === 'drop') this.burst(data.x, data.y, data.tier, 'drop', 14);
    if (type === 'hit') this.hitDust(data);
    if (type === 'merge') this.mergeEffect(data);
    if (type === 'bigbang') this.bigBang(data);
    if (type === 'warning') this.shake = Math.max(this.shake, 3 + data.level * 6);
    if (type === 'dead') { this.shake = 18; this.flash = 0.45; }
  }

  rand(seed) {
    const x = Math.sin(seed * 999.13 + this.time * 7.1) * 43758.5453;
    return x - Math.floor(x);
  }

  burst(x, y, tier, kind, n) {
    const def = TIERS[tier];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * (100 + tier * 24);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.5 + Math.random() * (2 + tier * 0.35),
        life: 0.35 + Math.random() * 0.55,
        max: 0.9, color: def.glow, kind,
      });
    }
  }

  hitDust({ x, y, tier, power }) {
    if (power < 120) return;
    this.burst(x, y, tier, 'hit', Math.min(12, Math.floor(power / 45)));
  }

  mergeEffect(d) {
    const tier = d.nextTier;
    const def = TIERS[tier];
    this.shake = Math.max(this.shake, 2 + tier * 1.3 + d.combo * 0.8);
    if (tier >= 8) this.flash = Math.max(this.flash, tier === 8 ? 0.22 : 0.34);
    this.rings.push({ x: d.x, y: d.y, r: 8, max: 52 + tier * 22, life: 0.55 + tier * 0.04, color: def.glow, width: 3 + tier * 0.35 });
    this.popups.push({ x: d.x, y: d.y - def.r, text: `+${d.score}`, life: 0.9, max: 0.9, size: 18 + tier * 1.6, color: def.glow });
    if (d.combo > 1) this.popups.push({ x: d.x, y: d.y - def.r - 30, text: `${d.combo} COMBO`, life: 0.9, max: 0.9, size: 22 + d.combo * 2.2, color: '#ffffff' });

    const counts = [18, 18, 22, 28, 32, 36, 42, 46, 64, 86, 74];
    for (let i = 0; i < counts[tier]; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * (90 + tier * 26);
      const life = 0.45 + Math.random() * (0.55 + tier * 0.04);
      const color = this.effectColor(tier, i);
      this.particles.push({
        x: d.x, y: d.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.2 + Math.random() * (2.4 + tier * 0.32),
        life, max: life, color, kind: `tier${tier}`,
        swirl: tier >= 7 ? (Math.random() - 0.5) * 5 : 0,
      });
    }
    if (tier === 9) {
      for (let k = 0; k < 3; k++) this.rings.push({ x: d.x, y: d.y, r: 5 + k * 20, max: 150 + k * 58, life: 0.75 + k * 0.18, color: k ? '#ff8754' : '#fff2a8', width: 8 - k });
    }
    if (tier === 10) {
      this.rings.push({ x: d.x, y: d.y, r: 120, max: 18, life: 0.8, color: '#b47cff', width: 10, inward: true });
    }
  }

  effectColor(tier, i) {
    const sets = [
      ['#dfffff', '#8cf7ff', '#ffffff'],
      ['#ffb37d', '#8c6758', '#ffd6aa'],
      ['#d8d1bd', '#888995', '#f0e8d7'],
      ['#cfffff', '#74e8ff', '#ffffff'],
      ['#dfddd5', '#b9b2a7', '#ffffff'],
      ['#ff8a56', '#c44134', '#ffd09a'],
      ['#54b1ff', '#6ff2ae', '#ffffff'],
      ['#ffdf8d', '#df8dff', '#fff7cd'],
      ['#fff078', '#ff7438', '#ffffff'],
      ['#ff5a46', '#ffa64d', '#ffe2a8'],
      ['#160921', '#9858ff', '#e2c6ff'],
    ];
    return sets[tier][i % sets[tier].length];
  }

  bigBang(d) {
    this.shake = 28;
    this.flash = 0.75;
    this.rings.push({ x: d.x, y: d.y, r: 180, max: 18, life: 1.0, color: '#c9a5ff', width: 14, inward: true });
    this.rings.push({ x: d.x, y: d.y, r: 8, max: 520, life: 1.2, color: '#ffffff', width: 18 });
    this.popups.push({ x: d.x, y: d.y - 150, text: `BIG BANG +${d.score}`, life: 1.4, max: 1.4, size: 34, color: '#fff' });
    for (let i = 0; i < 180; i++) this.particles.push({
      x: d.x, y: d.y,
      vx: Math.cos(i * 2.399) * (90 + Math.random() * 520),
      vy: Math.sin(i * 2.399) * (90 + Math.random() * 520),
      r: 1 + Math.random() * 5,
      life: 0.8 + Math.random() * 0.9, max: 1.7,
      color: i % 4 === 0 ? '#ffffff' : i % 4 === 1 ? '#b47cff' : i % 4 === 2 ? '#73f3ff' : '#ffdb6b',
      kind: 'bigbang',
    });
  }

  render(game, dtMs) {
    const dt = Math.min(dtMs, 80) / 1000;
    this.time += dt;
    if (Math.random() < dt * 0.18) this.shooting.push({ x: Math.random() * WORLD.w, y: Math.random() * 340, vx: -520, vy: 230, life: 0.8 });
    this.updateEffects(dt);

    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    this.drawBackground(ctx);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.shake = Math.max(0, this.shake - dt * 18);
    ctx.translate(this.offX + sx, this.offY + sy);
    ctx.scale(this.scale, this.scale);
    this.drawWorld(ctx, game);
    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, this.flash)})`;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      this.flash = Math.max(0, this.flash - dt * 1.7);
    }
    this.drawNext();
  }

  updateEffects(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.swirl) {
        const ax = -p.vy * p.swirl * dt;
        const ay = p.vx * p.swirl * dt;
        p.vx += ax; p.vy += ay;
      }
      p.vy += 70 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 0.8; p.vy *= 1 - dt * 0.8;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const p of this.popups) { p.life -= dt; p.y -= dt * 42; }
    this.popups = this.popups.filter((p) => p.life > 0);
    for (const s of this.shooting) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.shooting = this.shooting.filter((s) => s.life > 0);
  }

  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
    g.addColorStop(0, '#030712'); g.addColorStop(0.45, '#06122d'); g.addColorStop(1, '#01030a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);
    for (const s of this.stars) {
      const tw = 0.55 + Math.sin(this.time * (0.6 + s.layer * 0.2) + s.x) * 0.25;
      ctx.fillStyle = `rgba(210,235,255,${s.a * tw})`;
      ctx.beginPath(); ctx.arc(s.x, (s.y + this.time * s.layer * 7) % WORLD.h, s.r, 0, Math.PI * 2); ctx.fill();
    }
    const neb = ctx.createRadialGradient(WORLD.w * 0.68, WORLD.h * 0.24, 20, WORLD.w * 0.68, WORLD.h * 0.24, 360);
    neb.addColorStop(0, 'rgba(94, 45, 180, 0.22)');
    neb.addColorStop(0.45, 'rgba(28, 190, 210, 0.09)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    for (const s of this.shooting) {
      ctx.strokeStyle = `rgba(200,245,255,${s.life})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.08, s.y - s.vy * 0.08); ctx.stroke();
    }
    ctx.restore();
  }

  drawWorld(ctx, game) {
    this.drawContainer(ctx, game);
    this.drawAim(ctx, game);
    for (const b of game.bodies) this.drawBody(ctx, b, this.time);
    for (const r of this.rings) this.drawRing(ctx, r);
    for (const p of this.particles) this.drawParticle(ctx, p);
    for (const p of this.popups) this.drawPopup(ctx, p);
  }

  drawContainer(ctx, game) {
    ctx.save();
    ctx.strokeStyle = 'rgba(137,232,255,0.72)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#56d9ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(WORLD.left, WORLD.top);
    ctx.lineTo(WORLD.left, WORLD.floor);
    ctx.quadraticCurveTo(WORLD.w / 2, WORLD.floor + 34, WORLD.right, WORLD.floor);
    ctx.lineTo(WORLD.right, WORLD.top);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(90,210,255,0.035)';
    ctx.fillRect(WORLD.left, WORLD.top, WORLD.right - WORLD.left, WORLD.floor - WORLD.top);
    const warn = clamp(game.warning / PHYSICS.warningTime, 0, 1);
    ctx.setLineDash([14, 10]);
    ctx.strokeStyle = warn > 0 ? `rgba(255,90,85,${0.35 + warn * 0.6})` : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2 + warn * 4;
    ctx.beginPath(); ctx.moveTo(WORLD.left + 8, WORLD.deadLine); ctx.lineTo(WORLD.right - 8, WORLD.deadLine); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawAim(ctx, game) {
    const canDrop = game.cooldown <= 0 && game.state === 'playing';
    ctx.save();
    ctx.strokeStyle = canDrop ? 'rgba(180,245,255,0.82)' : 'rgba(180,245,255,0.25)';
    ctx.setLineDash([6, 12]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(game.aimX, WORLD.spawnY + 26); ctx.lineTo(game.aimX, WORLD.floor - 16); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = canDrop ? '#eaffff' : '#789';
    ctx.beginPath(); ctx.moveTo(game.aimX, WORLD.spawnY - 18); ctx.lineTo(game.aimX - 14, WORLD.spawnY + 8); ctx.lineTo(game.aimX + 14, WORLD.spawnY + 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawBody(ctx, b, t) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    const def = TIERS[b.tier];
    ctx.shadowColor = def.glow;
    ctx.shadowBlur = 10 + b.tier * 2;
    const g = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.38, b.r * 0.1, 0, 0, b.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.24, def.color);
    g.addColorStop(1, b.tier === 10 ? '#030106' : '#111827');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    this.decorateBody(ctx, b, t);
    ctx.restore();
  }

  decorateBody(ctx, b, t) {
    const r = b.r;
    ctx.lineWidth = Math.max(1.5, r * 0.035);
    if (b.tier <= 2) {
      ctx.fillStyle = 'rgba(20,20,25,0.28)';
      for (let i = 0; i < 5 + b.tier; i++) {
        const a = i * 2.1 + b.id;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.38, r * (0.09 + (i % 3) * 0.02), 0, Math.PI * 2); ctx.fill();
      }
    }
    if (b.tier === 3) {
      ctx.strokeStyle = 'rgba(185,250,255,0.8)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.bezierCurveTo(-r * 1.2, -r * 0.1, -r * 1.7, -r * 0.5, -r * 2.2, -r * 0.9); ctx.stroke();
    }
    if (b.tier === 4) {
      ctx.fillStyle = 'rgba(95,90,86,0.22)';
      for (let i = 0; i < 7; i++) { const a = i * 1.7; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.45, r * 0.09, 0, Math.PI * 2); ctx.fill(); }
    }
    if (b.tier === 5) {
      ctx.strokeStyle = 'rgba(120,50,40,0.38)';
      for (let y = -0.45; y <= 0.45; y += 0.28) { ctx.beginPath(); ctx.ellipse(0, y * r, r * 0.82, r * 0.12, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (b.tier === 6) {
      ctx.fillStyle = '#51d18c';
      for (let i = 0; i < 4; i++) { const a = i * 1.8 + Math.sin(t * 0.25) * 0.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.25, r * 0.22, r * 0.09, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(Math.sin(t * 0.35) * r * 0.12, -r * 0.08, r * 0.78, r * 0.22, 0.15, 0, Math.PI * 2); ctx.stroke();
    }
    if (b.tier === 7) {
      ctx.strokeStyle = 'rgba(255,232,170,0.85)';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r * 0.34, Math.sin(t * 1.5 + b.id) * 0.25, 0, Math.PI * 2); ctx.stroke();
    }
    if (b.tier === 8) {
      ctx.strokeStyle = 'rgba(255,118,50,0.75)';
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + t * 1.2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); ctx.lineTo(Math.cos(a) * r * (1.0 + 0.12 * Math.sin(t * 5 + i)), Math.sin(a) * r * (1.0 + 0.12 * Math.sin(t * 5 + i))); ctx.stroke();
      }
    }
    if (b.tier === 9) {
      ctx.strokeStyle = 'rgba(255,205,120,0.36)';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.72 + i * 0.12 + Math.sin(t * 2 + i) * 0.025), 0, Math.PI * 2); ctx.stroke(); }
    }
    if (b.tier === 10) {
      ctx.strokeStyle = '#b47cff';
      ctx.lineWidth = r * 0.08;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.02, r * 0.34, t * 1.9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawRing(ctx, r) {
    if (!r.maxLife) r.maxLife = r.life;
    const t = 1 - r.life / Math.max(0.001, r.maxLife);
    const radius = lerp(r.r, r.max, clamp(t, 0, 1));
    ctx.save();
    ctx.globalAlpha = clamp(r.life / r.maxLife, 0, 1);
    ctx.strokeStyle = r.color; ctx.lineWidth = r.width;
    ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, radius), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawParticle(ctx, p) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawPopup(ctx, p) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 12;
    ctx.font = `900 ${p.size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }

  drawNext() {
    const ctx = this.nextCtx;
    ctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    ctx.save();
    ctx.translate(56, 44);
    const ghost = { tier: this.nextTier, x: 0, y: 0, r: Math.min(TIERS[this.nextTier].r, 34), id: 999, angle: this.time * 0.8 };
    this.drawBody(ctx, ghost, this.time);
    ctx.restore();
  }
}
