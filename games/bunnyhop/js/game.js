// ゲームロジック本体。DOM/Canvas非依存 — update(dtMs) で決定論的に進む。
// 依存: constants.js, level.js（読み込み順は index.html 参照）
class Game {
  constructor() {
    this.level = buildLevel();
    this.listeners = [];
    this.state = 'title'; // title | playing | paused | dead | finished
    this.bestTime = null; // main.js が localStorage から注入
    // 入力状態（input.js / debug.js が書き込む）
    this.ctrl = { left: false, right: false, slide: false, jump: false };
    this.resetRun();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

  resetRun() {
    this.tiles = this.level.tiles.map((row) => [...row]); // 実行時コピー（ニンジン取得で消す）
    const s = this.level.spawn;
    this.p = {
      x: s.x, y: s.y, vx: 0, vy: 0,
      w: PHYS.playerW, h: PHYS.standH,
      onGround: false, groundTime: 0, airTime: 0,
      sliding: false, slideLock: false, // slideLock: 天井が低くて立てない
      facing: 1,
    };
    this.respawn = { x: s.x, y: s.y };
    this.time = 0;
    this.deaths = 0;
    this.carrots = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.topSpeed = 0;
    this.jumpBufferT = 999;
    this.coyoteT = 999;
    this.slideBoostT = 999;
    this.deathTimer = 0;
    this.finishTime = null;
  }

  start() {
    this.resetRun();
    this.state = 'playing';
    this.emit('start');
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.emit('pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.emit('resume'); }
  }

  // --- 入力 ---
  pressJump() {
    this.ctrl.jump = true;
    this.jumpBufferT = 0;
  }

  releaseJump() {
    this.ctrl.jump = false;
    if (this.p.vy < -PHYS.jumpCut) this.p.vy = -PHYS.jumpCut; // 可変ジャンプ
  }

  // --- タイル判定 ---
  tileAt(tx, ty) {
    if (tx < 0 || tx >= this.level.w) return T_SOLID; // 左右端は壁
    if (ty < 0 || ty >= this.level.h) return T_EMPTY; // 上下は開放（下は落下死）
    return this.tiles[ty][tx];
  }

  solidAt(tx, ty) { return this.tileAt(tx, ty) === T_SOLID; }

  bodyTileRange() {
    const p = this.p;
    return {
      x0: Math.floor(p.x / TILE),
      x1: Math.floor((p.x + p.w - 0.001) / TILE),
      y0: Math.floor(p.y / TILE),
      y1: Math.floor((p.y + p.h - 0.001) / TILE),
    };
  }

  ceilingBlocked(standH) {
    // 足位置固定で高さstandHに立てるか
    const p = this.p;
    const top = p.y + p.h - standH;
    const y0 = Math.floor(top / TILE);
    const y1 = Math.floor((p.y + p.h - 0.001) / TILE);
    const x0 = Math.floor(p.x / TILE);
    const x1 = Math.floor((p.x + p.w - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, ty)) return true;
    }
    return false;
  }

  setHeight(h) {
    const p = this.p;
    p.y = p.y + p.h - h;
    p.h = h;
  }

  // --- 更新 ---
  update(dtMs) {
    const dt = Math.min(dtMs, 100) / 1000;
    if (this.state === 'dead') {
      this.time += dt;
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.doRespawn();
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt;

    // 物理は固定ステップで回す（すり抜け防止）
    const STEP = 1 / 240;
    let acc = dt;
    while (acc > 0 && this.state === 'playing') {
      const h = Math.min(acc, STEP);
      this.physics(h);
      acc -= h;
    }
  }

  physics(dt) {
    const p = this.p;
    const c = this.ctrl;
    this.jumpBufferT += dt;
    this.coyoteT += dt;
    this.slideBoostT += dt;

    // --- スライディング開始/終了 ---
    if (!p.sliding && c.slide && p.onGround && Math.abs(p.vx) >= PHYS.slideStartSpeed) {
      p.sliding = true;
      this.setHeight(PHYS.slideH);
      if (this.slideBoostT >= PHYS.slideBoostCooldown && Math.abs(p.vx) < PHYS.slideBoostMaxSpeed) {
        p.vx += Math.sign(p.vx) * PHYS.slideBoost;
        this.slideBoostT = 0;
        this.emit('slideboost');
      }
      this.emit('slide');
    }
    if (p.sliding) {
      const wantStand = !c.slide || (p.onGround && Math.abs(p.vx) < PHYS.slideMinSpeed);
      if (wantStand) {
        if (!this.ceilingBlocked(PHYS.standH)) {
          p.sliding = false;
          p.slideLock = false;
          this.setHeight(PHYS.standH);
        } else {
          p.slideLock = true; // 天井が低い間は強制継続
        }
      }
    }

    // --- 横方向の加速と摩擦 ---
    const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    if (dir !== 0) p.facing = dir;
    const accel = p.onGround ? PHYS.runAccel : PHYS.airAccel;
    if (dir !== 0) {
      const velInDir = p.vx * dir;
      if (p.sliding) {
        // スライディング中も低速の前進は可能（低トンネル内で詰まないため）
        if (velInDir < PHYS.crawlMax) {
          p.vx = dir * Math.min(velInDir + PHYS.crawlAccel * dt, PHYS.crawlMax);
        }
      } else if (velInDir < PHYS.maxRun) {
        // 入力加速では maxRun を超えない（超過分はバニーホップでのみ得られる）
        p.vx = dir * Math.min(velInDir + accel * dt, PHYS.maxRun);
      }
    }
    if (p.onGround && p.groundTime > PHYS.frictionGrace) {
      if (p.sliding) {
        p.vx = applyFriction(p.vx, PHYS.frictionSlide * dt);
      } else {
        if (dir === 0) p.vx = applyFriction(p.vx, PHYS.frictionGround * dt);
        // 立ち状態で maxRun 超過なら減速（スライディングしないと速度を維持できない）
        if (Math.abs(p.vx) > PHYS.maxRun) {
          p.vx = Math.sign(p.vx) * Math.max(PHYS.maxRun, Math.abs(p.vx) - PHYS.overspeedDecay * dt);
        }
      }
    }
    p.vx = Math.max(-PHYS.maxSpeed, Math.min(PHYS.maxSpeed, p.vx));

    // --- ジャンプ（先行入力＋コヨーテタイム） ---
    const canJump = p.onGround || this.coyoteT <= PHYS.coyote;
    if (this.jumpBufferT <= PHYS.jumpBuffer && canJump) {
      this.jumpBufferT = 999;
      this.coyoteT = 999;
      p.vy = -PHYS.jumpVel;
      const isBhop = p.sliding && p.groundTime <= PHYS.bhopWindow;
      if (isBhop) {
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        p.vx += Math.sign(p.vx || p.facing) * PHYS.bhopBonus;
        p.vx = Math.max(-PHYS.maxSpeed, Math.min(PHYS.maxSpeed, p.vx));
        this.emit('bhop', { combo: this.combo, speed: Math.abs(p.vx) });
      } else {
        this.emit('jump');
      }
      p.onGround = false;
      p.groundTime = 0;
    }

    // --- 重力 ---
    p.vy += PHYS.gravity * dt;
    p.vy = Math.min(p.vy, 1200);

    // --- 移動と衝突（X→Yの順） ---
    this.moveX(p.vx * dt);
    const wasAirborne = !p.onGround;
    this.moveY(p.vy * dt);

    if (p.onGround) {
      if (wasAirborne) {
        this.emit('land', { impact: this.lastImpact ?? 0, speed: Math.abs(p.vx) });
        this.coyoteT = 999;
        p.groundTime = 0;
      }
      p.groundTime += dt;
      p.airTime = 0;
      this.coyoteT = 0;
      if (p.groundTime > PHYS.comboResetTime && this.combo > 0) {
        this.combo = 0;
        this.emit('combobreak');
      }
    } else {
      p.airTime += dt;
      p.groundTime = 0;
    }

    this.topSpeed = Math.max(this.topSpeed, Math.abs(p.vx));

    // --- タイルギミック ---
    this.checkTriggers();

    // --- 落下死 ---
    if (p.y > this.level.h * TILE + 100) this.die('fall');
  }

  moveX(dx) {
    const p = this.p;
    p.x += dx;
    const r = this.bodyTileRange();
    if (dx > 0) {
      for (let ty = r.y0; ty <= r.y1; ty++) {
        if (this.solidAt(r.x1, ty)) {
          p.x = r.x1 * TILE - p.w;
          if (Math.abs(p.vx) > 400) this.emit('wallhit');
          p.vx = 0;
          break;
        }
      }
    } else if (dx < 0) {
      for (let ty = r.y0; ty <= r.y1; ty++) {
        if (this.solidAt(r.x0, ty)) {
          p.x = (r.x0 + 1) * TILE;
          p.vx = 0;
          break;
        }
      }
    }
  }

  moveY(dy) {
    const p = this.p;
    p.y += dy;
    const r = this.bodyTileRange();
    p.onGround = false;
    if (dy > 0) {
      for (let tx = r.x0; tx <= r.x1; tx++) {
        if (this.solidAt(tx, r.y1)) {
          p.y = r.y1 * TILE - p.h;
          this.lastImpact = p.vy;
          p.vy = 0;
          p.onGround = true;
          break;
        }
      }
    } else if (dy < 0) {
      for (let tx = r.x0; tx <= r.x1; tx++) {
        if (this.solidAt(tx, r.y0)) {
          p.y = (r.y0 + 1) * TILE;
          p.vy = 0;
          break;
        }
      }
    }
    // 静止中も接地を維持（1px下を探査）
    if (!p.onGround && p.vy >= 0) {
      const y1 = Math.floor((p.y + p.h + 0.5) / TILE);
      for (let tx = r.x0; tx <= r.x1; tx++) {
        if (this.solidAt(tx, y1) && (y1 * TILE - (p.y + p.h)) < 0.6) {
          p.onGround = true;
          break;
        }
      }
    }
  }

  checkTriggers() {
    const p = this.p;
    const r = this.bodyTileRange();
    for (let ty = Math.max(r.y0, 0); ty <= Math.min(r.y1, this.level.h - 1); ty++) {
      for (let tx = Math.max(r.x0, 0); tx <= Math.min(r.x1, this.level.w - 1); tx++) {
        const t = this.tiles[ty][tx];
        if (t === T_SPIKE) {
          // トゲの当たり判定は小さめ（理不尽さ回避）
          const sx = tx * TILE + 7, sy = ty * TILE + 14, sw = 18, sh = 18;
          if (p.x < sx + sw && p.x + p.w > sx && p.y < sy + sh && p.y + p.h > sy) {
            this.die('spike');
            return;
          }
        } else if (t === T_CARROT) {
          this.tiles[ty][tx] = T_EMPTY;
          this.carrots++;
          this.emit('carrot', { x: tx, y: ty, count: this.carrots });
        } else if (t === T_CHECK) {
          const rx = tx * TILE, ry = (ty + 1) * TILE - PHYS.standH;
          if (this.respawn.x !== rx || this.respawn.y !== ry) {
            this.respawn = { x: rx, y: ry };
            this.emit('checkpoint', { x: tx, y: ty });
          }
        } else if (t === T_GOAL) {
          this.finishTime = this.time;
          this.state = 'finished';
          this.emit('finish', {
            time: this.time, deaths: this.deaths,
            carrots: this.carrots, total: this.level.totalCarrots,
            maxCombo: this.maxCombo, topSpeed: Math.round(this.topSpeed),
          });
          return;
        }
      }
    }
  }

  die(cause) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.deathTimer = DEATH_TIME;
    this.deaths++;
    this.combo = 0;
    this.emit('death', { cause, x: this.p.x, y: this.p.y });
  }

  doRespawn() {
    const p = this.p;
    p.x = this.respawn.x;
    p.y = this.respawn.y;
    p.vx = 0; p.vy = 0;
    p.sliding = false; p.slideLock = false;
    p.h = PHYS.standH;
    p.onGround = false;
    this.state = 'playing';
    this.emit('respawn');
  }

  // --- デバッグ/検証用 ---
  getSnapshot() {
    const p = this.p;
    return {
      state: this.state,
      x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx), vy: Math.round(p.vy),
      onGround: p.onGround, sliding: p.sliding, slideLock: p.slideLock,
      groundTime: Math.round(p.groundTime * 1000),
      combo: this.combo, maxCombo: this.maxCombo,
      time: Math.round(this.time * 1000) / 1000,
      deaths: this.deaths, carrots: this.carrots, totalCarrots: this.level.totalCarrots,
      topSpeed: Math.round(this.topSpeed),
      respawn: { ...this.respawn },
      tile: { x: Math.floor((p.x + p.w / 2) / TILE), y: Math.floor((p.y + p.h / 2) / TILE) },
    };
  }

