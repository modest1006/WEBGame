class Game {
  constructor({ seed = 0 } = {}) {
    this.seedValue = seed;
    this.listeners = [];
    this.state = 'title';
    this.aimX = WORLD.w / 2;
    this.best = 0;
    try { this.best = Number(localStorage.getItem(BEST_KEY) || 0); } catch (_) {}
    this.resetRun();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) {
    for (const fn of this.listeners) {
      try { fn(type, data); } catch (err) { console.error('[game event]', type, err); }
    }
  }

  resetRun() {
    this.rng = new RNG(this.seedValue);
    this.time = 0;
    this.acc = 0;
    this.bodies = [];
    this.nextId = 1;
    this.score = 0;
    this.combo = 0;
    this.comboFlash = 0;
    this.chainForDrop = 0;
    this.dropSerial = 0;
    this.cooldown = 0;
    this.warning = 0;
    this.contacts = 0;
    this.highestTier = 0;
    this.reached = Array(TIERS.length).fill(false);
    this.nextTier = this.rollNextTier();
    this.forcedNext = null;
    this.mergeLock = new Set();
    this.state = this.state === 'title' ? 'title' : 'playing';
  }

  start() {
    this.resetRun();
    this.state = 'playing';
    this.emit('start');
    this.emit('next', { tier: this.nextTier });
  }

  rollNextTier() { return DROP_TIERS[Math.floor(this.rng.next() * DROP_TIERS.length)]; }
  setAim(x) { this.aimX = clamp(x, WORLD.left + 18, WORLD.right - 18); }

  drop() {
    if (this.state === 'title') { this.start(); return true; }
    if (this.state === 'dead' || this.cooldown > 0 || this.state !== 'playing') return false;
    const tier = this.forcedNext ?? this.nextTier;
    this.forcedNext = null;
    const def = TIERS[tier];
    const body = this.createBody(tier, this.aimX, WORLD.spawnY, 0, 70, { fresh: true, dropId: ++this.dropSerial });
    body.spin = this.rng.range(-0.7, 0.7);
    this.chainForDrop = 0;
    this.combo = 0;
    this.cooldown = PHYSICS.dropCooldown;
    this.nextTier = this.rollNextTier();
    this.emit('drop', { tier, x: body.x, y: body.y, r: def.r });
    this.emit('next', { tier: this.nextTier });
    return true;
  }

  createBody(tier, x, y, vx = 0, vy = 0, extra = {}) {
    const def = TIERS[tier];
    const mass = def.mass;
    const b = {
      id: this.nextId++,
      tier, x, y, vx, vy,
      r: def.r, mass, invMass: 1 / mass,
      angle: this.rng.range(0, Math.PI * 2),
      spin: this.rng.range(-0.18, 0.18),
      age: 0, sleep: 0, dead: false,
      aboveTime: 0,
      justMerged: 0,
      dropId: extra.dropId ?? 0,
    };
    this.bodies.push(b);
    this.highestTier = Math.max(this.highestTier, tier);
    this.reached[tier] = true;
    return b;
  }

  update(dtMs) {
    if (this.state !== 'playing') return;
    this.acc += Math.min(dtMs, 80) / 1000;
    while (this.acc >= PHYSICS.step && this.state === 'playing') {
      this.tick(PHYSICS.step);
      this.acc -= PHYSICS.step;
    }
  }

  tick(dt) {
    this.time += dt;
    this.mergeLock.clear(); // dead体は既にfilter済み。持ち越すとSetが無限に育つ
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.comboFlash = Math.max(0, this.comboFlash - dt);
    this.integrate(dt);
    const mergePairs = [];
    this.contacts = 0;
    for (let k = 0; k < PHYSICS.iterations; k++) this.solveCollisions(mergePairs);
    this.handleMerges(mergePairs);
    this.checkOverflow(dt);
  }

  integrate(dt) {
    const drag = Math.max(0, 1 - WORLD.airDrag * dt);
    for (const b of this.bodies) {
      b.age += dt;
      b.justMerged = Math.max(0, b.justMerged - dt);
      b.vy += WORLD.gravity * dt;
      b.vx *= drag;
      b.vy *= drag;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;
      if (Math.hypot(b.vx, b.vy) < WORLD.sleepSpeed && Math.abs(b.spin) < WORLD.sleepAngular && b.y > WORLD.top + 80) {
        b.vx *= 0.88; b.vy *= 0.88; b.spin *= 0.82; b.sleep += dt;
        if (b.sleep > 0.6) { b.vx = 0; b.vy = 0; b.spin = 0; }
      } else {
        b.sleep = 0;
      }
    }
  }

  solveCollisions(mergePairs) {
    for (const b of this.bodies) this.solveWalls(b);
    const arr = this.bodies;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const penetration = rr - d;
        this.contacts++;
        if (a.tier === b.tier && !this.mergeLock.has(a.id) && !this.mergeLock.has(b.id)) {
          mergePairs.push([a, b, penetration]);
        }
        this.resolvePair(a, b, nx, ny, penetration);
      }
    }
  }

  solveWalls(b) {
    if (b.x - b.r < WORLD.left) this.resolveWall(b, 1, 0, WORLD.left - (b.x - b.r));
    if (b.x + b.r > WORLD.right) this.resolveWall(b, -1, 0, (b.x + b.r) - WORLD.right);
    if (b.y + b.r > WORLD.floor) this.resolveWall(b, 0, -1, (b.y + b.r) - WORLD.floor);
  }

  resolveWall(b, nx, ny, pen) {
    b.x += nx * pen;
    b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + WORLD.wallRestitution) * vn * nx;
      b.vy -= (1 + WORLD.wallRestitution) * vn * ny;
      const tx = -ny, ty = nx;
      const vt = b.vx * tx + b.vy * ty;
      b.vx -= tx * vt * WORLD.friction * 0.08;
      b.vy -= ty * vt * WORLD.friction * 0.08;
      b.spin += vt / Math.max(20, b.r) * 0.02;
      if (Math.abs(vn) > 100) this.emit('hit', { x: b.x, y: b.y, tier: b.tier, power: Math.abs(vn) });
    }
  }

  resolvePair(a, b, nx, ny, penetration) {
    const inv = a.invMass + b.invMass;
    const corr = Math.max(penetration - PHYSICS.correctionSlop, 0) / inv * PHYSICS.correctionPercent;
    a.x -= nx * corr * a.invMass; a.y -= ny * corr * a.invMass;
    b.x += nx * corr * b.invMass; b.y += ny * corr * b.invMass;

    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const velN = rvx * nx + rvy * ny;
    if (velN > 0) return;
    const j = -(1 + WORLD.bodyRestitution) * velN / inv;
    a.vx -= j * nx * a.invMass; a.vy -= j * ny * a.invMass;
    b.vx += j * nx * b.invMass; b.vy += j * ny * b.invMass;

    const tx = -ny, ty = nx;
    const vt = rvx * tx + rvy * ty;
    const jt = clamp(-vt / inv, -j * WORLD.friction, j * WORLD.friction);
    a.vx -= jt * tx * a.invMass; a.vy -= jt * ty * a.invMass;
    b.vx += jt * tx * b.invMass; b.vy += jt * ty * b.invMass;
    a.spin -= jt / Math.max(18, a.r) * 0.03;
    b.spin += jt / Math.max(18, b.r) * 0.03;
  }

  handleMerges(pairs) {
    if (pairs.length === 0) return;
    const used = new Set();
    pairs.sort((p, q) => q[2] - p[2]);
    for (const [a, b] of pairs) {
      if (a.dead || b.dead || used.has(a.id) || used.has(b.id) || a.tier !== b.tier) continue;
      used.add(a.id); used.add(b.id);
      this.mergeBodies(a, b);
    }
    if (used.size) this.bodies = this.bodies.filter((b) => !b.dead);
  }

  mergeBodies(a, b) {
    const tier = a.tier;
    a.dead = true; b.dead = true;
    this.mergeLock.add(a.id); this.mergeLock.add(b.id);
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const mass = a.mass + b.mass;
    const vx = (a.vx * a.mass + b.vx * b.mass) / mass;
    const vy = (a.vy * a.mass + b.vy * b.mass) / mass - 95;
    this.chainForDrop++;
    this.combo = this.chainForDrop;
    this.comboFlash = 1.2;

    if (tier >= TIERS.length - 1) {
      const cleared = this.bodies.filter((body) => !body.dead).length;
      const bonus = BIG_BANG_BONUS + cleared * 350;
      this.score += bonus;
      this.saveBest();
      this.bodies = [];
      this.mergeLock.clear();
      this.emit('bigbang', { x, y, tier, combo: this.combo, score: bonus, cleared });
      this.emit('score', { score: this.score, best: this.best });
      return;
    }

    const next = this.createBody(tier + 1, x, y, vx, vy, { dropId: Math.max(a.dropId, b.dropId) });
    next.justMerged = 0.2;
    next.spin = (a.spin + b.spin) * 0.4 + this.rng.range(-0.35, 0.35);
    const gained = tierScore(tier + 1, this.combo);
    this.score += gained;
    this.saveBest();
    this.emit('merge', { tier, nextTier: tier + 1, x, y, vx, vy, combo: this.combo, score: gained });
    this.emit('score', { score: this.score, best: this.best });
  }

  checkOverflow(dt) {
    let over = false;
    for (const b of this.bodies) {
      if (b.y - b.r < WORLD.deadLine && b.age > 0.7) {
        const slow = Math.hypot(b.vx, b.vy) < 95;
        b.aboveTime = slow ? b.aboveTime + dt : Math.max(0, b.aboveTime - dt * 0.8);
        over = over || b.aboveTime > 0.18;
        this.warning = Math.max(this.warning, b.aboveTime);
        if (b.aboveTime >= PHYSICS.warningTime) return this.gameOver();
      } else {
        b.aboveTime = Math.max(0, b.aboveTime - dt * 2);
      }
    }
    if (!over) this.warning = Math.max(0, this.warning - dt * 1.4);
    else if (!this._warnBeep || this.time - this._warnBeep > 0.55) {
      this._warnBeep = this.time;
      this.emit('warning', { level: clamp(this.warning / PHYSICS.warningTime, 0, 1) });
    }
  }

  saveBest() {
    if (this.score <= this.best) return;
    this.best = this.score;
    try { localStorage.setItem(BEST_KEY, String(this.best)); } catch (_) {}
  }

  gameOver() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.saveBest();
    this.emit('dead', { score: this.score, best: this.best, highestTier: this.highestTier });
  }

  spawnBody(tier, x, y) {
    const b = this.createBody(clamp(Math.floor(tier), 0, TIERS.length - 1), x, y, 0, 0);
    this.emit('spawn', { tier: b.tier, x: b.x, y: b.y });
    return b;
  }

  clearBoard() {
    this.bodies = [];
    this.warning = 0;
    this.mergeLock.clear();
    this.emit('clearboard');
  }

  getSnapshot() {
    return {
      state: this.state,
      time: Math.round(this.time * 100) / 100,
      score: this.score,
      best: this.best,
      combo: this.combo,
      cooldown: Math.round(this.cooldown * 100) / 100,
      aimX: Math.round(this.aimX),
      nextTier: this.nextTier,
      warning: Math.round(this.warning * 100) / 100,
      highestTier: this.highestTier,
      contacts: this.contacts,
      reached: [...this.reached],
      bodies: this.bodies.map((b) => ({
        id: b.id, tier: b.tier,
        x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10,
        vx: Math.round(b.vx * 10) / 10, vy: Math.round(b.vy * 10) / 10,
      })),
    };
  }

  dump() {
    const rows = 18, cols = 28;
    const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
    for (const b of this.bodies) {
      const cx = Math.floor((b.x - WORLD.left) / (WORLD.right - WORLD.left) * cols);
      const cy = Math.floor((b.y - WORLD.top) / (WORLD.floor - WORLD.top) * rows);
      if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy][cx] = String(Math.min(9, b.tier));
    }
    return [
      `state=${this.state} score=${this.score} next=${this.nextTier} combo=${this.combo}`,
      `bodies=${this.bodies.length} contacts=${this.contacts} warning=${this.warning.toFixed(2)}`,
      grid.map((r) => r.join('')).join('\n'),
    ].join('\n');
  }
}
