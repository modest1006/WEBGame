(function () {
  'use strict';
  const C = window.RollMazeConstants;
  const EPS = 0.00001;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function len(x, z) { return Math.sqrt(x * x + z * z); }

  function RollMazeGame(options) {
    options = options || {};
    this.rng = new window.RollMazeRng(options.seed || 0);
    this.listeners = [];
    this.records = this.loadRecords();
    this.unlocked = this.computeUnlocked();
    this.paused = false;
    this.stageIndex = 0;
    this.mode = 'select';
    this.acc = 0;
    this.events = [];
    this.targetTiltX = 0;
    this.targetTiltZ = 0;
    this.tiltX = 0;
    this.tiltZ = 0;
    this.restartStage(1);
    this.mode = 'select';
  }

  RollMazeGame.prototype.on = function (fn) { this.listeners.push(fn); };
  RollMazeGame.prototype.emit = function (type, data) {
    this.events.push({ type, data: data || {} });
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i](type, data || {});
  };
  RollMazeGame.prototype.loadRecords = function () {
    try { return JSON.parse(localStorage.getItem(C.STORAGE_KEY) || '{}') || {}; } catch (e) { return {}; }
  };
  RollMazeGame.prototype.saveRecords = function () {
    try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(this.records)); } catch (e) {}
  };
  RollMazeGame.prototype.computeUnlocked = function () {
    let n = 1;
    for (let i = 1; i <= C.STAGES.length; i++) if (this.records[i]) n = Math.min(C.STAGES.length, i + 1);
    return n;
  };
  RollMazeGame.prototype.getStageDef = function () { return C.STAGES[this.stageIndex]; };

  RollMazeGame.prototype.parseStage = function (def) {
    const rows = def.rows;
    const h = rows.length;
    const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const cells = [];
    const walls = [];
    const holes = [];
    const pads = [];
    const ice = [];
    const bars = [];
    let start = { x: 0, z: 0 }, goal = { x: 0, z: 0 };
    const checkpoints = [];
    for (let z = 0; z < h; z++) {
      cells[z] = [];
      for (let x = 0; x < w; x++) {
        const ch = rows[z][x] || ' ';
        cells[z][x] = ch;
        const wx = x - w / 2 + 0.5;
        const wz = z - h / 2 + 0.5;
        if (ch === '#') walls.push({ x: wx, z: wz, hw: 0.5, hh: 0.5 });
        if (ch === 'S') start = { x: wx, z: wz };
        if (ch === 'G') goal = { x: wx, z: wz };
        if (ch === 'O') holes.push({ x: wx, z: wz, r: 0.34 });
        if (ch === 'I') ice.push({ x: wx, z: wz, hw: 0.5, hh: 0.5 });
        if (ch === 'C') checkpoints.push({ x: wx, z: wz });
        if ('<>^v'.indexOf(ch) >= 0) {
          const dir = ch === '>' ? [1, 0] : ch === '<' ? [-1, 0] : ch === '^' ? [0, -1] : [0, 1];
          pads.push({ x: wx, z: wz, dx: dir[0], dz: dir[1] });
        }
        if (ch === 'B') bars.push({ x: wx, z: wz, len: 2.0, thick: 0.18, phase: (x + z) * 0.41, speed: 1.25 });
      }
    }
    return { def, rows, w, h, cells, walls, holes, pads, ice, bars, start, goal, checkpoints };
  };

  RollMazeGame.prototype.restartStage = function (n) {
    this.stageIndex = clamp((n || this.stageIndex + 1) - 1, 0, C.STAGES.length - 1);
    this.stage = this.parseStage(C.STAGES[this.stageIndex]);
    this.ball = { x: this.stage.start.x, z: this.stage.start.z, y: C.BALL_R, vx: 0, vz: 0, spinX: 0, spinZ: 0 };
    this.checkpoint = { x: this.ball.x, z: this.ball.z };
    this.timeMs = 0;
    this.falls = 0;
    this.mode = 'play';
    this.paused = false;
    this.fallT = 0;
    this.goalT = 0;
    this.acc = 0;
    this.targetTiltX = this.targetTiltZ = this.tiltX = this.tiltZ = 0;
    this.emit('stage', { stage: this.stageIndex + 1 });
  };

  RollMazeGame.prototype.setMode = function (m) { this.mode = m; this.emit('mode', { mode: m }); };
  RollMazeGame.prototype.setTilt = function (x, z) {
    this.targetTiltX = clamp(x || 0, -C.MAX_TILT, C.MAX_TILT);
    this.targetTiltZ = clamp(z || 0, -C.MAX_TILT, C.MAX_TILT);
  };
  RollMazeGame.prototype.restart = function () { this.restartStage(this.stageIndex + 1); };
  RollMazeGame.prototype.selectStage = function (n) {
    if (n <= this.unlocked) this.restartStage(n);
  };

  RollMazeGame.prototype.update = function (dtMs) {
    dtMs = Math.min(Math.max(dtMs || 0, 0), 100);
    if (this.paused || this.mode === 'select' || this.mode === 'result') return;
    this.acc += dtMs;
    while (this.acc >= C.STEP_MS) {
      this.step(C.STEP_MS);
      this.acc -= C.STEP_MS;
    }
  };

  RollMazeGame.prototype.step = function (dtMs) {
    const dt = dtMs / 1000;
    if (this.mode === 'fall') return this.stepFall(dtMs);
    if (this.mode === 'goal') return this.stepGoal(dtMs);
    this.timeMs += dtMs;
    const smooth = 1 - Math.exp(-C.TILT_RESPONSE * dt);
    this.tiltX = lerp(this.tiltX, this.targetTiltX, smooth);
    this.tiltZ = lerp(this.tiltZ, this.targetTiltZ, smooth);
    const b = this.ball;
    let friction = this.onIce(b.x, b.z) ? C.ICE_FRICTION : C.BASE_FRICTION;
    b.vx += C.GRAVITY * Math.sin(this.tiltZ) * dt;
    b.vz += C.GRAVITY * Math.sin(this.tiltX) * dt;
    this.applyPads(dt);
    b.vx *= Math.max(0, 1 - friction * dt);
    b.vz *= Math.max(0, 1 - friction * dt);
    const sp = len(b.vx, b.vz);
    if (sp > C.MAX_SPEED) {
      b.vx = b.vx / sp * C.MAX_SPEED;
      b.vz = b.vz / sp * C.MAX_SPEED;
    }
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.spinZ -= b.vx * dt / C.BALL_R;
    b.spinX += b.vz * dt / C.BALL_R;
    this.solveWalls();
    this.solveBars();
    this.checkCheckpoints();
    this.checkHazards();
    this.checkGoal();
  };

  RollMazeGame.prototype.onIce = function (x, z) {
    const list = this.stage.ice;
    for (let i = 0; i < list.length; i++) if (Math.abs(x - list[i].x) < 0.5 && Math.abs(z - list[i].z) < 0.5) return true;
    return false;
  };
  RollMazeGame.prototype.applyPads = function (dt) {
    const b = this.ball, pads = this.stage.pads;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (Math.abs(b.x - p.x) < 0.46 && Math.abs(b.z - p.z) < 0.46) {
        b.vx += p.dx * 8.5 * dt;
        b.vz += p.dz * 8.5 * dt;
        this.emit('pad', { x: p.x, z: p.z, dx: p.dx, dz: p.dz });
      }
    }
  };

  RollMazeGame.prototype.solveWalls = function () {
    const walls = this.stage.walls;
    for (let i = 0; i < walls.length; i++) this.resolveAabb(walls[i]);
  };
  RollMazeGame.prototype.resolveAabb = function (box) {
    const b = this.ball;
    const qx = clamp(b.x, box.x - box.hw, box.x + box.hw);
    const qz = clamp(b.z, box.z - box.hh, box.z + box.hh);
    let dx = b.x - qx, dz = b.z - qz;
    let d = len(dx, dz);
    if (d >= C.BALL_R || d < EPS) {
      if (d >= C.BALL_R) return;
      const ox = (box.hw + C.BALL_R) - Math.abs(b.x - box.x);
      const oz = (box.hh + C.BALL_R) - Math.abs(b.z - box.z);
      if (ox < oz) { dx = b.x < box.x ? -1 : 1; dz = 0; d = 1; }
      else { dx = 0; dz = b.z < box.z ? -1 : 1; d = 1; }
    }
    const nx = dx / d, nz = dz / d;
    const push = C.BALL_R - d;
    b.x += nx * push;
    b.z += nz * push;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      b.vx -= (1 + C.WALL_RESTITUTION) * vn * nx;
      b.vz -= (1 + C.WALL_RESTITUTION) * vn * nz;
      this.emit('hit', { strength: Math.min(1, -vn / 5), x: b.x, z: b.z });
    }
  };

  RollMazeGame.prototype.solveBars = function () {
    const t = this.timeMs / 1000;
    for (let i = 0; i < this.stage.bars.length; i++) {
      const bar = this.stage.bars[i];
      const a = t * bar.speed + bar.phase;
      const ca = Math.cos(a), sa = Math.sin(a);
      const b = this.ball;
      const lx = (b.x - bar.x) * ca + (b.z - bar.z) * sa;
      const lz = -(b.x - bar.x) * sa + (b.z - bar.z) * ca;
      const qx = clamp(lx, -bar.len / 2, bar.len / 2);
      const qz = clamp(lz, -bar.thick / 2, bar.thick / 2);
      let dx = lx - qx, dz = lz - qz;
      let d = len(dx, dz);
      if (d < C.BALL_R && d > EPS) {
        const nx = (dx / d) * ca - (dz / d) * sa;
        const nz = (dx / d) * sa + (dz / d) * ca;
        b.x += nx * (C.BALL_R - d);
        b.z += nz * (C.BALL_R - d);
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0.8) {
          b.vx += nx * (0.8 - vn) + -sa * 0.45;
          b.vz += nz * (0.8 - vn) + ca * 0.45;
          this.emit('hit', { strength: 0.45, x: b.x, z: b.z });
        }
      }
    }
  };

  RollMazeGame.prototype.cellAt = function (x, z) {
    const cx = Math.floor(x + this.stage.w / 2);
    const cz = Math.floor(z + this.stage.h / 2);
    if (cz < 0 || cz >= this.stage.h || cx < 0 || cx >= this.stage.w) return ' ';
    return this.stage.cells[cz][cx] || ' ';
  };
  RollMazeGame.prototype.checkHazards = function () {
    const b = this.ball;
    if (this.cellAt(b.x, b.z) === ' ') return this.beginFall('void');
    for (let i = 0; i < this.stage.holes.length; i++) {
      const h = this.stage.holes[i];
      if (len(b.x - h.x, b.z - h.z) < h.r) return this.beginFall('hole', h);
    }
  };
  RollMazeGame.prototype.beginFall = function (kind, h) {
    if (this.mode === 'fall') return;
    this.mode = 'fall';
    this.fallT = 0;
    this.fallStart = { x: this.ball.x, z: this.ball.z, y: this.ball.y };
    this.fallTarget = h ? { x: h.x, z: h.z } : { x: this.ball.x, z: this.ball.z };
    this.ball.vx = this.ball.vz = 0;
    this.falls++;
    this.emit('fall', { kind: kind, x: this.fallTarget.x, z: this.fallTarget.z });
  };
  RollMazeGame.prototype.stepFall = function (dtMs) {
    this.fallT += dtMs;
    const t = clamp(this.fallT / C.FALL_MS, 0, 1);
    const e = t * t * (3 - 2 * t);
    this.ball.x = lerp(this.fallStart.x, this.fallTarget.x, e);
    this.ball.z = lerp(this.fallStart.z, this.fallTarget.z, e);
    this.ball.y = lerp(C.BALL_R, -0.9, e);
    if (this.fallT >= C.FALL_MS) {
      this.ball.x = this.checkpoint.x;
      this.ball.z = this.checkpoint.z;
      this.ball.y = C.BALL_R;
      this.ball.vx = this.ball.vz = 0;
      this.mode = 'play';
      this.emit('respawn', { x: this.ball.x, z: this.ball.z });
    }
  };
  RollMazeGame.prototype.checkCheckpoints = function () {
    for (let i = 0; i < this.stage.checkpoints.length; i++) {
      const c = this.stage.checkpoints[i];
      if (len(this.ball.x - c.x, this.ball.z - c.z) < 0.35 && (this.checkpoint.x !== c.x || this.checkpoint.z !== c.z)) {
        this.checkpoint = { x: c.x, z: c.z };
        this.emit('checkpoint', { x: c.x, z: c.z });
      }
    }
  };
  RollMazeGame.prototype.checkGoal = function () {
    if (len(this.ball.x - this.stage.goal.x, this.ball.z - this.stage.goal.z) < 0.36) {
      this.mode = 'goal';
      this.goalT = 0;
      this.ball.vx = this.ball.vz = 0;
      const stars = this.calcStars(this.timeMs, this.stage.def.par);
      const id = String(this.stageIndex + 1);
      const prev = this.records[id] || {};
      this.records[id] = {
        bestMs: prev.bestMs ? Math.min(prev.bestMs, Math.round(this.timeMs)) : Math.round(this.timeMs),
        stars: Math.max(prev.stars || 0, stars),
        falls: prev.falls == null ? this.falls : Math.min(prev.falls, this.falls)
      };
      this.saveRecords();
      this.unlocked = this.computeUnlocked();
      this.emit('goal', { timeMs: this.timeMs, stars: stars, falls: this.falls });
    }
  };
  RollMazeGame.prototype.stepGoal = function (dtMs) {
    this.goalT += dtMs;
    if (this.goalT > 1500) this.mode = 'result';
  };
  RollMazeGame.prototype.calcStars = function (ms, par) {
    const sec = ms / 1000;
    if (sec <= par) return 3;
    if (sec <= par * 1.5) return 2;
    return 1;
  };
  RollMazeGame.prototype.forceWin = function () { this.ball.x = this.stage.goal.x; this.ball.z = this.stage.goal.z; this.checkGoal(); };
  RollMazeGame.prototype.forceFall = function () { this.beginFall('debug'); };
  RollMazeGame.prototype.setBall = function (x, z) { this.ball.x = x; this.ball.z = z; this.ball.y = C.BALL_R; this.ball.vx = this.ball.vz = 0; };
  RollMazeGame.prototype.stars = function () { return JSON.parse(JSON.stringify(this.records)); };
  RollMazeGame.prototype.dump = function () {
    const out = [];
    const bx = Math.floor(this.ball.x + this.stage.w / 2), bz = Math.floor(this.ball.z + this.stage.h / 2);
    for (let z = 0; z < this.stage.h; z++) {
      let line = '';
      for (let x = 0; x < this.stage.w; x++) line += (x === bx && z === bz) ? '@' : (this.stage.cells[z][x] || ' ');
      out.push(line);
    }
    return out.join('\n');
  };
  RollMazeGame.prototype.getState = function () {
    return {
      mode: this.mode,
      paused: this.paused,
      stage: this.stageIndex + 1,
      stageName: this.stage.def.name,
      unlocked: this.unlocked,
      timeMs: Math.round(this.timeMs),
      time: this.timeMs / 1000,
      par: this.stage.def.par,
      falls: this.falls,
      ball: { x: this.ball.x, y: this.ball.y, z: this.ball.z, vx: this.ball.vx, vz: this.ball.vz, spinX: this.ball.spinX, spinZ: this.ball.spinZ },
      tilt: { x: this.tiltX, z: this.tiltZ, targetX: this.targetTiltX, targetZ: this.targetTiltZ },
      board: { w: this.stage.w, h: this.stage.h, rows: this.stage.rows.slice() },
      goal: this.stage.goal,
      records: this.records
    };
  };

  window.RollMazeGame = RollMazeGame;
})();