  // プレイヤー周辺のASCIIマップ（R=プレイヤー, X=地形, ^=トゲ, o=ニンジン, C=CP, G=ゴール）
  dump(radius = 16) {
    const chars = { [T_EMPTY]: '.', [T_SOLID]: 'X', [T_SPIKE]: '^', [T_CARROT]: 'o', [T_CHECK]: 'C', [T_GOAL]: 'G' };
    const px = Math.floor((this.p.x + this.p.w / 2) / TILE);
    const py = Math.floor((this.p.y + this.p.h / 2) / TILE);
    const out = [];
    for (let y = 0; y < this.level.h; y++) {
      let line = '';
      for (let x = Math.max(0, px - radius); x <= Math.min(this.level.w - 1, px + radius); x++) {
        line += (x === px && y === py) ? 'R' : chars[this.tiles[y][x]];
      }
      out.push(line);
    }
    return out.join('\n');
  }

  teleport(tx, ty) {
    this.p.x = tx * TILE + (TILE - this.p.w) / 2;
    this.p.y = (ty + 1) * TILE - this.p.h;
    this.p.vx = 0; this.p.vy = 0;
  }

  setVel(vx, vy = this.p.vy) { this.p.vx = vx; this.p.vy = vy; }
}

function applyFriction(v, amount) {
  if (v > 0) return Math.max(0, v - amount);
  if (v < 0) return Math.min(0, v + amount);
  return 0;
}
