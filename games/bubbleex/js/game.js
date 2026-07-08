(function () {
  'use strict';

  var C = window.BubbleExConstants;

  // ---- Hex offset grid helpers -------------------------------------------
  // Even rows (0,2,4,...): COLS cells, x = col*CELL + CELL/2
  // Odd rows  (1,3,5,...): COLS-1 cells, x = col*CELL + CELL   (shifted half-cell right)
  function rowColCount(row) {
    return (row % 2 === 0) ? C.COLS : C.COLS - 1;
  }
  function cellX(row, col) {
    return (row % 2 === 0) ? (col * C.CELL + C.CELL / 2) : (col * C.CELL + C.CELL);
  }
  function cellY(row) {
    return row * C.ROW_H + C.CELL / 2;
  }
  // Neighbor offsets (row, col) for even and odd rows, 6 directions.
  var NEI_EVEN = [
    [0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]
  ];
  var NEI_ODD = [
    [0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]
  ];
  function neighbors(row, col) {
    var offs = (row % 2 === 0) ? NEI_EVEN : NEI_ODD;
    var out = [];
    for (var i = 0; i < offs.length; i++) {
      var nr = row + offs[i][0];
      var nc = col + offs[i][1];
      if (nr < 0 || nr >= C.ROWS) continue;
      if (nc < 0 || nc >= rowColCount(nr)) continue;
      out.push([nr, nc]);
    }
    return out;
  }

  function key(r, c) { return r * 64 + c; }

  function nearestCell(x, y) {
    // Search the 2 candidate rows around y and pick closest cell center.
    var approxRow = Math.round((y - C.CELL / 2) / C.ROW_H);
    var best = null, bestD = Infinity;
    for (var dr = -1; dr <= 1; dr++) {
      var row = approxRow + dr;
      if (row < 0 || row >= C.ROWS) continue;
      var n = rowColCount(row);
      for (var col = 0; col < n; col++) {
        var cx = cellX(row, col), cy = cellY(row);
        var dx = cx - x, dy = cy - y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = [row, col]; }
      }
    }
    return best;
  }

  // ---- Game -----------------------------------------------------------
  function BubbleExGame(opts) {
    opts = opts || {};
    this.rng = new window.BubbleExRng(opts.seed || 1);
    this.listeners = [];
    this.reset(opts.stage || 1);
  }

  BubbleExGame.prototype.on = function (fn) { this.listeners.push(fn); };
  BubbleExGame.prototype.emit = function (type, data) {
    for (var i = 0; i < this.listeners.length; i++) {
      try { this.listeners[i](type, data); } catch (e) { console.error('event handler error', type, e); }
    }
  };

  BubbleExGame.prototype.reset = function (stageNum) {
    this.stage = stageNum || 1;
    this.score = this.score || 0;
    this.best = this.best || 0;
    this.grid = {}; // key -> color string
    this.shotsFired = 0;
    this.status = 'title'; // title | aiming | flying | resolving | stageclear | gameover | paused
    this.paused = false;
    this.ceilingOffsetRows = 0; // how many rows ceiling has descended (visual/logic shift)
    this.mute = false;
    this.buildStage(this.stage);
    this.current = this.drawColor();
    this.next = this.drawColor();
    this.shot = null; // {x,y,vx,vy,color}
    this.aimDeg = 0;
    this.particles = [];
    this.cutIn = null; // {text, t, dur}
    this.comboMult = 1;
    this.emit('reset', { stage: this.stage });
  };

  BubbleExGame.prototype.stageConf = function (n) {
    var s = C.STAGES[Math.min(n, C.STAGES.length) - 1];
    return s || C.STAGES[C.STAGES.length - 1];
  };

  BubbleExGame.prototype.buildStage = function (n) {
    var conf = this.stageConf(n);
    this.grid = {};
    this.shotsToNextDrop = conf.shotsPerDrop;
    this.shotsSinceDrop = 0;
    var palette = C.COLORS.slice(0, conf.colors);
    var rng = new window.BubbleExRng(1000 + n * 97 + (this.rng ? Math.floor(this.rng.next() * 1) : 0));
    // Deterministic per-stage layout: seeded by stage id only, so validate() is stable.
    var layoutRng = new window.BubbleExRng(5000 + n * 131);
    for (var row = 0; row < conf.rows; row++) {
      var count = rowColCount(row);
      for (var col = 0; col < count; col++) {
        if (layoutRng.next() < conf.density) {
          this.grid[key(row, col)] = palette[layoutRng.int(palette.length)];
        }
      }
    }
    this.ensureSolvable(conf, palette, layoutRng);
    this.paletteSize = conf.colors;
  };

  // Guarantee every color placed has >=3 cells so no color is unpoppable from the start.
  BubbleExGame.prototype.ensureSolvable = function (conf, palette, rng) {
    var counts = {};
    var keys = Object.keys(this.grid);
    keys.forEach((k) => { counts[this.grid[k]] = (counts[this.grid[k]] || 0) + 1; });
    var sparse = Object.keys(counts).filter((c) => counts[c] > 0 && counts[c] < 3);
    if (sparse.length === 0) return;
    // Recolor sparse-color cells into the most populous color to remove orphan colors.
    var majorColor = palette[0];
    var maxCount = -1;
    Object.keys(counts).forEach((c) => { if (counts[c] > maxCount) { maxCount = counts[c]; majorColor = c; } });
    keys.forEach((k) => {
      if (sparse.indexOf(this.grid[k]) !== -1) this.grid[k] = majorColor;
    });
  };

  BubbleExGame.prototype.presentColors = function () {
    var set = {};
    Object.keys(this.grid).forEach((k) => { set[this.grid[k]] = true; });
    var list = Object.keys(set);
    return list.length ? list : C.COLORS.slice(0, this.paletteSize || 3);
  };

  BubbleExGame.prototype.drawColor = function () {
    var pool = this.presentColors();
    return this.rng.pick(pool);
  };

  // ---- Aiming / firing --------------------------------------------------
  BubbleExGame.prototype.setAim = function (deg) {
    if (this.status !== 'title' && this.status !== 'aiming' && this.status !== 'resolving') return;
    deg = Math.max(-C.MAX_AIM_DEG, Math.min(C.MAX_AIM_DEG, deg));
    this.aimDeg = deg;
    if (this.status === 'title') this.status = 'aiming';
  };

  BubbleExGame.prototype.launcherPos = function () {
    return { x: C.BOARD_W / 2, y: C.ROWS * C.ROW_H + C.LAUNCH_Y_OFFSET };
  };

  BubbleExGame.prototype.fire = function () {
    if (this.shot || this.status === 'gameover' || this.status === 'stageclear' || this.paused) return false;
    var pos = this.launcherPos();
    var rad = (this.aimDeg) * Math.PI / 180;
    var vx = Math.sin(rad) * C.SHOT_SPEED;
    var vy = -Math.cos(rad) * C.SHOT_SPEED;
    this.shot = { x: pos.x, y: pos.y, vx: vx, vy: vy, color: this.current };
    this.status = 'flying';
    this.emit('fire', { color: this.current, deg: this.aimDeg });
    return true;
  };

  // ---- Simulation step ----------------------------------------------------
  BubbleExGame.prototype.step = function (ms) {
    if (this.paused) return;
    if (this.cutIn) {
      this.cutIn.t += ms;
      if (this.cutIn.t >= this.cutIn.dur) this.cutIn = null;
    }
    this.updateParticles(ms);
    if (this.status !== 'flying' || !this.shot) return;
    var dt = ms / 1000;
    var remaining = dt;
    var iterations = 0;
    while (remaining > 0 && iterations < 8) {
      iterations++;
      var s = this.shot;
      var nx = s.x + s.vx * remaining;
      var ny = s.y + s.vy * remaining;
      // Wall reflection: bubble radius r must stay within [r, BOARD_W-r]
      var r = C.BUBBLE_RADIUS;
      var hitWallT = null, wallSide = null;
      if (s.vx !== 0) {
        if (nx < r) {
          var t = (r - s.x) / s.vx;
          if (t >= 0 && t <= remaining) { hitWallT = t; wallSide = 'left'; }
        } else if (nx > C.BOARD_W - r) {
          var t2 = (C.BOARD_W - r - s.x) / s.vx;
          if (t2 >= 0 && t2 <= remaining) { hitWallT = t2; wallSide = 'right'; }
        }
      }
      if (hitWallT !== null) {
        s.x = s.x + s.vx * hitWallT;
        s.y = s.y + s.vy * hitWallT;
        s.vx = -s.vx;
        remaining -= hitWallT;
        this.emit('wallbounce', { x: s.x, y: s.y });
        continue;
      }
      // Ceiling hit
      if (ny < C.BUBBLE_RADIUS) {
        var tCeil = (C.BUBBLE_RADIUS - s.y) / s.vy;
        s.x = s.x + s.vx * tCeil;
        s.y = C.BUBBLE_RADIUS;
        this.settleShot();
        return;
      }
      // Collision with existing bubbles
      var hit = this.findCollision(s.x, s.y, nx, ny);
      if (hit) {
        s.x = hit.x; s.y = hit.y;
        this.settleShot();
        return;
      }
      s.x = nx; s.y = ny;
      remaining = 0;
    }
  };

  BubbleExGame.prototype.findCollision = function (x0, y0, x1, y1) {
    var r = C.BUBBLE_RADIUS;
    var minDist2 = (r * 2) * (r * 2);
    var steps = 6;
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var x = x0 + (x1 - x0) * t;
      var y = y0 + (y1 - y0) * t;
      var keys = Object.keys(this.grid);
      for (var k = 0; k < keys.length; k++) {
        var kk = keys[k];
        var row = Math.floor(kk / 64), col = kk % 64;
        var cx = cellX(row, col), cy = cellY(row);
        var dx = cx - x, dy = cy - y;
        if (dx * dx + dy * dy <= minDist2) {
          return { x: x, y: y };
        }
      }
    }
    return null;
  };

  BubbleExGame.prototype.settleShot = function () {
    var s = this.shot;
    var cell = this.snapCell(s.x, s.y);
    this.grid[key(cell[0], cell[1])] = s.color;
    this.emit('snap', { row: cell[0], col: cell[1], color: s.color, x: cellX(cell[0], cell[1]), y: cellY(cell[0]) });
    this.shot = null;
    this.status = 'resolving';
    this.resolvePops(cell[0], cell[1]);
  };

  // Find nearest EMPTY cell to (x,y), preferring the actual nearest grid slot.
  BubbleExGame.prototype.snapCell = function (x, y) {
    var approxRow = Math.max(0, Math.round((y - C.CELL / 2) / C.ROW_H));
    var best = null, bestD = Infinity;
    for (var dr = -2; dr <= 2; dr++) {
      var row = approxRow + dr;
      if (row < 0 || row >= C.ROWS) continue;
      var n = rowColCount(row);
      for (var col = 0; col < n; col++) {
        var kk = key(row, col);
        if (this.grid[kk]) continue;
        var cx = cellX(row, col), cy = cellY(row);
        var dx = cx - x, dy = cy - y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = [row, col]; }
      }
    }
    if (!best) best = nearestCell(x, y);
    return best;
  };

  BubbleExGame.prototype.floodSameColor = function (row, col) {
    var color = this.grid[key(row, col)];
    if (!color) return [];
    var seen = {};
    var stack = [[row, col]];
    var out = [];
    seen[key(row, col)] = true;
    while (stack.length) {
      var cur = stack.pop();
      out.push(cur);
      var ns = neighbors(cur[0], cur[1]);
      for (var i = 0; i < ns.length; i++) {
        var nr = ns[i][0], nc = ns[i][1];
        var kk = key(nr, nc);
        if (seen[kk]) continue;
        if (this.grid[kk] === color) {
          seen[kk] = true;
          stack.push([nr, nc]);
        }
      }
    }
    return out;
  };

  // BFS from all row-0 cells across existing bubbles -> ceiling-connected set.
  BubbleExGame.prototype.ceilingConnected = function () {
    var seen = {};
    var stack = [];
    for (var col = 0; col < rowColCount(0); col++) {
      var kk = key(0, col);
      if (this.grid[kk]) { stack.push([0, col]); seen[kk] = true; }
    }
    while (stack.length) {
      var cur = stack.pop();
      var ns = neighbors(cur[0], cur[1]);
      for (var i = 0; i < ns.length; i++) {
        var nr = ns[i][0], nc = ns[i][1];
        var k2 = key(nr, nc);
        if (seen[k2]) continue;
        if (this.grid[k2]) { seen[k2] = true; stack.push([nr, nc]); }
      }
    }
    return seen;
  };

  BubbleExGame.prototype.resolvePops = function (row, col) {
    var cluster = this.floodSameColor(row, col);
    var popped = [];
    var dropped = [];
    var popColor = this.grid[key(row, col)];
    if (cluster.length >= 3) {
      popped = cluster;
      cluster.forEach((c) => { delete this.grid[key(c[0], c[1])]; });
      var connected = this.ceilingConnected();
      var allKeys = Object.keys(this.grid);
      allKeys.forEach((kk) => {
        if (!connected[kk]) {
          var row2 = Math.floor(kk / 64), col2 = kk % 64;
          dropped.push([row2, col2]);
          delete this.grid[kk];
        }
      });
    }
    var comboScore = 0;
    if (popped.length) {
      var popPts = popped.length * C.SCORE.POP_BASE;
      comboScore += popPts;
      this.emit('pop', { cells: popped.map((c) => ({ row: c[0], col: c[1], x: cellX(c[0], c[1]), y: cellY(c[0]), color: popColor })), count: popped.length });
    }
    if (dropped.length) {
      var dropPts = dropped.length * C.SCORE.DROP_BASE;
      comboScore += dropPts;
      this.emit('drop', { cells: dropped.map((c) => ({ row: c[0], col: c[1], x: cellX(c[0], c[1]), y: cellY(c[0]), color: popColor })), count: dropped.length });
    }
    var totalCleared = popped.length + dropped.length;
    if (totalCleared > 0) {
      var mult = totalCleared >= 12 ? 4 : totalCleared >= 8 ? 3 : totalCleared >= 5 ? 2 : 1;
      this.comboMult = mult;
      this.score += Math.round(comboScore * mult);
      if (mult > 1) {
        this.cutIn = { text: mult + ' COMBO!!', t: 0, dur: 1100 };
        this.emit('combo', { mult: mult });
      }
    } else {
      this.comboMult = 1;
    }
    if (this.score > this.best) this.best = this.score;

    this.shotsFired++;
    this.shotsSinceDrop++;
    if (this.shotsSinceDrop >= this.shotsToNextDrop) {
      this.shotsSinceDrop = 0;
      this.descendCeiling();
    }

    if (this.isBoardClear()) {
      this.onStageClear();
      return;
    }
    if (this.isGameOver()) {
      this.onGameOver();
      return;
    }

    this.current = this.next;
    this.next = this.drawColor();
    this.status = 'aiming';
  };

  BubbleExGame.prototype.descendCeiling = function () {
    var newGrid = {};
    var overflow = false;
    Object.keys(this.grid).forEach((kk) => {
      var row = Math.floor(kk / 64), col = kk % 64;
      var nr = row + 1;
      if (nr >= C.DEADLINE_ROW) overflow = true;
      if (nr < C.ROWS) newGrid[key(nr, col)] = this.grid[kk];
    });
    this.grid = newGrid;
    this.ceilingOffsetRows++;
    this.emit('ceiling', { offset: this.ceilingOffsetRows });
    if (overflow) this.forceGameOver = true;
  };

  BubbleExGame.prototype.isBoardClear = function () {
    return Object.keys(this.grid).length === 0;
  };

  BubbleExGame.prototype.isGameOver = function () {
    if (this.forceGameOver) return true;
    var keys = Object.keys(this.grid);
    for (var i = 0; i < keys.length; i++) {
      var row = Math.floor(keys[i] / 64);
      if (row >= C.DEADLINE_ROW) return true;
    }
    return false;
  };

  BubbleExGame.prototype.onStageClear = function () {
    var bonus = C.SCORE.CLEAR_BONUS + (this.shotsToNextDrop - this.shotsSinceDrop) * C.SCORE.SHOT_BONUS;
    this.score += bonus;
    if (this.score > this.best) this.best = this.score;
    this.status = 'stageclear';
    this.cutIn = { text: 'STAGE CLEAR!', t: 0, dur: 1400 };
    this.emit('stageclear', { stage: this.stage, bonus: bonus });
    this.saveScores();
  };

  BubbleExGame.prototype.onGameOver = function () {
    this.status = 'gameover';
    this.emit('gameover', { score: this.score });
    this.saveScores();
  };

  BubbleExGame.prototype.nextStage = function () {
    var n = this.stage + 1;
    if (n > C.STAGES.length) n = 1; // loop back with score kept
    this.forceGameOver = false;
    this.stage = n;
    this.buildStage(n);
    this.current = this.drawColor();
    this.next = this.drawColor();
    this.shot = null;
    this.status = 'aiming';
    this.cutIn = { text: 'READY... GO!!', t: 0, dur: 1000 };
    this.emit('stagestart', { stage: n });
  };

  BubbleExGame.prototype.restart = function () {
    this.score = 0;
    this.forceGameOver = false;
    this.reset(1);
    this.cutIn = { text: 'READY... GO!!', t: 0, dur: 1000 };
    this.status = 'aiming';
  };

  BubbleExGame.prototype.saveScores = function () {
    try {
      var raw = localStorage.getItem('bubbleex_best');
      var prevBest = raw ? parseInt(raw, 10) : 0;
      if (this.score > prevBest) localStorage.setItem('bubbleex_best', String(this.score));
      this.best = Math.max(this.score, prevBest);
    } catch (e) { /* ignore storage errors */ }
  };

  BubbleExGame.prototype.loadBest = function () {
    try {
      var raw = localStorage.getItem('bubbleex_best');
      this.best = raw ? parseInt(raw, 10) : 0;
    } catch (e) { this.best = 0; }
    return this.best;
  };

  BubbleExGame.prototype.updateParticles = function (ms) {
    // Particle simulation lives in renderer for visuals; game.js only tracks nothing here.
    // (kept as no-op hook point for potential future physics-affecting particles)
  };

  BubbleExGame.prototype.togglePause = function () {
    if (this.status === 'gameover' || this.status === 'title') return;
    this.paused = !this.paused;
    this.status = this.paused ? 'paused' : (this.shot ? 'flying' : 'aiming');
    this.emit('pause', { paused: this.paused });
  };

  BubbleExGame.prototype.setMute = function (m) { this.mute = m; };

  // ---- Debug helpers -----------------------------------------------------
  BubbleExGame.prototype.getState = function () {
    var cells = [];
    Object.keys(this.grid).forEach((kk) => {
      cells.push({ row: Math.floor(kk / 64), col: kk % 64, color: this.grid[kk] });
    });
    return {
      status: this.status,
      stage: this.stage,
      score: this.score,
      best: this.best,
      current: this.current,
      next: this.next,
      aimDeg: this.aimDeg,
      shotsSinceDrop: this.shotsSinceDrop,
      shotsToNextDrop: this.shotsToNextDrop,
      shotsUntilCeiling: this.shotsToNextDrop - this.shotsSinceDrop,
      cellCount: cells.length,
      cells: cells,
      shot: this.shot ? { x: this.shot.x, y: this.shot.y, vx: this.shot.vx, vy: this.shot.vy, color: this.shot.color } : null,
      paused: this.paused,
      mute: this.mute,
      comboMult: this.comboMult
    };
  };

  BubbleExGame.prototype.dump = function () {
    var lines = [];
    var glyph = {};
    C.COLORS.forEach((c, i) => { glyph[c] = 'RBGYPO'[i] || '?'; });
    for (var row = 0; row < C.ROWS; row++) {
      var n = rowColCount(row);
      var line = (row % 2 === 1 ? ' ' : '') + '';
      var hasAny = false;
      for (var col = 0; col < n; col++) {
        var c = this.grid[key(row, col)];
        if (c) hasAny = true;
        line += (c ? glyph[c] : '.') + ' ';
      }
      if (row < C.DEADLINE_ROW || hasAny) lines.push((row === C.DEADLINE_ROW ? '---DEAD--- ' : '') + line);
    }
    return lines.join('\n');
  };

  BubbleExGame.prototype.aim = function (deg) { this.setAim(deg); return this.aimDeg; };

  BubbleExGame.prototype.setBubble = function (color) {
    if (C.COLORS.indexOf(color) === -1) return false;
    this.current = color;
    return true;
  };

  BubbleExGame.prototype.setStage = function (n) {
    n = Math.max(1, Math.min(C.STAGES.length, n | 0));
    this.forceGameOver = false;
    this.stage = n;
    this.buildStage(n);
    this.current = this.drawColor();
    this.next = this.drawColor();
    this.shot = null;
    this.status = 'aiming';
    return this.getState();
  };

  BubbleExGame.prototype.clearBoard = function () {
    this.grid = {};
    return this.getState();
  };

  BubbleExGame.prototype.win = function () {
    this.grid = {};
    this.onStageClear();
    return this.getState();
  };

  BubbleExGame.prototype.lose = function () {
    this.forceGameOver = true;
    this.onGameOver();
    return this.getState();
  };

  // Compute the launch angle (deg) that makes a straight-or-single-bounce shot hit target cell center.
  // Used by debug shootAt(); tries direct shot then single-wall-bounce mirrored shot.
  BubbleExGame.prototype.angleForTarget = function (row, col) {
    var pos = this.launcherPos();
    var tx = cellX(row, col), ty = cellY(row);
    var dx = tx - pos.x, dy = ty - pos.y;
    var directDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (Math.abs(directDeg) <= C.MAX_AIM_DEG) return directDeg;
    // mirror across left or right wall once
    var mirroredLeft = -tx; // reflect target across x=0
    var dxL = mirroredLeft - pos.x;
    var degL = Math.atan2(dxL, -dy) * 180 / Math.PI;
    if (Math.abs(degL) <= C.MAX_AIM_DEG) return degL;
    var mirroredRight = 2 * C.BOARD_W - tx;
    var dxR = mirroredRight - pos.x;
    var degR = Math.atan2(dxR, -dy) * 180 / Math.PI;
    return degR;
  };

  BubbleExGame.prototype.shootAt = function (row, col) {
    var kk = key(row, col);
    if (this.grid[kk]) return false; // occupied, can't target
    var deg = this.angleForTarget(row, col);
    this.setAim(deg);
    this.fire();
    // Run simulation forward deterministically until it settles (bounded iterations).
    var guard = 0;
    while (this.status === 'flying' && guard < 2000) {
      this.step(8);
      guard++;
    }
    return this.getState();
  };

  BubbleExGame.prototype.validateStage = function (n) {
    var savedGrid = this.grid, savedStage = this.stage, savedShots = this.shotsToNextDrop, savedSince = this.shotsSinceDrop;
    this.buildStage(n);
    var counts = {};
    var deadlineViolation = false;
    Object.keys(this.grid).forEach((kk) => {
      var color = this.grid[kk];
      counts[color] = (counts[color] || 0) + 1;
      var row = Math.floor(kk / 64);
      if (row >= C.DEADLINE_ROW) deadlineViolation = true;
    });
    var allColorsOk = Object.keys(counts).every((c) => counts[c] >= 3);
    var ok = allColorsOk && !deadlineViolation && Object.keys(this.grid).length > 0;
    var result = { stage: n, ok: ok, colorCounts: counts, deadlineViolation: deadlineViolation };
    this.grid = savedGrid; this.stage = savedStage; this.shotsToNextDrop = savedShots; this.shotsSinceDrop = savedSince;
    return result;
  };

  BubbleExGame.prototype.validate = function () {
    var results = [];
    for (var i = 1; i <= C.STAGES.length; i++) results.push(this.validateStage(i));
    var allOk = results.every((r) => r.ok);
    return { allOk: allOk, results: results };
  };

  window.BubbleExGame = BubbleExGame;
  window.BubbleExGridHelpers = { rowColCount, cellX, cellY, neighbors, key, nearestCell };
})();
