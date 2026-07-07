(function () {
  'use strict';
  const C = window.HellbreakConstants;
  const KEY_BITS = { r: 1, b: 2, y: 4 };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function len(x, z) { return Math.sqrt(x * x + z * z); }
  function dist(a, b) { return len(a.x - b.x, a.z - b.z); }
  function normAng(a) { while (a < -Math.PI) a += Math.PI * 2; while (a > Math.PI) a -= Math.PI * 2; return a; }
  function cellKey(x, z) { return x + ',' + z; }

  function HellbreakGame(options) {
    options = options || {};
    this.seed = options.seed || 0;
    this.rng = new HellbreakRng(this.seed);
    this.listeners = [];
    this.validation = C.LEVELS.map(validateLevel);
    this.levelIndex = 0;
    this.mode = 'title';
    this.paused = false;
    this.input = { mx: 0, mz: 0, turn: 0, fire: false, use: false };
    this.godMode = false;
    this.totalKills = 0;
    this.loadLevel(1, true);
  }

  HellbreakGame.prototype.on = function (fn) { this.listeners.push(fn); };
  HellbreakGame.prototype.emit = function (type, data) {
    data = data || {};
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i](type, data);
  };
  HellbreakGame.prototype.start = function () { if (this.mode === 'title') this.mode = 'play'; };
  HellbreakGame.prototype.restart = function () { this.loadLevel(this.levelIndex + 1); this.mode = 'play'; };
  HellbreakGame.prototype.setLevel = function (n) { this.loadLevel(n); this.mode = 'play'; };
  HellbreakGame.prototype.loadLevel = function (n, silent) {
    this.levelIndex = clamp((n || 1) - 1, 0, C.LEVELS.length - 1);
    this.level = parseLevel(C.LEVELS[this.levelIndex]);
    this.player = { x: this.level.start.x, z: this.level.start.z, vx: 0, vz: 0, yaw: this.level.start.yaw, hp: 100, armor: 0, keys: 0 };
    this.weapon = 'pistol';
    this.ammo = { bullet: 42, shell: this.levelIndex ? 8 : 0 };
    this.timeMs = 0;
    this.acc = 0;
    this.fireCooldown = 0;
    this.faceMood = 'normal';
    this.faceT = 0;
    this.weaponKick = 0;
    this.shake = 0;
    this.flash = { red: 0, pickup: 0, color: '#fff' };
    this.projectiles = [];
    this.particles = [];
    this.deadBodies = [];
    this.kills = 0;
    this.totalEnemies = this.level.enemies.length;
    this.result = null;
    if (!silent) this.emit('level', { level: this.levelIndex + 1 });
  };
  HellbreakGame.prototype.setMove = function (x, z) { this.input.mx = clamp(x || 0, -1, 1); this.input.mz = clamp(z || 0, -1, 1); };
  HellbreakGame.prototype.turn = function (deg) { this.player.yaw += (deg || 0) * Math.PI / 180; };
  HellbreakGame.prototype.setTurn = function (dx) { this.input.turn += dx || 0; };
  HellbreakGame.prototype.setFire = function (on) { this.input.fire = !!on; };
  HellbreakGame.prototype.setUse = function () { this.input.use = true; };
  HellbreakGame.prototype.update = function (dtMs) {
    dtMs = clamp(dtMs || 0, 0, 100);
    if (this.paused || this.mode === 'title' || this.mode === 'result' || this.mode === 'ending' || this.mode === 'dead') return;
    this.acc += dtMs;
    while (this.acc >= C.STEP_MS) {
      this.step(C.STEP_MS);
      this.acc -= C.STEP_MS;
    }
  };
  HellbreakGame.prototype.step = function (dtMs) {
    const dt = dtMs / 1000;
    this.timeMs += dtMs;
    this.player.yaw = normAng(this.player.yaw + this.input.turn * C.TURN_SPEED);
    this.input.turn = 0;
    this.fireCooldown = Math.max(0, this.fireCooldown - dtMs);
    this.weaponKick = Math.max(0, this.weaponKick - dt * 6);
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.flash.red = Math.max(0, this.flash.red - dt * 1.8);
    this.flash.pickup = Math.max(0, this.flash.pickup - dt * 2.8);
    this.faceT = Math.max(0, this.faceT - dtMs);
    if (this.faceT <= 0) this.faceMood = this.player.hp < 30 ? 'low' : 'normal';
    this.movePlayer(dt);
    if (this.input.use) this.tryUse();
    this.input.use = false;
    if (this.input.fire) this.tryFire();
    this.updateDoors(dt);
    this.updateEnemies(dtMs, dt);
    this.updateProjectiles(dtMs, dt);
    this.updateBarrels(dtMs);
    this.updateParticles(dt);
    this.checkPickups();
    this.checkExit();
    if (this.player.hp <= 0 && this.mode === 'play') {
      this.mode = 'dead';
      this.emit('dead', {});
    }
  };
  HellbreakGame.prototype.movePlayer = function (dt) {
    const p = this.player;
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    let ax = sy * this.input.mz - cy * this.input.mx;
    let az = cy * this.input.mz + sy * this.input.mx;
    const l = len(ax, az);
    if (l > 1) { ax /= l; az /= l; }
    p.vx += ax * C.MOVE_SPEED * C.FRICTION * dt;
    p.vz += az * C.MOVE_SPEED * C.FRICTION * dt;
    p.vx *= Math.max(0, 1 - C.FRICTION * dt);
    p.vz *= Math.max(0, 1 - C.FRICTION * dt);
    const sp = len(p.vx, p.vz);
    if (sp > C.MOVE_SPEED) { p.vx = p.vx / sp * C.MOVE_SPEED; p.vz = p.vz / sp * C.MOVE_SPEED; }
    this.moveCircle(p, p.vx * dt, 0);
    this.moveCircle(p, 0, p.vz * dt);
  };
  HellbreakGame.prototype.moveCircle = function (obj, dx, dz) {
    obj.x += dx; obj.z += dz;
    const r = obj.radius || C.PLAYER_RADIUS;
    const cx = Math.floor(obj.x), cz = Math.floor(obj.z);
    for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (!this.blocked(x, z)) continue;
      const qx = clamp(obj.x, x, x + 1), qz = clamp(obj.z, z, z + 1);
      let vx = obj.x - qx, vz = obj.z - qz, d = len(vx, vz);
      if (d < r) {
        if (d < 0.0001) { vx = dx ? Math.sign(dx) : 1; vz = dz ? Math.sign(dz) : 0; d = 1; }
        obj.x += vx / d * (r - d);
        obj.z += vz / d * (r - d);
      }
    }
  };
  HellbreakGame.prototype.blocked = function (x, z) {
    if (x < 0 || z < 0 || x >= this.level.w || z >= this.level.h) return true;
    const ch = this.level.cells[z][x];
    if (ch === '#') return true;
    if ('RBYD'.indexOf(ch) >= 0 && !this.level.open[cellKey(x, z)]) return true;
    return ch === ' ';
  };
  HellbreakGame.prototype.tryUse = function () {
    const p = this.player;
    const fx = Math.floor(p.x + Math.sin(p.yaw) * 0.8), fz = Math.floor(p.z + Math.cos(p.yaw) * 0.8);
    const ch = this.level.cells[fz] && this.level.cells[fz][fx];
    if ('RBY'.indexOf(ch) >= 0) {
      const bit = KEY_BITS[ch.toLowerCase()];
      if (p.keys & bit) { this.level.open[cellKey(fx, fz)] = true; this.emit('door', { x: fx, z: fz }); }
      else this.emit('locked', {});
    }
    if (ch === 'D') { this.level.open[cellKey(fx, fz)] = true; this.emit('door', { x: fx, z: fz }); }
    for (let i = 0; i < this.level.switches.length; i++) {
      const sw = this.level.switches[i];
      if (Math.abs(sw.x + 0.5 - p.x) < 1.1 && Math.abs(sw.z + 0.5 - p.z) < 1.1) {
        for (let k in this.level.switchDoors) this.level.open[k] = true;
        this.emit('switch', {});
      }
    }
  };
  HellbreakGame.prototype.tryFire = function () {
    if (this.mode !== 'play' || this.fireCooldown > 0) return;
    const w = C.WEAPONS[this.weapon], ammoType = w.ammo;
    if (this.weapon !== 'pistol') {
      if ((this.ammo[ammoType] || 0) <= 0) { this.selectWeapon('pistol'); return; }
      this.ammo[ammoType]--;
    }
    this.fireCooldown = w.delay;
    this.weaponKick = w.kick;
    this.faceMood = 'fire';
    this.faceT = 170;
    this.emit('fire', { weapon: this.weapon });
    for (let i = 0; i < w.pellets; i++) {
      const spread = (this.rng.next() - 0.5) * w.spread + (w.pellets > 1 ? (i - (w.pellets - 1) / 2) * w.spread * 0.28 : 0);
      this.traceShot(this.player.yaw + spread, w.damage, w.range);
    }
  };
  HellbreakGame.prototype.traceShot = function (ang, damage, range) {
    const ox = this.player.x, oz = this.player.z, dx = Math.sin(ang), dz = Math.cos(ang);
    let best = { t: range, thing: null, type: '' };
    for (let t = 0.08; t <= range; t += 0.08) {
      const x = ox + dx * t, z = oz + dz * t;
      if (this.blocked(Math.floor(x), Math.floor(z))) { best.t = t; break; }
    }
    for (let i = 0; i < this.level.enemies.length; i++) {
      const e = this.level.enemies[i];
      if (e.dead) continue;
      const hit = rayCircle(ox, oz, dx, dz, e.x, e.z, e.radius || C.ENEMIES[e.type].radius, best.t);
      if (hit >= 0 && hit < best.t) best = { t: hit, thing: e, type: 'enemy' };
    }
    for (let b = 0; b < this.level.barrels.length; b++) {
      const br = this.level.barrels[b];
      if (br.dead) continue;
      const hb = rayCircle(ox, oz, dx, dz, br.x, br.z, 0.32, best.t);
      if (hb >= 0 && hb < best.t) best = { t: hb, thing: br, type: 'barrel' };
    }
    const hx = ox + dx * best.t, hz = oz + dz * best.t;
    this.emit('impact', { x: hx, z: hz });
    if (best.thing) {
      if (best.type === 'enemy') this.damageEnemy(best.thing, damage);
      else this.hitBarrel(best.thing, damage);
    }
  };
  HellbreakGame.prototype.damageEnemy = function (e, dmg) {
    e.hp -= dmg;
    e.pain = 220;
    this.emit('enemyHit', { x: e.x, z: e.z, type: e.type });
    if (e.hp <= 0 && !e.dead) {
      e.dead = true; e.deathT = 0; this.kills++; this.totalKills++;
      this.deadBodies.push({ x: e.x, z: e.z, type: e.type, t: 0 });
      this.splatter(e.x, e.z, 10);
      this.emit('enemyDead', { x: e.x, z: e.z, type: e.type });
    }
  };
  HellbreakGame.prototype.updateEnemies = function (dtMs, dt) {
    for (let i = 0; i < this.level.enemies.length; i++) {
      const e = this.level.enemies[i], def = C.ENEMIES[e.type];
      if (e.dead) { e.deathT += dtMs; continue; }
      e.pain = Math.max(0, e.pain - dtMs);
      e.cooldown = Math.max(0, e.cooldown - dtMs);
      const d = dist(e, this.player);
      if (this.canSee(e.x, e.z, this.player.x, this.player.z) || d < 5) e.awake = true;
      if (!e.awake || e.pain > 0) continue;
      const vx = (this.player.x - e.x) / Math.max(0.001, d), vz = (this.player.z - e.z) / Math.max(0.001, d);
      const los = this.canSee(e.x, e.z, this.player.x, this.player.z);
      if (e.type === 'imp' && d < def.range && e.cooldown <= 0 && los) {
        this.projectiles.push({ x: e.x, z: e.z, vx: vx * 3.0, vz: vz * 3.0, damage: def.damage, life: 2800 });
        e.cooldown = def.attackMs;
        this.emit('cast', { x: e.x, z: e.z });
      } else if (e.type !== 'imp' && d < def.range && e.cooldown <= 0 && los) {
        // 近接は視線必須。impはrangeが火球用(7.2m)なのでこの分岐に入れると壁越し攻撃になる
        this.hurt(def.damage);
        e.cooldown = def.attackMs;
        this.emit('claw', { x: e.x, z: e.z });
      } else if (d > def.range * 0.85 || !los) {
        const sp = def.speed * (e.type === 'brute' && d < 4 ? 1.75 : 1);
        e.x += vx * sp * dt; this.moveCircle(e, 0, 0);
        e.z += vz * sp * dt; this.moveCircle(e, 0, 0);
      }
    }
  };
  HellbreakGame.prototype.canSee = function (x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1, d = len(dx, dz);
    const steps = Math.ceil(d / 0.18);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocked(Math.floor(x1 + dx * t), Math.floor(z1 + dz * t))) return false;
    }
    return true;
  };
  HellbreakGame.prototype.updateProjectiles = function (dtMs, dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dtMs;
      if (this.blocked(Math.floor(p.x), Math.floor(p.z)) || p.life <= 0) { this.projectiles.splice(i, 1); continue; }
      if (len(p.x - this.player.x, p.z - this.player.z) < 0.32) {
        this.hurt(p.damage); this.projectiles.splice(i, 1); this.emit('fireballHit', {});
      }
    }
  };
  HellbreakGame.prototype.hurt = function (amount) {
    if (this.godMode) return;
    const p = this.player;
    const armorTake = Math.min(p.armor, Math.ceil(amount * 0.55));
    p.armor -= armorTake;
    p.hp = clamp(p.hp - (amount - armorTake), 0, 100);
    this.flash.red = 1;
    this.shake = Math.max(this.shake, 0.8);
    this.faceMood = 'pain';
    this.faceT = 420;
    this.emit('hurt', { amount: amount });
  };
  HellbreakGame.prototype.hitBarrel = function (br) { br.hp -= 40; if (br.hp <= 0 && !br.dead) this.explodeBarrel(br); };
  HellbreakGame.prototype.updateBarrels = function () {};
  HellbreakGame.prototype.explodeBarrel = function (br) {
    br.dead = true;
    this.shake = Math.max(this.shake, 1.8);
    this.emit('explode', { x: br.x, z: br.z });
    this.splatter(br.x, br.z, 22, true);
    if (dist(br, this.player) < 2.4) this.hurt(Math.ceil((2.4 - dist(br, this.player)) * 28));
    for (let i = 0; i < this.level.enemies.length; i++) {
      const e = this.level.enemies[i];
      if (!e.dead && dist(br, e) < 2.8) this.damageEnemy(e, Math.ceil((2.8 - dist(br, e)) * 55));
    }
    for (let j = 0; j < this.level.barrels.length; j++) {
      const b = this.level.barrels[j];
      if (!b.dead && b !== br && dist(br, b) < 2.2) b.hp = -1, this.explodeBarrel(b);
    }
  };
  HellbreakGame.prototype.splatter = function (x, z, n, fire) {
    for (let i = 0; i < n; i++) this.particles.push({ x: x, z: z, vx: this.rng.range(-1.8, 1.8), vz: this.rng.range(-1.8, 1.8), life: this.rng.range(0.25, 0.75), fire: !!fire });
  };
  HellbreakGame.prototype.updateParticles = function (dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  };
  HellbreakGame.prototype.updateDoors = function () {};
  HellbreakGame.prototype.checkPickups = function () {
    const list = this.level.pickups, p = this.player;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (len(it.x - p.x, it.z - p.z) > 0.45) continue;
      if (it.type === 'health') p.hp = clamp(p.hp + it.amount, 0, 100);
      if (it.type === 'armor') p.armor = clamp(p.armor + it.amount, 0, 100);
      if (it.type === 'bullet') this.ammo.bullet += it.amount;
      if (it.type === 'shell') this.ammo.shell += it.amount;
      if (it.type === 'key') p.keys |= KEY_BITS[it.key];
      list.splice(i, 1);
      this.faceMood = 'grin'; this.faceT = 420;
      this.flash.pickup = 1; this.flash.color = it.color || '#fff';
      this.emit('pickup', { type: it.type, key: it.key });
    }
  };
  HellbreakGame.prototype.checkExit = function () {
    const ex = this.level.exit;
    if (ex && len(ex.x + 0.5 - this.player.x, ex.z + 0.5 - this.player.z) < 0.65) this.finishLevel();
  };
  HellbreakGame.prototype.finishLevel = function () {
    if (this.mode !== 'play') return;
    this.result = { kills: this.kills, total: this.totalEnemies, timeMs: this.timeMs, level: this.levelIndex + 1 };
    if (this.levelIndex + 1 >= C.LEVELS.length) this.mode = 'ending';
    else this.mode = 'result';
    this.emit('clear', this.result);
  };
  HellbreakGame.prototype.nextLevel = function () {
    if (this.mode === 'result') { this.loadLevel(this.levelIndex + 2); this.mode = 'play'; }
  };
  HellbreakGame.prototype.selectWeapon = function (w) {
    if (C.WEAPONS[w]) { this.weapon = w; this.emit('weapon', { weapon: w }); }
  };
  HellbreakGame.prototype.cycleWeapon = function (dir) {
    const a = ['pistol', 'shotgun', 'chaingun'];
    this.selectWeapon(a[(a.indexOf(this.weapon) + (dir > 0 ? 1 : 2)) % 3]);
  };
  HellbreakGame.prototype.getState = function () {
    return {
      mode: this.mode, paused: this.paused, level: this.levelIndex + 1, levelName: this.level.def.name,
      timeMs: this.timeMs, hp: this.player.hp, armor: this.player.armor, keys: {
        red: !!(this.player.keys & 1), blue: !!(this.player.keys & 2), yellow: !!(this.player.keys & 4)
      },
      weapon: this.weapon, ammo: { bullet: this.ammo.bullet, shell: this.ammo.shell },
      position: { x: this.player.x, z: this.player.z, yaw: this.player.yaw },
      enemies: this.level.enemies.filter(function (e) { return !e.dead; }).map(function (e) { return { type: e.type, hp: e.hp, x: e.x, z: e.z }; }),
      projectiles: this.projectiles.slice(), particles: this.particles.slice(), barrels: this.level.barrels, pickups: this.level.pickups,
      kills: this.kills, totalEnemies: this.totalEnemies, flash: this.flash, shake: this.shake, face: this.faceMood, weaponKick: this.weaponKick,
      validation: this.validation, result: this.result
    };
  };
  HellbreakGame.prototype.dump = function () {
    const rows = this.level.cells.map(function (r) { return r.slice(); });
    rows[Math.floor(this.player.z)][Math.floor(this.player.x)] = 'P';
    this.level.enemies.forEach(function (e) { if (!e.dead) rows[Math.floor(e.z)][Math.floor(e.x)] = e.type[0]; });
    return rows.map(function (r) { return r.join(''); }).join('\n');
  };
  HellbreakGame.prototype.teleport = function (x, z) { this.player.x = x; this.player.z = z; };
  HellbreakGame.prototype.spawn = function (type, distAhead) {
    const d = distAhead || 2.5, p = this.player;
    const e = makeEnemy(type || 'grunt', p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d);
    this.level.enemies.push(e); this.totalEnemies++; return e;
  };
  HellbreakGame.prototype.killAll = function () { for (let i = 0; i < this.level.enemies.length; i++) if (!this.level.enemies[i].dead) this.damageEnemy(this.level.enemies[i], 9999); };
  HellbreakGame.prototype.god = function () { this.godMode = !this.godMode; return this.godMode; };
  HellbreakGame.prototype.give = function (what) {
    if (what === 'keys') this.player.keys = 7;
    if (what === 'ammo') { this.ammo.bullet += 200; this.ammo.shell += 40; }
    if (what === 'health') this.player.hp = 100;
    if (what === 'armor') this.player.armor = 100;
  };
  HellbreakGame.prototype.openAllDoors = function () { for (let z = 0; z < this.level.h; z++) for (let x = 0; x < this.level.w; x++) if ('RBYD'.indexOf(this.level.cells[z][x]) >= 0) this.level.open[cellKey(x, z)] = true; };

  function parseLevel(def) {
    const h = def.rows.length, w = Math.max.apply(null, def.rows.map(function (r) { return r.length; }));
    const cells = [], enemies = [], pickups = [], barrels = [], switches = [], switchDoors = {};
    let start = { x: 1.5, z: 1.5, yaw: 0 }, exit = null;
    for (let z = 0; z < h; z++) {
      cells[z] = [];
      for (let x = 0; x < w; x++) {
        const ch = def.rows[z][x] || ' ';
        cells[z][x] = ch;
        const wx = x + 0.5, wz = z + 0.5;
        if (ch === 'S') start = { x: wx, z: wz, yaw: 0 };
        if (ch === 'X') exit = { x: x, z: z };
        if (ch === 'g') enemies.push(makeEnemy('grunt', wx, wz));
        if (ch === 'i') enemies.push(makeEnemy('imp', wx, wz));
        if (ch === 'u') enemies.push(makeEnemy('brute', wx, wz));
        if (ch === 'O') barrels.push({ x: wx, z: wz, hp: 40, dead: false });
        if (ch === 'T') switches.push({ x: x, z: z });
        if (ch === 'D') switchDoors[cellKey(x, z)] = true;
        if (ch === 'h') pickups.push({ type: 'health', amount: 25, x: wx, z: wz, color: '#46ff70' });
        if (ch === 'A') pickups.push({ type: 'armor', amount: 60, x: wx, z: wz, color: '#4bd4ff' });
        if (ch === 'M') pickups.push({ type: 'bullet', amount: 80, x: wx, z: wz, color: '#ffe04b' });
        if (ch === 'G') pickups.push({ type: 'shell', amount: 12, x: wx, z: wz, color: '#ff9d35' });
        if ('rby'.indexOf(ch) >= 0) pickups.push({ type: 'key', key: ch, x: wx, z: wz, color: ch === 'r' ? '#ff2d2d' : ch === 'b' ? '#3478ff' : '#ffe333' });
      }
    }
    return { def: def, w: w, h: h, cells: cells, start: start, exit: exit, enemies: enemies, pickups: pickups, barrels: barrels, switches: switches, switchDoors: switchDoors, open: {} };
  }
  function makeEnemy(type, x, z) {
    const d = C.ENEMIES[type];
    return { type: type, x: x, z: z, hp: d.hp, radius: d.radius, awake: false, cooldown: 300, pain: 0, dead: false, deathT: 0 };
  }
  function rayCircle(ox, oz, dx, dz, cx, cz, r, maxT) {
    const lx = cx - ox, lz = cz - oz, t = lx * dx + lz * dz;
    if (t < 0 || t > maxT) return -1;
    const px = ox + dx * t, pz = oz + dz * t;
    const d2 = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    return d2 <= r * r ? t : -1;
  }
  function validateLevel(def) {
    const lv = parseLevel(def), q = [], seen = {};
    q.push({ x: Math.floor(lv.start.x), z: Math.floor(lv.start.z), keys: 0, sw: 0 });
    seen[cellKey(q[0].x, q[0].z) + ',0,0'] = true;
    let ok = false, states = 0;
    while (q.length) {
      const s = q.shift(); states++;
      if (lv.exit && s.x === lv.exit.x && s.z === lv.exit.z) { ok = true; break; }
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (let i = 0; i < dirs.length; i++) {
        const nx = s.x + dirs[i][0], nz = s.z + dirs[i][1];
        if (nx < 0 || nz < 0 || nx >= lv.w || nz >= lv.h) continue;
        const ch = lv.cells[nz][nx];
        if (ch === '#' || ch === ' ') continue;
        if (ch === 'R' && !(s.keys & 1)) continue;
        if (ch === 'B' && !(s.keys & 2)) continue;
        if (ch === 'Y' && !(s.keys & 4)) continue;
        if (ch === 'D' && !s.sw) continue;
        let keys = s.keys, sw = s.sw;
        if ('rby'.indexOf(ch) >= 0) keys |= KEY_BITS[ch];
        if (ch === 'T') sw = 1;
        const key = cellKey(nx, nz) + ',' + keys + ',' + sw;
        if (!seen[key]) { seen[key] = true; q.push({ x: nx, z: nz, keys: keys, sw: sw }); }
      }
    }
    return { level: def.id, ok: ok, states: states, message: ok ? 'reachable with keys/switches' : 'exit not reachable' };
  }
  window.HellbreakGame = HellbreakGame;
})();
